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

/** Donne le prix unitaire courant de l'article d'un composant (celui du devis : client, niveau de tarif), ou `undefined`. */
export type ResoudrePrix = (c: LigneKit) => number | undefined;

/**
 * Prix unitaire d'un composant. Un composant qui désigne un ARTICLE en suit le
 * prix courant (`resoudre`) — c'est le reflet de l'article de base, il bouge
 * avec lui. Il ne garde son prix enregistré que si on l'a saisi à la main
 * (`prixFige`), ou si l'article est introuvable.
 */
export function prixComposant(c: LigneKit, resoudre?: ResoudrePrix): number {
  const vivant = !c.prixFige && c.produitId && resoudre ? resoudre(c) : undefined;
  // Un prix d'article non renseigné (0) ne remplace pas le prix enregistré : on ne vend pas à 0 par défaut.
  return vivant != null && vivant > 0 ? vivant : (c.prixUnitaireHT || 0);
}

/** Prix HT d'un ensemble : somme des composants, remise comprise. */
export function prixVarianteCompo(v: VarianteCompo, resoudre?: ResoudrePrix): number {
  return arrondi(v.composants.reduce(
    (s, c) => s + (c.quantite || 0) * prixComposant(c, resoudre) * (1 - (c.remise || 0) / 100), 0));
}

/**
 * Coût d'achat d'un ensemble, ou `undefined` : on ne le calcule que si CHAQUE
 * composant est un article du catalogue AVEC un prix d'achat renseigné — un coût partiel annoncerait une
 * marge fausse, et on n'invente pas une donnée métier.
 */
export function achatVarianteCompo(v: VarianteCompo, produits: Pick<Produit, 'id' | 'prixAchat'>[]): number | undefined {
  if (v.composants.length === 0) return undefined;
  let total = 0;
  for (const c of v.composants) {
    const p = c.produitId ? produits.find(x => x.id === c.produitId) : undefined;
    // Le prix d'achat de l'article doit être RENSEIGNÉ : à 0, on ne sait pas, on ne compte pas 0.
    if (!p || !(p.prixAchat > 0)) return undefined;
    total += (c.quantite || 0) * p.prixAchat;
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
