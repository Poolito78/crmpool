/**
 * Sociétés et société ACTIVE de la session (multi-société).
 *
 * - Un compte non administrateur est rattaché à UNE société
 *   (`utilisateur_societes`, ISOSIGN par défaut) : elle est sa société active,
 *   sans choix possible. La base fait de même par RLS.
 * - L'administrateur choisit la société active dans l'en-tête, ou « Toutes ».
 *   Son choix est retenu dans le navigateur.
 *
 * Les listes de documents (devis, commandes, factures) sont filtrées sur la
 * société active par `StoreProvider` ; un nouveau document prend la société
 * active (ISOSIGN quand l'admin est sur « Toutes »).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useAuth';
import {
  dbToSociete, societeToDb, serie, societeDuDocument, marqueDe, logoDe, lignesLegales,
  LEGAL_ISOSIGN_DEFAUT, LOGO_DEFAUT, type Societe, type Marque,
} from '@/lib/societes';

const CLE_ACTIVE = 'crmpool_societe_active';
/** Valeur de l'admin qui voit toutes les sociétés. */
export const TOUTES = 'toutes';

interface SocietesState {
  societes: Societe[];
  /** Société active, ou `undefined` quand l'admin est sur « Toutes ». */
  active: Societe | undefined;
  /** Société que prend un nouveau document. */
  pourNouveau: Societe | undefined;
  /** L'admin voit toutes les sociétés à la fois. */
  toutes: boolean;
  idIsosign: string | undefined;
  /** Société de rattachement de l'utilisateur (non admin). */
  maSociete: Societe | undefined;
  choisir: (id: string) => void;
  peutChoisir: boolean;
  charge: boolean;
  enregistrer: (s: Societe) => Promise<boolean>;
  recharger: () => Promise<void>;
  /**
   * Préfixe de série d'un document : `serieDe('DEV')` → « DEV-2026 » chez
   * ISOSIGN, « SIG-DEV-2026 » chez SIGNALISE. `societeId` = société du
   * document d'origine (commande d'un devis…) ; absent = société d'un nouveau
   * document. `annee: false` rend la base sans l'année (« SIG-DEV »).
   */
  serieDe: (type: string, societeId?: string, annee?: number | false) => string;
}

const Ctx = createContext<SocietesState | null>(null);

export function SocietesProvider({ children }: { children: React.ReactNode }) {
  const { isAdmin, userId } = useCurrentUser();
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [maSocieteId, setMaSocieteId] = useState<string | null>(null);
  const [charge, setCharge] = useState(false);
  const [choix, setChoix] = useState<string>(() => {
    try { return localStorage.getItem(CLE_ACTIVE) || TOUTES; } catch { return TOUTES; }
  });

  const recharger = useCallback(async () => {
    if (!userId) return;
    // `as never` : la table n'est pas encore dans les types générés.
    const { data, error } = await supabase.from('societes' as never).select('*').order('ordre');
    if (error) {
      // Migration pas encore appliquée : l'application reste mono-société.
      console.warn('[societes]', error.message);
      setSocietes([]);
    } else {
      setSocietes((data as unknown[] || []).map(dbToSociete));
    }
    const { data: rat } = await supabase.from('utilisateur_societes' as never).select('societe_id').eq('user_id', userId).maybeSingle();
    setMaSocieteId((rat as { societe_id?: string } | null)?.societe_id ?? null);
    setCharge(true);
  }, [userId]);

  useEffect(() => { void recharger(); }, [recharger]);

  const idIsosign = societes.find(s => s.code === 'ISOSIGN')?.id;
  const maSociete = societes.find(s => s.id === maSocieteId) || societes.find(s => s.id === idIsosign);

  const choisir = useCallback((id: string) => {
    setChoix(id);
    try { localStorage.setItem(CLE_ACTIVE, id); } catch { /* navigation privée */ }
  }, []);

  const enregistrer = useCallback(async (s: Societe) => {
    const { error } = await supabase.from('societes' as never).upsert(societeToDb(s) as never);
    if (error) { console.error('[societes]', error.message); return false; }
    await recharger();
    return true;
  }, [recharger]);

  const value = useMemo<SocietesState>(() => {
    const actives = societes.filter(s => s.actif);
    let active: Societe | undefined;
    let toutes = false;
    if (isAdmin) {
      active = actives.find(s => s.id === choix);
      toutes = !active;
    } else {
      active = maSociete;
    }
    return {
      societes,
      active,
      pourNouveau: active || maSociete || societes.find(s => s.id === idIsosign),
      toutes: toutes && societes.length > 0,
      idIsosign,
      maSociete,
      choisir,
      peutChoisir: isAdmin && actives.length > 1,
      charge,
      enregistrer,
      recharger,
      serieDe: (type, societeId, annee) => {
        const soc = (societeId && societes.find(s => s.id === societeId)) || active || maSociete || societes.find(s => s.id === idIsosign);
        const complet = serie(soc, type, typeof annee === 'number' ? annee : undefined);
        return annee === false ? complet.replace(/-\d{4}$/, '') : complet;
      },
    };
  }, [societes, isAdmin, choix, maSociete, idIsosign, choisir, charge, enregistrer, recharger]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSocietes(): SocietesState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSocietes must be used within SocietesProvider');
  return c;
}

/**
 * Identité imprimée sur un document : société, marque, logo et pied de page.
 * Un document sans société est ISOSIGN ; sans table chargée, l'ancien
 * en-tête (logo ISOFLOOR, ligne légale ISOSIGN) reste en place.
 */
export function useIdentiteDocument(doc: { societeId?: string; marque?: string } | null | undefined): {
  societe: Societe | undefined;
  marque: Marque | undefined;
  logo: string | undefined;
  legal: [string, string];
} {
  // Toléré hors fournisseur (page publique) : l'ancien en-tête s'applique.
  const societes = useContext(Ctx)?.societes ?? [];
  return useMemo(() => {
    const societe = societeDuDocument(doc, societes);
    if (!societe) return { societe: undefined, marque: undefined, logo: LOGO_DEFAUT, legal: LEGAL_ISOSIGN_DEFAUT };
    return {
      societe,
      marque: marqueDe(societe, doc?.marque),
      logo: logoDe(societe, doc?.marque),
      legal: lignesLegales(societe, doc?.marque),
    };
  }, [doc?.societeId, doc?.marque, societes]);
}
