import { useCallback, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Produit } from '@/lib/store';
import { produitParId, produitParReference } from '@/lib/indexProduits';
import { estMotVide, motsDe } from '@/lib/produitTags';

/**
 * Mémoire de l'analyseur : la DEMANDE ENTIÈRE du client → l'article retenu.
 *
 * ⚠️ **UNE CORRECTION FAITE À LA MAIN NE DOIT SE FAIRE QU'UNE FOIS.** Le
 * commercial corrigeait l'article proposé pour « panneau AK3 » ou « plot
 * PVC + mât 2.50 », et la demande suivante, identique, repartait sur la
 * même erreur. Les tags (`produitTags.ts`) n'y suffisent pas : ils ne
 * retiennent que les mots que l'article ne porte pas déjà, et rien du tout
 * quand la demande n'est faite que de codes du catalogue (« AK3 700 C2 ») —
 * précisément le cas où le rapprochement se trompe de variante.
 *
 * La mémoire retient donc la demande telle quelle, réduite à une CLÉ
 * (`cleDemande`) : ses mots, sans accents ni liaisons, triés — « Panneau
 * AK3 700 » et « AK3 700 panneau » sont la même demande. Les nombres
 * restent : « B14 70 » n'est pas « B14 50 ». Une clé ne retient qu'UN
 * article, le dernier choisi : corriger une correction la remplace.
 *
 * Deux sources l'alimentent :
 *  - `choix` : un article choisi à la main dans l'analyse de document ;
 *  - `devis_realise` : un écart relevé entre le devis réellement envoyé et
 *    le chiffrage du CRM (`comparaisonDevis.ts`).
 *
 * Au rappel, la mémoire passe AVANT le rapprochement automatique et après un
 * choix fait à l'écran. Elle désigne un article par sa référence (MonCRM ou
 * Odoo) autant que par son identifiant : un article Odoo absent du catalogue
 * local se rappelle quand même, par la lecture Odoo à code exact.
 *
 * Table commune `memoire_articles` (RLS « tous authentifiés ») : ce qu'un
 * commercial a corrigé vaut pour ses collègues.
 */

export type OrigineMemoire = 'choix' | 'devis_realise';

export interface MemoireArticle {
  id: string;
  /** `cleDemande(demande)` — unique en base. */
  cle: string;
  /** La demande telle qu'elle était écrite la dernière fois, pour l'afficher. */
  demande: string;
  produitId?: string;
  /** Référence de l'article : MonCRM, ou Odoo quand il manque au catalogue. */
  reference: string;
  designation?: string;
  origine: OrigineMemoire;
  /** Nombre de fois que ce même article a été retenu pour cette demande. */
  nb: number;
  updatedAt: string;
}

/* ── Fonctions pures ──────────────────────────────────────────────────────── */

/**
 * La clé d'une demande : mots sans accents ni liaisons, dédoublonnés, triés.
 * Vide quand la demande ne dit rien (que des liaisons) : rien ne se retient.
 */
export function cleDemande(texte: string): string {
  const mots = motsDe(texte || '').filter(m => !estMotVide(m));
  return [...new Set(mots)].sort().join(' ');
}

/** L'article du catalogue local que désigne un souvenir, s'il y est. */
export function produitDeMemoire(m: MemoireArticle, produits: Produit[]): Produit | undefined {
  return (m.produitId ? produitParId(produits, m.produitId) : undefined)
    ?? produitParReference(produits, m.reference);
}

/* ── Réserve partagée ─────────────────────────────────────────────────────── */

/* Même principe que `produitTags.ts` : une lecture pour toute l'application. */
let liste: MemoireArticle[] = [];
let index = new Map<string, MemoireArticle>();
let promesse: Promise<void> | null = null;
const abonnes = new Set<() => void>();

function poser(next: MemoireArticle[]) {
  liste = next;
  index = new Map(next.map(m => [m.cle, m]));
  for (const f of [...abonnes]) f();
}

interface LigneDb {
  id: string;
  cle: string;
  demande: string;
  produit_id: string | null;
  reference: string;
  designation: string | null;
  origine: string;
  nb: number | null;
  updated_at: string;
}

function dbToMemoire(r: LigneDb): MemoireArticle {
  return {
    id: r.id,
    cle: r.cle,
    demande: r.demande,
    produitId: r.produit_id || undefined,
    reference: r.reference,
    designation: r.designation || undefined,
    origine: r.origine === 'devis_realise' ? 'devis_realise' : 'choix',
    nb: r.nb || 1,
    updatedAt: r.updated_at,
  };
}

/** Faux tant que la table manque : on ne réessaie pas d'écrire à chaque clic. */
let tableAbsente = false;

async function charger(): Promise<void> {
  const { data, error } = await supabase.from('memoire_articles' as never).select('*');
  if (error) {
    // Table pas encore migrée : l'analyse doit continuer sans mémoire.
    console.error('[memoire_articles]', error.message);
    tableAbsente = /does not exist|could not find|schema cache/i.test(error.message);
    poser([]);
    return;
  }
  poser(((data || []) as unknown as LigneDb[]).map(dbToMemoire));
}

function abonner(f: () => void) {
  abonnes.add(f);
  if (!promesse) promesse = charger();
  return () => { abonnes.delete(f); };
}

/** Le souvenir d'une demande, s'il y en a un. */
export function souvenirDe(demande: string): MemoireArticle | undefined {
  const cle = cleDemande(demande);
  return cle ? index.get(cle) : undefined;
}

/* ── Écritures ────────────────────────────────────────────────────────────── */

/**
 * Retient l'article d'une demande. Rend l'erreur à afficher, ou `null`.
 *
 * Écrase le souvenir précédent de la même demande : la dernière correction
 * fait foi. Le même article retenu une fois de plus fait monter `nb`.
 */
export async function retenirArticle(
  demande: string,
  article: { produitId?: string; reference: string; designation?: string },
  origine: OrigineMemoire = 'choix',
): Promise<string | null> {
  const cle = cleDemande(demande);
  const reference = String(article.reference || '').trim();
  if (!cle || !reference) return null;
  if (tableAbsente) return 'La table memoire_articles manque : appliquer la migration 20261014120000.';
  const avant = index.get(cle);
  const meme = avant && avant.reference.toUpperCase() === reference.toUpperCase();

  const { data, error } = await supabase
    .from('memoire_articles' as never)
    .upsert({
      cle,
      demande: demande.trim().slice(0, 500),
      produit_id: article.produitId || null,
      reference,
      designation: article.designation || null,
      origine,
      nb: meme ? avant!.nb + 1 : 1,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: 'cle' })
    .select()
    .single();
  if (error) return error.message;
  const m = dbToMemoire(data as unknown as LigneDb);
  poser([...liste.filter(x => x.cle !== cle), m]);
  return null;
}

/** Oublie le souvenir d'une demande. */
export async function oublierDemande(demande: string): Promise<string | null> {
  const m = souvenirDe(demande);
  if (!m) return null;
  const { error } = await supabase.from('memoire_articles' as never).delete().eq('id', m.id);
  if (error) return error.message;
  poser(liste.filter(x => x.id !== m.id));
  return null;
}

/* ── Hook ─────────────────────────────────────────────────────────────────── */

export function useMemoireArticles() {
  const memoires = useSyncExternalStore(abonner, () => liste, () => liste);
  /* `memoires` en dépendance : la fonction change quand la mémoire change,
     et les calculs qui en dépendent se refont. */
  const souvenir = useCallback(
    (demande: string) => (memoires.length ? souvenirDe(demande) : undefined),
    [memoires],
  );
  return { memoires, souvenir, retenir: retenirArticle, oublier: oublierDemande };
}
