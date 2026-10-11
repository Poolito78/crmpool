import { supabase } from '@/integrations/supabase/client';

/**
 * Le catalogue gardé dans le navigateur, et relu par différence.
 *
 * Relire les 22 700 articles à chaque démarrage coûtait 23 tranches de mille
 * lignes : 900 ms chacune en moyenne sur l'instance Micro, et jusqu'à 10 s
 * quand son CPU partagé est bridé (mesuré le 11/10/2026 : la même tranche
 * prenait 25 ms puis 2,5 s d'une minute à l'autre). L'application
 * « pataugeait » au démarrage et chaque recherche faisait la queue.
 *
 * On garde donc les lignes BRUTES de la base en IndexedDB, avec un curseur —
 * la plus récente `updated_at` vue — et au démarrage on ne demande que :
 *   - les articles dont `updated_at` dépasse le curseur (trigger
 *     `produits_horodater`, migration 20261011120000) ;
 *   - les identifiants notés dans `produits_effaces` depuis le curseur.
 *     (⚠️ PAS `produits_supprimes` : celle-là est la liste noire par
 *     référence de `produitsSupprimes.ts`, sans rapport.)
 * Un jour ordinaire, c'est quelques dizaines de lignes au lieu de 22 700.
 *
 * ⚠️ `updated_at` vaut `now()`, l'heure du DÉBUT de la transaction : une
 * écriture longue peut être validée après qu'on a lu plus loin qu'elle. On
 * relit donc avec une MARGE de dix minutes en arrière — relire deux fois une
 * ligne ne coûte rien, la manquer fausserait un prix.
 *
 * Garde-fous : un cache de plus de quinze jours, illisible, ou d'une autre
 * version est jeté et le catalogue relu en entier. Sans la colonne
 * `updated_at` (migration absente), rien n'est mis en cache.
 */

const IDB_NAME = 'crmpool-cache';
const IDB_STORE = 'catalogue';
const IDB_KEY = 'produits';
/** À incrémenter si la forme des lignes change au point d'invalider le cache. */
const VERSION = 1;
const MARGE_MS = 10 * 60 * 1000;
const AGE_MAX_MS = 15 * 24 * 3600 * 1000;
const TRANCHE = 1000;

export interface CacheCatalogue {
  version: number;
  /** Lignes brutes de `produits`, telles que la base les rend. */
  lignes: any[];
  /** Plus récente `updated_at` (ou `efface_le`) vue : la relecture part de là. */
  curseur: string;
  /** Date d'écriture, côté navigateur — seulement pour l'âge maximal. */
  ecritLe: number;
}

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Le cache, ou `null` s'il n'existe pas, est trop vieux ou illisible. */
export async function lireCacheCatalogue(): Promise<CacheCatalogue | null> {
  try {
    const db = await ouvrir();
    const brut = await new Promise<string | null>((resolve) => {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => resolve(null);
    });
    db.close();
    if (!brut) return null;
    /* Stocké en texte : JSON.parse de 35 Mo est plus rapide que le clonage
       structuré de 22 700 objets à soixante champs. */
    const c = JSON.parse(brut) as CacheCatalogue;
    if (c.version !== VERSION || !Array.isArray(c.lignes) || !c.lignes.length || !c.curseur) return null;
    if (Date.now() - c.ecritLe > AGE_MAX_MS) return null;
    return c;
  } catch {
    return null;
  }
}

export async function ecrireCacheCatalogue(lignes: any[], curseur: string | null): Promise<void> {
  /* Sans curseur, la base n'a pas `updated_at` : un cache qu'on ne saurait
     pas rafraîchir serait un catalogue figé. */
  if (!curseur || !lignes.length) return;
  try {
    const texte = JSON.stringify({ version: VERSION, lignes, curseur, ecritLe: Date.now() } satisfies CacheCatalogue);
    const db = await ouvrir();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(texte, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();   // quota dépassé : on vit sans cache
    });
    db.close();
  } catch { /* sans cache, l'application relit tout : rien de cassé */ }
}

/** Plus récente `updated_at` d'un lot de lignes, ou `null` si la colonne manque. */
export function curseurDe(lignes: any[], depart: string | null = null): string | null {
  let max = depart;
  for (const l of lignes) {
    const u = l?.updated_at;
    if (typeof u === 'string' && (!max || u > max)) max = u;
  }
  return max;
}

/** Plus grande de deux dates ISO de la base (même format, comparables en texte). */
function plusRecent(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export interface DeltaCatalogue {
  modifies: any[];
  supprimes: string[];
  curseur: string;
}

/**
 * Ce qui a changé depuis `curseur`. `null` si la base refuse (colonne
 * absente, délai dépassé) : l'appelant relit alors tout.
 */
export async function lireDeltaCatalogue(curseur: string): Promise<DeltaCatalogue | null> {
  const borne = new Date(new Date(curseur).getTime() - MARGE_MS).toISOString();
  const modifies: any[] = [];
  /* Pagination par la clé (updated_at, id), jamais par décalage : un
     décalage relit tout ce qui précède. */
  let apres: { u: string; id: string } | null = null;
  for (;;) {
    let q = supabase.from('produits' as any).select('*')
      .gte('updated_at', borne)
      .order('updated_at').order('id').limit(TRANCHE);
    if (apres) q = q.or(`updated_at.gt."${apres.u}",and(updated_at.eq."${apres.u}",id.gt.${apres.id})`);
    const { data, error } = await q;
    if (error) {
      console.warn('[catalogue] relecture par différence impossible :', error.message);
      return null;
    }
    const lot = (data || []) as any[];
    modifies.push(...lot);
    if (lot.length < TRANCHE) break;
    const der = lot[lot.length - 1];
    apres = { u: der.updated_at, id: der.id };
  }

  const { data: suppr, error: errS } = await supabase.from('produits_effaces' as any)
    .select('id, efface_le').gte('efface_le', borne).order('efface_le').limit(20000);
  if (errS) {
    console.warn('[catalogue] suppressions illisibles :', errS.message);
    return null;
  }
  const supprimes = ((suppr || []) as any[]).map(s => s.id as string);
  let nouveau = curseurDe(modifies, curseur);
  for (const s of (suppr || []) as any[]) nouveau = plusRecent(nouveau, s.efface_le);
  return { modifies, supprimes, curseur: nouveau || curseur };
}

/**
 * Applique un delta à des lignes brutes. Les suppressions passent d'abord :
 * un article recréé après coup revient par les modifiés.
 */
export function appliquerDelta(lignes: any[], delta: DeltaCatalogue): any[] {
  if (!delta.modifies.length && !delta.supprimes.length) return lignes;
  const parId = new Map<string, any>();
  for (const l of lignes) parId.set(l.id, l);
  for (const id of delta.supprimes) parId.delete(id);
  for (const l of delta.modifies) parId.set(l.id, l);
  return [...parId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
