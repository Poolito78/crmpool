/**
 * Frais de transport des produits plastique STI.
 *
 * ISOSIGN chiffre chaque envoi de DEUX façons et retient la moins chère :
 *
 *  - la MESSAGERIE, facturée au poids. Jusqu'à 100 kg c'est un forfait par
 *    envoi ; au-delà, un tarif aux 100 kg, le poids étant arrondi à la
 *    dizaine supérieure — et à la cinquantaine au-delà d'une tonne, avec un
 *    dixième de plus.
 *  - l'AFFRÈTEMENT TRANSEO, facturé à l'encombrement. On compte les palettes
 *    nécessaires, on convertit en mètres linéaires de camion, et on arrondit
 *    au demi-mètre supérieur.
 *
 * Le modèle est celui du classeur « TARIFS TRANSPORT PRODUITS PLASTIQUE
 * ISOSIGN.xlsx », reproduit à l'identique : sur son propre exemple —
 * 60 Plastobloc 24 kg pour le 62 — il rend 587,7868 € en messagerie et
 * 213,75 € en affrètement, comme lui.
 *
 * Ne vaut que pour les produits plastique STI, ceux du catalogue joint. Les
 * panneaux et supports relèvent d'un autre barème.
 */

import {
  TRANCHES_POIDS, PALIERS_ML, MESSAGERIE, AFFRETEMENT,
  ARTICLES_PLASTIQUE, type ArticlePlastique,
} from './transportPlastique.donnees';

export type { ArticlePlastique };
export { ARTICLES_PLASTIQUE };

/** Arrondi au multiple SUPÉRIEUR — le CEILING du tableur. */
function auPalierSuperieur(valeur: number, pas: number): number {
  /* Le passage par un arrondi à neuf décimales évite qu'un 0,8 / 0,5 stocké
     en flottant ne donne 1,6000000000000003 et ne saute un palier. */
  return Math.ceil(Number((valeur / pas).toFixed(9))) * pas;
}

/** Indice de la dernière borne que la valeur atteint — le MATCH approché. */
function indicePalier(valeur: number, bornes: readonly number[]): number {
  let i = 0;
  for (let k = 0; k < bornes.length; k++) if (valeur >= bornes[k]) i = k;
  return i;
}

/** Normalise « 7 », « 07 », « 7 » en « 07 ». */
export function departement(dpt: string | number): string {
  const t = String(dpt ?? '').trim().toUpperCase();
  /* La Corse s'écrit 2A et 2B, et ne se complète pas de zéros. */
  if (/^2[AB]$/.test(t)) return t;
  const n = t.replace(/\D/g, '');
  return n.length === 1 ? `0${n}` : n.slice(0, 3);
}

/**
 * Coût en messagerie, ou `null` si le département est hors barème.
 *
 * Le multiplicateur reproduit celui du classeur : forfait jusqu'à 100 kg,
 * puis poids arrondi au palier supérieur et ramené en centaines de kilos.
 * Le « +1 » avant l'arrondi vient du tableur : un envoi de 100 kg pile bascule
 * bien dans la tranche supérieure.
 */
export function coutMessagerie(dpt: string | number, poids: number): number | null {
  const table = MESSAGERIE[departement(dpt)];
  if (!table || !(poids > 0)) return null;
  const base = table[indicePalier(poids, TRANCHES_POIDS)];
  if (base == null) return null;

  let multiplicateur = 1;
  if (poids >= 1000) multiplicateur = auPalierSuperieur(poids + 1, 50) / 100 + 0.1;
  else if (poids > 100) multiplicateur = auPalierSuperieur(poids + 1, 10) / 100;
  return base * multiplicateur;
}

/** Coût en affrètement, ou `null` si le département est hors barème. */
export function coutAffretement(dpt: string | number, metresLineaires: number): number | null {
  const table = AFFRETEMENT[departement(dpt)];
  if (!table || !(metresLineaires > 0)) return null;
  return table[indicePalier(metresLineaires, PALIERS_ML)] ?? null;
}

export interface DevisTransport {
  /** Mode retenu, celui qui coûte le moins cher. */
  mode: 'messagerie' | 'affretement';
  /** Montant retenu, en euros. */
  montant: number;
  /** Les deux offres, pour que l'écart se voie. */
  messagerie: number | null;
  affretement: number | null;
  poids: number;
  palettes: number;
  metresLineaires: number;
  explication: string;
}

/**
 * Chiffre le transport d'une quantité d'un article plastique.
 *
 * Renvoie `null` quand l'article est inconnu du catalogue, quand le
 * département n'est pas au barème, ou quand aucun des deux modes ne sait
 * répondre — plutôt qu'un montant inventé.
 */
export function chiffrerTransport(
  article: ArticlePlastique,
  quantite: number,
  dpt: string | number,
): DevisTransport | null {
  if (!(quantite > 0)) return null;

  const poids = (article.poids || 0) * quantite;
  /* Sans nombre de pièces par palette ni encombrement, l'affrètement ne se
     calcule pas : on ne chiffre alors que la messagerie. */
  const palettes = article.parPalette
    ? auPalierSuperieur(quantite / article.parPalette, 1)
    : 0;
  const metresLineaires = article.ml && palettes
    ? auPalierSuperieur(article.ml * palettes, 0.5)
    : 0;

  const messagerie = coutMessagerie(dpt, poids);
  const affretement = metresLineaires ? coutAffretement(dpt, metresLineaires) : null;
  if (messagerie == null && affretement == null) return null;

  const mode: 'messagerie' | 'affretement' =
    affretement != null && (messagerie == null || affretement < messagerie)
      ? 'affretement' : 'messagerie';
  const montant = (mode === 'affretement' ? affretement : messagerie) as number;

  return {
    mode, montant, messagerie, affretement, poids, palettes, metresLineaires,
    explication:
      `${quantite} × ${article.reference} → ${poids} kg`
      + (metresLineaires ? `, ${palettes} palette(s) = ${metresLineaires} ml` : '')
      + ` vers le ${departement(dpt)} : `
      + `messagerie ${messagerie == null ? '—' : messagerie.toFixed(2) + ' €'}, `
      + `affrètement ${affretement == null ? '—' : affretement.toFixed(2) + ' €'}`
      + ` → ${mode} retenu`,
  };
}

/** Retrouve un article plastique par son libellé exact, ou par sa référence. */
export function articlePlastique(cle: string): ArticlePlastique | null {
  const t = String(cle ?? '').trim();
  if (!t) return null;
  const direct = ARTICLES_PLASTIQUE[t];
  if (direct) return direct;
  const ref = t.toUpperCase();
  for (const a of Object.values(ARTICLES_PLASTIQUE)) {
    if ((a.reference || '').toUpperCase() === ref) return a;
  }
  return null;
}
