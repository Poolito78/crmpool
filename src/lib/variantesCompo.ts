import type { LigneKit, Produit } from './store';

/**
 * VARIANTES COMPOSÉES d'un article : chacune est une combinaison de produits
 * (un mini « produit composé ») proposée à la saisie de l'article dans un
 * devis, AVANT les options.
 *
 * Choisie, elle tient sur UNE ligne : la désignation reprend celle de
 * l'article de base et le nom de la variante en complément, le prix est la
 * somme de ses composants.
 *
 * ELLE VIT DANS `variantesChoisies` de la ligne, sous la clé `__compo`
 * (valeur = identifiant de la variante) : toutes les relectures de prix du
 * devis passent par `getPrixLigne(…, l.variantesChoisies, …)` et la retrouvent
 * sans qu'on ait à les toucher une à une. Les clés qui commencent par `__`
 * sont INTERNES : elles ne s'affichent jamais (`valeursVisibles`).
 */

export interface VarianteCompo {
  id: string;
  nom: string;
  composants: LigneKit[];
}

export const CLE_COMPO = '__compo';

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Prix HT d'un ensemble : somme des composants, remise comprise. */
export function prixVarianteCompo(v: VarianteCompo): number {
  return arrondi(v.composants.reduce(
    (s, c) => s + (c.quantite || 0) * (c.prixUnitaireHT || 0) * (1 - (c.remise || 0) / 100), 0));
}

/**
 * Coût d'achat d'un ensemble, ou `undefined` : on ne le calcule que si CHAQUE
 * composant est un article du catalogue — un coût partiel annoncerait une
 * marge fausse, et on n'invente pas une donnée métier.
 */
export function achatVarianteCompo(v: VarianteCompo, produits: Pick<Produit, 'id' | 'prixAchat'>[]): number | undefined {
  if (v.composants.length === 0) return undefined;
  let total = 0;
  for (const c of v.composants) {
    const p = c.produitId ? produits.find(x => x.id === c.produitId) : undefined;
    if (!p) return undefined;
    total += (c.quantite || 0) * (p.prixAchat || 0);
  }
  return arrondi(total);
}

/** La variante composée portée par une ligne (`variantesChoisies`), si elle existe encore sur l'article. */
export function varianteDeLigne(
  produit: Pick<Produit, 'variantesCompo'> | undefined,
  variantesChoisies?: Record<string, string>,
): VarianteCompo | undefined {
  const id = variantesChoisies?.[CLE_COMPO];
  return id ? produit?.variantesCompo?.find(v => v.id === id) : undefined;
}

/** « Désignation de l'article — nom de la variante ». */
export function designationAvecVariante(designationBase: string, v: Pick<VarianteCompo, 'nom'>): string {
  return `${designationBase} — ${v.nom}`;
}

/** Les valeurs d'un `variantesChoisies` destinées à l'affichage (clés internes écartées). */
export function valeursVisibles(vc?: Record<string, string>): string[] {
  return Object.entries(vc ?? {}).filter(([k]) => !k.startsWith('__')).map(([, v]) => v);
}

/** Le même objet sans ses clés internes. */
export function sansClesInternes(vc?: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(vc ?? {}).filter(([k]) => !k.startsWith('__')));
}
