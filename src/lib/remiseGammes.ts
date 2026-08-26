/**
 * Remises sur tarif public des gammes ISOMARK et ISOFLOOR.
 *
 * ISOSIGN ne vend pas ces deux gammes au prix public : l'applicateur et le
 * revendeur paient un pourcentage de ce prix, et ce pourcentage se lit sur la
 * CATÉGORIE Odoo de l'article, pas sur le client.
 *
 *   ISOMARK / H1     50 % de remise    expédié depuis ISOSIGN
 *   ISOMARK / H2     30 % de remise    expédié depuis l'usine ISOMARK
 *   ISOFLOOR         30 % de remise    époxy, MMA, polyuréthane, accessoires…
 *
 * H1 et H2 ne sont donc pas deux clients ni deux devis : ce sont deux
 * familles d'articles qui cohabitent sur un même devis, avec chacune sa
 * remise ET son expédition. C'est pour cela qu'on lit le niveau ligne à
 * ligne — un devis panaché en porte plusieurs.
 *
 * La catégorie arrive telle qu'Odoo l'écrit, chemin complet compris :
 * « ISOMARK / H2 », « ISOMARK / FLOORING / EPOXY », « GRANULATS », « MMA ».
 * Sur les 1 213 articles ISOMARK de la copie locale, 771 portent H2 et 92
 * portent H1 ; les 134 ISOFLOOR se répartissent entre EPOXY, MMA, PU,
 * GRANULATS, PIGMENTS, VANDEX et ACCESSOIRES.
 */

/** Niveau de remise d'un article. `null` = on ne sait pas, donc on ne remise pas. */
export type NiveauGamme = 'H1' | 'H2' | 'ISOFLOOR' | null;

/** Taux de remise sur le tarif public, par niveau. */
export const REMISE_GAMME: Record<Exclude<NiveauGamme, null>, number> = {
  H1: 0.50,
  H2: 0.30,
  ISOFLOOR: 0.30,
};

/**
 * Catégories ISOFLOOR — celles que la remise de 30 % couvre hors ISOMARK.
 *
 * La liste vient des catégories réellement portées par les 134 articles du
 * catalogue ISOFLOOR. « CHARGE » et « AUTRES » en font partie : ce sont des
 * additifs de résine, vendus dans les mêmes conditions.
 */
const CATEGORIES_ISOFLOOR = [
  'EPOXY', 'MMA', 'PU', 'POLYURETHANE', 'POLYURÉTHANE', 'GRANULATS',
  'PIGMENTS', 'VANDEX', 'ACCESSOIRES', 'CHARGE', 'AUTRES',
];

/**
 * Une prestation n'est pas une marchandise et ne se remise pas.
 *
 * POSE-MARQUAGE compte 218 articles chez ISOMARK : ce sont des lignes de
 * pose, de préparation et de main-d'œuvre. Leur appliquer 50 % ferait
 * travailler les équipes à moitié prix.
 */
function estPrestation(categorie: string): boolean {
  return /\b(POSE-?MARQUAGE|MAIN.?D.?OEUVRE|MAIN.?D.?ŒUVRE|TRANSPORT)\b/i
    .test(categorie);
}

/**
 * Niveau de remise d'un article, lu dans sa catégorie Odoo.
 *
 * `catalogue` sert de filet quand la catégorie ne dit rien d'exploitable :
 * un article rangé au catalogue ISOFLOOR relève d'ISOFLOOR même si sa
 * catégorie est vide. Chez ISOMARK en revanche, l'absence de H1 ou de H2
 * laisse le doute entier — FILM en compte 64 — et on préfère le dire.
 */
export function niveauGamme(categorie?: string, catalogue?: string): NiveauGamme {
  const c = String(categorie || '').toUpperCase();
  const cat = String(catalogue || '').toUpperCase();

  if (estPrestation(c)) return null;

  /* H1 et H2 d'abord : ils tranchent, même sous « ISOMARK / FLOORING ». */
  if (/(^|[\s/])H1([\s/]|$)/.test(c)) return 'H1';
  if (/(^|[\s/])H2([\s/]|$)/.test(c)) return 'H2';

  if (cat === 'ISOFLOOR') return 'ISOFLOOR';

  /* Le chemin Odoo doit être EXACTEMENT l'un de ces mots, ou passer par
     FLOORING. Se contenter de les chercher dans le chemin rangeait
     « ELEMENTS DE FIXATION / Accessoires Mats / Ancrage » chez ISOFLOOR et
     remisait de 30 % 84 articles de fixation ISOSIGN. Les catégories
     ISOFLOOR, elles, sont des mots nus — « EPOXY », « MMA », « GRANULATS ». */
  if (/(^|[\s/])FLOORING([\s/]|$)/.test(c)) return 'ISOFLOOR';
  if (CATEGORIES_ISOFLOOR.includes(c.trim())) return 'ISOFLOOR';
  return null;
}

/** Ces deux gammes seules relèvent de ces remises. */
export function estGamme(catalogue?: string): boolean {
  const c = String(catalogue || '').toUpperCase();
  return c === 'ISOMARK' || c === 'ISOFLOOR';
}

export interface PrixGamme {
  niveau: NiveauGamme;
  /** Tarif public HT, avant remise. */
  public: number;
  /** Prix applicateur HT. Égal au public quand le niveau est inconnu. */
  prix: number;
  remise: number;
  explication: string;
}

/**
 * Prix applicateur d'un article de gamme.
 *
 * Renvoie `null` quand l'article ne relève pas de ces gammes ou n'a pas de
 * tarif public exploitable : mieux vaut laisser le circuit habituel décider
 * que d'inventer une remise sur un prix qui n'en est pas un.
 */
export function prixApplicateur(
  prixPublic: number | null | undefined,
  categorie?: string,
  catalogue?: string,
): PrixGamme | null {
  const pub = Number(prixPublic) || 0;
  if (pub <= 0) return null;

  const niveau = niveauGamme(categorie, catalogue);
  if (niveau === null) {
    return {
      niveau, public: pub, prix: pub, remise: 0,
      explication: `tarif public — niveau de remise inconnu `
        + `(catégorie « ${categorie || '—'} »)`,
    };
  }
  const remise = REMISE_GAMME[niveau];
  const prix = Math.round(pub * (1 - remise) * 100) / 100;
  return {
    niveau, public: pub, prix, remise,
    explication: `${niveau} — ${(remise * 100).toFixed(0)} % sur `
      + `${pub.toFixed(2)} € public → ${prix.toFixed(2)} €`,
  };
}
