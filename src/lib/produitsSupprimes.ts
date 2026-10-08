/**
 * Liste noire du catalogue (`produits_supprimes`).
 *
 * Un article supprimé de la page Produits y est inscrit, par sa référence (la
 * référence Odoo quand il en a une, sinon la locale — en majuscules). Les
 * lectures Odoo — recherche de l'analyse, fiches par référence — l'ignorent
 * ensuite : sans cela, retenir un article trouvé chez Odoo le recréait au
 * catalogue, et l'article supprimé revenait.
 *
 * Un article qu'on recrée à la main sort de la liste (`retirerDeLaListeNoire`).
 * Un import Odoo hors de l'application doit lui aussi sauter ces références.
 */
import { supabase } from '@/integrations/supabase/client';

const table = () => (supabase as any).from('produits_supprimes');

let cache: Set<string> | null = null;
let chargement: Promise<Set<string>> | null = null;

export const cleListeNoire = (p: { reference?: string; referenceOdoo?: string }) =>
  String(p.referenceOdoo || p.reference || '').trim().toUpperCase();

/** Les références supprimées, lues une fois puis gardées. */
export function chargerListeNoire(): Promise<Set<string>> {
  if (cache) return Promise.resolve(cache);
  chargement ??= (async () => {
    const { data, error } = await table().select('reference');
    if (error) { console.warn('[liste noire] lecture impossible :', error.message); chargement = null; return new Set<string>(); }
    cache = new Set<string>((data || []).map((r: any) => String(r.reference).toUpperCase()));
    return cache;
  })();
  return chargement;
}

export async function inscrireDansLaListeNoire(
  produits: { reference?: string; referenceOdoo?: string; description?: string }[],
): Promise<void> {
  const lignes = produits
    .map(p => ({
      reference: cleListeNoire(p),
      reference_odoo: p.referenceOdoo || null,
      description: p.description || null,
    }))
    .filter(l => l.reference);
  if (!lignes.length) return;
  const noire = await chargerListeNoire();
  lignes.forEach(l => noire.add(l.reference));
  const { error } = await table().upsert(lignes, { onConflict: 'reference' });
  if (error) console.error('[liste noire] écriture refusée :', error.message);
}

export async function retirerDeLaListeNoire(p: { reference?: string; referenceOdoo?: string }): Promise<void> {
  const cle = cleListeNoire(p);
  if (!cle) return;
  const noire = await chargerListeNoire();
  if (!noire.delete(cle)) return;
  const { error } = await table().delete().eq('reference', cle);
  if (error) console.error('[liste noire] retrait refusé :', error.message);
}
