/**
 * Frais de port ISOSIGN — panneaux, supports, accessoires.
 *
 * Barème forfaitaire, distinct de celui des produits plastique STI, qui se
 * calcule lui au poids ou à l'encombrement :
 *
 *   commande > 700 €                    offert
 *   commande ≤ 700 € avec support(s)    75,00 €
 *   commande ≤ 700 € autres cas         30,00 €
 *
 * Les deux barèmes coexistent sur un même devis et S'ADDITIONNENT : le devis
 * AF035816 porte une ligne « FRAIS DE PORT BALISAGE + SV Dpt 78 » qui couvre
 * les deux expéditions. Le plastique part de chez STI, le reste de chez
 * ISOSIGN.
 *
 * Le seuil se juge sur le montant ISOSIGN — celui des lignes que ce barème
 * transporte — et non sur le total du devis : les produits plastique voyagent
 * séparément et ne peuvent pas faire franchir un franco qui ne les concerne
 * pas.
 */

/** Au-delà de ce montant HT, le port est offert. */
export const FRANCO_ISOSIGN = 700;

/** Forfait quand la commande comporte au moins un support. */
export const PORT_AVEC_SUPPORT = 75;

/** Forfait dans les autres cas. */
export const PORT_SANS_SUPPORT = 30;

export interface PortIsosign {
  montant: number;
  /** Vrai quand le franco est atteint. */
  offert: boolean;
  /** La commande comporte-t-elle un support ? */
  avecSupport: boolean;
  /** Montant HT retenu pour juger le franco. */
  base: number;
  explication: string;
}

/**
 * Une référence désigne-t-elle un support ?
 *
 * Les supports ISOSIGN se codent `SG…` — « SG80401_5.2000.IS.BRUT » pour le
 * 80×40 en 1,5 mm de 2 m — et se libellent « SUPPORT ACIER GALVA ». On
 * reconnaît les deux : la référence seule laisserait passer un support saisi
 * en ligne libre, le libellé seul un article dont la désignation est
 * abrégée.
 */
export function estSupport(reference: string, designation = ''): boolean {
  const r = String(reference || '').toUpperCase();
  const d = String(designation || '').toUpperCase();
  if (/^SG[0-9.]/.test(r) || /^MAT/.test(r)) return true;
  return /\b(SUPPORT|MÂT|MAT )\b/.test(d);
}

/**
 * Chiffre le port ISOSIGN d'un ensemble de lignes.
 *
 * `base` est le montant HT des lignes concernées par CE barème — sans les
 * produits plastique, qui ont le leur.
 */
export function chiffrerPortIsosign(
  base: number,
  lignes: { reference: string; designation?: string }[],
): PortIsosign {
  const montantBase = Math.max(0, Number(base) || 0);
  const avecSupport = lignes.some((l) => estSupport(l.reference, l.designation));

  if (montantBase > FRANCO_ISOSIGN) {
    return {
      montant: 0, offert: true, avecSupport, base: montantBase,
      explication: `${montantBase.toFixed(2)} € HT — au-delà de `
        + `${FRANCO_ISOSIGN} €, le port est offert`,
    };
  }

  const montant = avecSupport ? PORT_AVEC_SUPPORT : PORT_SANS_SUPPORT;
  return {
    montant, offert: false, avecSupport, base: montantBase,
    explication: `${montantBase.toFixed(2)} € HT — sous le franco de `
      + `${FRANCO_ISOSIGN} €, ${avecSupport ? 'avec support' : 'sans support'} : `
      + `${montant.toFixed(2)} €`,
  };
}
