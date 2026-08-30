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

/**
 * Familles tarifaires reconnues dans la fiche client.
 *
 * Ce sont les clés de `remisesParCategorie` : ACCESSIBILITE s'y ajoute aux
 * catégories ISOFLOOR, elle n'est pas une gamme mais elle se remise.
 */
const FAMILLES_REMISE = [...CATEGORIES_ISOFLOOR, 'ACCESSIBILITE'];

/**
 * Famille tarifaire d'un article, lue dans sa catégorie Odoo.
 *
 * Odoo range ses catégories en chemins : l'Hydraseal DPM est classé
 * « ISOMARK / FLOORING / EPOXY ». La fiche client, elle, ne connaît que le
 * dernier mot — EPOXY, MMA, PU. Chercher la clé telle quelle ne trouvait
 * donc rien, et la remise négociée du client restait lettre morte.
 *
 * On compare SEGMENT PAR SEGMENT, jamais en sous-chaîne : « Accessoires
 * Mats » ne doit pas passer pour ACCESSOIRES, sous peine de remiser 30 % des
 * articles de fixation ISOSIGN qui n'y ont pas droit.
 */
export function familleRemise(categorie?: string): string | undefined {
  const chemin = String(categorie || '').toUpperCase();
  if (!chemin || estPrestation(chemin)) return undefined;
  for (const seg of chemin.split('/').map(s => s.trim())) {
    if (FAMILLES_REMISE.includes(seg)) return seg;
  }
  return undefined;
}

/**
 * Prix revendeur : le prix PUBLIC moins la remise que porte la fiche client
 * pour la famille de l'article.
 *
 * C'est la règle, sans exception : les exceptions sont justement ce que la
 * fiche client enregistre, famille par famille. Le tarif de gamme —
 * ISOFLOOR à 30 %, ISOMARK H1 à 50 % — n'est qu'un défaut pour les clients
 * qui n'ont rien de négocié.
 *
 * La base est le prix public, jamais `prixTarif` : sur l'Hydraseal DPM les
 * deux diffèrent (264,70 € contre 244,80 €) et prendre le second remisait
 * 13,93 € de trop sur le seau.
 */
export function prixRevendeur(
  prixPublic: number | null | undefined,
  categorie?: string,
  remisesParCategorie?: Record<string, number>,
): PrixGamme | null {
  const pub = Number(prixPublic) || 0;
  if (pub <= 0 || !remisesParCategorie) return null;

  const famille = familleRemise(categorie);
  if (!famille) return null;

  const taux = Number(remisesParCategorie[famille]);
  if (!Number.isFinite(taux) || taux <= 0) return null;

  const remise = taux / 100;
  const prix = Math.round(pub * (1 - remise) * 100) / 100;
  return {
    /* Une remise négociée ne relève d'aucune gamme : le niveau reste vide,
       et c'est le libellé qui porte l'information. */
    niveau: null,
    libelle: `remise client ${famille}`,
    public: pub,
    prix,
    remise,
    explication: `remise client ${famille} — ${taux.toFixed(0)} % sur `
      + `${pub.toFixed(2)} € public → ${prix.toFixed(2)} €`,
  };
}

/** Ces deux gammes seules relèvent de ces remises. */
export function estGamme(catalogue?: string): boolean {
  const c = String(catalogue || '').toUpperCase();
  return c === 'ISOMARK' || c === 'ISOFLOOR';
}

export interface PrixGamme {
  niveau: NiveauGamme;
  /**
   * Ce qu'il faut afficher pour dire d'où vient la remise — « ISOFLOOR »,
   * « ISOMARK H1 », « remise client EPOXY ».
   *
   * L'écran le composait à partir de `niveau`, en préfixant « ISOMARK » à
   * tout ce qui n'était pas ISOFLOOR. Une remise négociée par le client n'a
   * pas de niveau de gamme : elle serait sortie en « ISOMARK EPOXY », ce qui
   * ne veut rien dire.
   */
  libelle: string;
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
      niveau, libelle: 'tarif public', public: pub, prix: pub, remise: 0,
      explication: `tarif public — niveau de remise inconnu `
        + `(catégorie « ${categorie || '—'} »)`,
    };
  }
  const remise = REMISE_GAMME[niveau];
  const prix = Math.round(pub * (1 - remise) * 100) / 100;
  return {
    niveau,
    libelle: niveau === 'ISOFLOOR' ? 'ISOFLOOR' : `ISOMARK ${niveau}`,
    public: pub, prix, remise,
    explication: `${niveau} — ${(remise * 100).toFixed(0)} % sur `
      + `${pub.toFixed(2)} € public → ${prix.toFixed(2)} €`,
  };
}
