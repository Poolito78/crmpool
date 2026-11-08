/**
 * referenceTeinte.ts — LA RÉFÉRENCE ODOO D'UNE LIGNE SUIT LA TEINTE CHOISIE.
 *
 * Chez Odoo, une teinte est un ARTICLE : « PIGMENT2KG.L1000 » est le pigment
 * de 2 kg en RAL 1000, « PIGMENT2KG.L7037 » celui en RAL 7037. Chez nous, la
 * teinte est une variante de la ligne (`variantesChoisies`, dimension
 * « Teinte ») et la fiche ne porte qu'UNE `reference_odoo` — celle qu'on a
 * retenue un jour, la première teinte de la liste.
 *
 * ⚠️ L'export envoyait cette référence telle quelle : un pigment choisi en
 * RAL 7037 partait sous PIGMENT2KG.L1000, et le devis AF041510 comme la
 * commande d'achat P29317 (QUARTZ RÉSINES MINÉRAUX, dropship SIGNA'SOLS)
 * annonçaient RAL 1000. Le fournisseur a dû corriger le coloris par mail.
 *
 * Désormais le segment de teinte de la référence (`.L1000`) est remplacé par
 * le RAL de l'option choisie (« 222 (RAL 7037, Goosewing Grey) » → `.L7037`).
 * Si la teinte choisie n'a pas de code RAL (« 340 (Pastel Yellow) »), ou si
 * aucune teinte n'est choisie, la référence NE PART PAS : la ligne va en
 * négoce avec sa teinte dans le libellé, et l'écran le signale « à vérifier ».
 * On ne retombe jamais sur la première teinte — on n'invente pas une donnée.
 *
 * Côté `odoo-devis`, `teinteCompatible` interdit aussi de rapprocher par
 * ressemblance un code d'une autre teinte (L7035 pour L7037).
 */

import type { LigneDevis, Produit, VarianteDimension } from './store';
import { codeDeTeinte, delaiDeTeinte, libelleNuancier, teinteParRal, type DelaiTeinte } from './nuancierFlowcrete';

/** Une dimension de teinte : nommée comme telle. */
const NOM_TEINTE = /teinte|couleur|coloris|\bral\b/i;

/** Le code RAL d'un libellé de teinte : « 222 (RAL 7037, Goosewing Grey) » → « 7037 ». */
export function ralDeLibelle(libelle: string | undefined | null): string | null {
  const m = String(libelle || '').match(/\bRAL\s*(\d{4})\b/i);
  return m ? m[1] : null;
}

/** Le segment de teinte d'une référence : « PIGMENT2KG.L1000 » → « 1000 ». */
const SEGMENT_TEINTE = /(^|[.\-_ ])L(\d{4})(?=$|[.\-_ ])/i;

export function teinteDeReference(ref: string | undefined | null): string | null {
  const m = String(ref || '').match(SEGMENT_TEINTE);
  return m ? m[2] : null;
}

/** La dimension de teinte de l'article, s'il en a une. */
export function dimensionTeinte(produit: Pick<Produit, 'variantes'> | undefined): VarianteDimension | undefined {
  return (produit?.variantes || []).find(d => NOM_TEINTE.test(d.nom || ''));
}

/** Les RAL distincts qu'un texte nomme, dans l'ordre : « EPW ral 5015 » → ['5015']. */
export function ralsNommes(texte: string | undefined | null): string[] {
  return [...new Set([...String(texte || '').matchAll(/\bRAL\s*[:.]?\s*(\d{4})\b/gi)].map(m => m[1]))];
}

export interface TeinteDemandee {
  /** La dimension de teinte de l'article : clé de `variantesChoisies`. */
  dimensionId: string;
  valeur: string;
  /** Faux : le RAL n'est ni sur la fiche ni au nuancier de sa gamme, à vérifier. */
  auNuancier: boolean;
  /** Tier et délai, quand la gamme a un nuancier. */
  delai?: DelaiTeinte;
}

/**
 * LA TEINTE QUE LA DEMANDE NOMME, SUR CET ARTICLE.
 *
 * Sans elle, la ligne s'affichait dans la première teinte du nuancier : le
 * client demandait du RAL 5015, le devis DEV-2026-180 annonçait du RAL 7035.
 * L'option du même RAL est préférée, puis le nuancier de la gamme (une fiche
 * écrit « 217 (Silk Grey) », sans son RAL 7044). Un RAL absent des deux reste
 * écrit tel quel, jamais remplacé par une teinte voisine (5017 n'est pas 5015).
 */
export function teinteDemandee(
  produit: (Pick<Produit, 'variantes'> & Partial<Pick<Produit, 'reference' | 'description'>>) | undefined,
  ral: string | undefined,
): TeinteDemandee | undefined {
  const dim = dimensionTeinte(produit);
  if (!dim || !ral) return undefined;
  const nuancier = teinteParRal(produit, ral);
  const option = dim.options.find(o => ralDeLibelle(o.label) === ral)
    ?? (nuancier && dim.options.find(o => codeDeTeinte(o.label) === nuancier.code));
  const valeur = option?.label ?? (nuancier ? libelleNuancier(nuancier) : `RAL ${ral}`);
  const delai = delaiDeTeinte(produit, valeur);
  return { dimensionId: dim.id, valeur, auNuancier: !!(option || nuancier), ...(delai ? { delai } : {}) };
}

export interface ReferenceTeinte {
  /** La référence à envoyer ; absente = la ligne part en négoce. */
  ref?: string;
  /** La teinte choisie (libellé de l'option), pour le libellé de la ligne. */
  teinte?: string;
  /** Pourquoi la référence n'a pas pu suivre la teinte. */
  aVerifier?: string;
}

/**
 * La référence Odoo d'une ligne, ramenée à la teinte choisie.
 *
 * Une référence sans segment de teinte, ou un article sans dimension de
 * teinte, passe telle quelle : le code d'un article laqué sans variante est
 * celui de sa teinte, il n'y a rien à suivre.
 */
export function referenceSelonTeinte(
  ref: string | undefined,
  produit: Pick<Produit, 'variantes'> | undefined,
  variantesChoisies: LigneDevis['variantesChoisies'],
): ReferenceTeinte {
  const dim = dimensionTeinte(produit);
  const choisie = dim ? variantesChoisies?.[dim.id]?.trim() || undefined : undefined;
  const seg = teinteDeReference(ref);
  if (!ref || !seg || !dim) return { ref, teinte: choisie };

  if (!choisie) {
    return {
      teinte: undefined,
      aVerifier: `${ref} : aucune teinte choisie sur la ligne — la référence d'une teinte (L${seg}) n'est pas envoyée.`,
    };
  }
  const ral = ralDeLibelle(choisie);
  if (!ral) {
    return {
      teinte: choisie,
      aVerifier: `${ref} : la teinte « ${choisie} » n'a pas de code RAL — la ligne part en négoce, référence Odoo à vérifier.`,
    };
  }
  return { ref: ref.replace(SEGMENT_TEINTE, (_t, avant: string) => `${avant}L${ral}`), teinte: choisie };
}

/** Le libellé de la ligne, complété de sa teinte quand il ne la dit pas. */
export function libelleAvecTeinte(desc: string, teinte: string | undefined): string {
  if (!teinte) return desc;
  if (desc.toLowerCase().includes(teinte.toLowerCase())) return desc;
  const ral = ralDeLibelle(teinte);
  if (ral && new RegExp(`\\bRAL\\s*${ral}\\b`, 'i').test(desc)) return desc;
  return `${desc} — Teinte ${teinte}`;
}
