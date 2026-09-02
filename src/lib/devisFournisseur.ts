import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ActionPrix } from './prixAchatFournisseur';

/**
 * Les devis reçus des fournisseurs, et ce qu'on en a fait.
 *
 * Une offre de prix arrivait par courriel, était lue, parfois répercutée, et
 * disparaissait. Six mois plus tard, plus personne ne savait quel tarif avait
 * été appliqué ni ce que le fournisseur proposait d'autre. Ces enregistrements
 * gardent l'offre telle qu'elle est arrivée — et, ligne par ligne, si son prix
 * a été repercuté.
 *
 * La distinction qui compte : une ligne LUE n'est pas une ligne APPLIQUÉE.
 * Confondre les deux ferait croire qu'un tarif est en vigueur alors qu'il
 * dort dans un document.
 */

export interface LigneDevisFournisseur {
  id: string;
  devisId: string;
  ordre: number;
  /** Ce que le document dit, mot pour mot. */
  reference?: string;
  designation?: string;
  quantite?: number;
  prixAchat?: number;
  unite?: string;
  /** Article du catalogue auquel la ligne a été rattachée. */
  produitId?: string;
  action?: ActionPrix;
  applique: boolean;
  appliqueLe?: string;
}

export interface DevisFournisseur {
  id: string;
  fournisseurId?: string;
  /** Le nom lu sur le document — gardé même après rattachement. */
  fournisseurNom?: string;
  numero?: string;
  dateDocument?: string;
  dateValidite?: string;
  reference?: string;
  totalHT?: number;
  devise: string;
  statut: 'recu' | 'applique' | 'archive';
  notes?: string;
  sourceFichier?: string;
  createdAt: string;
  lignes: LigneDevisFournisseur[];
}

export const STATUT_DEVIS_FOURNISSEUR: Record<
  DevisFournisseur['statut'],
  { label: string; color: string }
> = {
  recu:     { label: 'Reçu',     color: 'bg-info/10 text-info' },
  applique: { label: 'Appliqué', color: 'bg-success/10 text-success' },
  archive:  { label: 'Archivé',  color: 'bg-muted text-muted-foreground' },
};

/* ── Mapping base ↔ application ──────────────────────────────────────────── */

type Row = Record<string, unknown>;
const nb = (v: unknown) => (v == null ? undefined : Number(v));
const txt = (v: unknown) => (v == null || v === '' ? undefined : String(v));

function dbToLigne(r: Row): LigneDevisFournisseur {
  return {
    id: String(r.id),
    devisId: String(r.devis_id),
    ordre: Number(r.ordre) || 0,
    reference: txt(r.reference),
    designation: txt(r.designation),
    quantite: nb(r.quantite),
    prixAchat: nb(r.prix_achat),
    unite: txt(r.unite),
    produitId: txt(r.produit_id),
    action: txt(r.action) as ActionPrix | undefined,
    applique: Boolean(r.applique),
    appliqueLe: txt(r.applique_le),
  };
}

function ligneToDb(l: LigneDevisFournisseur) {
  return {
    id: l.id,
    devis_id: l.devisId,
    ordre: l.ordre,
    reference: l.reference ?? null,
    designation: l.designation ?? null,
    quantite: l.quantite ?? null,
    prix_achat: l.prixAchat ?? null,
    unite: l.unite ?? null,
    produit_id: l.produitId ?? null,
    action: l.action ?? null,
    applique: l.applique,
    applique_le: l.appliqueLe ?? null,
  };
}

function dbToDevis(r: Row): DevisFournisseur {
  return {
    id: String(r.id),
    fournisseurId: txt(r.fournisseur_id),
    fournisseurNom: txt(r.fournisseur_nom),
    numero: txt(r.numero),
    dateDocument: txt(r.date_document),
    dateValidite: txt(r.date_validite),
    reference: txt(r.reference),
    totalHT: nb(r.total_ht),
    devise: txt(r.devise) || 'EUR',
    statut: (txt(r.statut) as DevisFournisseur['statut']) || 'recu',
    notes: txt(r.notes),
    sourceFichier: txt(r.source_fichier),
    createdAt: String(r.created_at),
    lignes: [],
  };
}

function devisToDb(d: DevisFournisseur, sourceTexte?: string) {
  return {
    id: d.id,
    fournisseur_id: d.fournisseurId ?? null,
    fournisseur_nom: d.fournisseurNom ?? null,
    numero: d.numero ?? null,
    date_document: d.dateDocument ?? null,
    date_validite: d.dateValidite ?? null,
    reference: d.reference ?? null,
    total_ht: d.totalHT ?? null,
    devise: d.devise,
    statut: d.statut,
    notes: d.notes ?? null,
    source_fichier: d.sourceFichier ?? null,
    ...(sourceTexte !== undefined ? { source_texte: sourceTexte } : {}),
    updated_at: new Date().toISOString(),
  };
}

/* ── Hook ────────────────────────────────────────────────────────────────── */

/**
 * Les devis fournisseur, lus À LA DEMANDE.
 *
 * Jamais au démarrage de l'application : c'est une page qu'on ouvre, pas un
 * référentiel dont tout dépend. `useDevisFournisseur()` sans argument ne lit
 * rien tant que `recharger()` n'est pas appelé — l'effet s'en charge au
 * montage de la page.
 */
export function useDevisFournisseur() {
  const [devis, setDevis] = useState<DevisFournisseur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const [entetes, lignes] = await Promise.all([
      supabase.from('devis_fournisseur').select('*')
        .order('date_document', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }),
      supabase.from('devis_fournisseur_lignes').select('*').order('ordre'),
    ]);

    if (entetes.error || lignes.error) {
      /* Une liste vide et une lecture en échec se ressemblent à l'écran, et
         ne veulent pas dire la même chose. */
      const message = entetes.error?.message || lignes.error?.message || '';
      console.error('[devis_fournisseur]', message);
      setErreur(message);
      setDevis([]);
      setChargement(false);
      return;
    }

    const parDevis = new Map<string, LigneDevisFournisseur[]>();
    for (const r of lignes.data || []) {
      const l = dbToLigne(r);
      const liste = parDevis.get(l.devisId);
      if (liste) liste.push(l); else parDevis.set(l.devisId, [l]);
    }

    setDevis((entetes.data || []).map(r => {
      const d = dbToDevis(r);
      d.lignes = parDevis.get(d.id) || [];
      return d;
    }));
    setChargement(false);
  }, []);

  useEffect(() => { void recharger(); }, [recharger]);

  /** Enregistre un devis et ses lignes. Le même appel crée ou met à jour. */
  const enregistrer = useCallback(async (
    d: DevisFournisseur,
    sourceTexte?: string,
  ): Promise<string | null> => {
    const { error } = await supabase
      .from('devis_fournisseur')
      .upsert(devisToDb(d, sourceTexte) as never);
    if (error) { console.error('[devis_fournisseur upsert]', error.message); return error.message; }

    /* Les lignes sont remplacées en bloc : elles n'ont pas d'existence propre
       hors de leur devis, et une reprise d'analyse peut en supprimer. */
    await supabase.from('devis_fournisseur_lignes').delete().eq('devis_id', d.id);
    if (d.lignes.length) {
      const { error: eL } = await supabase
        .from('devis_fournisseur_lignes')
        .insert(d.lignes.map(ligneToDb) as never);
      if (eL) { console.error('[df_lignes insert]', eL.message); return eL.message; }
    }

    setDevis(prev => {
      const autres = prev.filter(x => x.id !== d.id);
      return [d, ...autres];
    });
    return null;
  }, []);

  /** Marque des lignes comme appliquées, et le devis avec elles. */
  const marquerAppliquees = useCallback(async (devisId: string, ligneIds: string[]) => {
    if (!ligneIds.length) return;
    const quand = new Date().toISOString();
    await supabase.from('devis_fournisseur_lignes')
      .update({ applique: true, applique_le: quand } as never)
      .in('id', ligneIds);
    await supabase.from('devis_fournisseur')
      .update({ statut: 'applique', updated_at: quand } as never)
      .eq('id', devisId);

    setDevis(prev => prev.map(d => d.id !== devisId ? d : {
      ...d,
      statut: 'applique',
      lignes: d.lignes.map(l =>
        ligneIds.includes(l.id) ? { ...l, applique: true, appliqueLe: quand } : l),
    }));
  }, []);

  const supprimer = useCallback(async (id: string) => {
    const { error } = await supabase.from('devis_fournisseur').delete().eq('id', id);
    if (error) { console.error('[devis_fournisseur delete]', error.message); return error.message; }
    setDevis(prev => prev.filter(d => d.id !== id));
    return null;
  }, []);

  const changerStatut = useCallback(async (id: string, statut: DevisFournisseur['statut']) => {
    await supabase.from('devis_fournisseur')
      .update({ statut, updated_at: new Date().toISOString() } as never).eq('id', id);
    setDevis(prev => prev.map(d => d.id === id ? { ...d, statut } : d));
  }, []);

  return { devis, chargement, erreur, recharger, enregistrer, marquerAppliquees, supprimer, changerStatut };
}
