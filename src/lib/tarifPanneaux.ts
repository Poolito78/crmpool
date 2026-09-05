import {
  TARIFS, PANO_TABLE, PANO_CLASS, SUP_PRIX, LONGUEURS_MAT, POSE, TAILLES,
  type NiveauTarif, type Gamme, type Taille, type GrilleForme,
} from '@/lib/tarifPanneaux.donnees';

export { TAILLES, LONGUEURS_MAT, POSE };
export type { NiveauTarif, Gamme, Taille };

/**
 * Chiffrage d'un panneau de police, de son panonceau et de son support.
 *
 * Un client écrit « B14 30 » et « C18 », rarement une référence. Le prix ne se
 * lit pas dans un catalogue d'articles : il se croise. Forme du panneau —
 * cercle pour un B, triangle pour un A —, gamme demandée, classe de
 * rétroréflexion. C'est ce que fait le Chiffrage ISOSIGN depuis toujours, et
 * ce module en reprend les règles.
 *
 * Il porte aussi la règle que vous rappelez : un panneau va rarement seul, le
 * panonceau qui l'accompagne se dimensionne d'après la gamme du panneau, et
 * les deux tiennent sur un mât dont la longueur dépend de la hauteur libre
 * réglementaire et de l'ancrage.
 */

/**
 * Niveau de tarif nommé par le contrat cadre Odoo.
 *
 * REFLEX SIGNALISATION porte « CCI10019 TARIF R4 - 35% REMISE
 * POLICE-DIREC-MAT-SUP-BRID-COLL-SIL ISOSIGN 2026 ». Le niveau y est écrit :
 * autant le lire plutôt que de supposer.
 *
 * ⚠ Les « 35 % » du libellé ne sont PAS une remise à appliquer : ils décrivent
 * comment R4 se déduit du tarif public. Vérifié sur la grille — le B14 gamme
 * petite classe 2 vaut 71,72 € en R0 et 46,62 € en R4, soit exactement −35 %.
 * Retrancher ces 35 % une seconde fois donnerait 30,30 €, un prix que personne
 * n'a jamais consenti.
 */
export function niveauDepuisContrat(contrat?: string | null): NiveauTarif | null {
  const t = String(contrat || '').toUpperCase();
  // « TARIF R4 » d'abord : un « R4 » isolé pourrait venir d'une référence.
  const explicite = t.match(/\bTARIFS?\s*[-–]?\s*R([0-4])\b/);
  if (explicite) return `R${explicite[1]}` as NiveauTarif;
  const seul = t.match(/\bR([0-4])\b/);
  return seul ? (`R${seul[1]}` as NiveauTarif) : null;
}

export const FORME_CERCLE = 'Cercle Ø (B - interdiction/obligation)';
export const FORME_TRIANGLE = 'Triangle (A - danger)';
export const FORME_OCTOGONE = 'Octogone STOP / triangle inversé (AB)';
export const FORME_CARRE = 'Carré (C - indication)';
export const FORME_LOSANGE = 'Losange (AB - priorité)';
export const FORME_RECTANGLE = 'Rectangle';
export const FORME_PANONCEAU = 'Panonceau';

/**
 * Forme tarifaire d'un code IISR.
 *
 * L'ordre des tests compte : AB4 et AB3 doivent être reconnus avant la règle
 * générale des « A », sans quoi un STOP serait facturé comme un triangle de
 * danger.
 */
/**
 * Ce code relève-t-il de la SIGNALISATION TEMPORAIRE ? `AK3`, `AK5`, `BK14`,
 * `KC1`, `KD22`.
 *
 * Elle se reconnaît désormais, pour que la gamme police ne se l'approprie
 * plus. Mais elle n'a AUCUNE grille dans ce fichier : les barèmes ici sont
 * ceux des panneaux de police, et un triangle de chantier — fond jaune,
 * classe T — ne s'y facture pas. Tant qu'on n'a pas son tarif, elle n'a ni
 * forme ni prix local : c'est Odoo qui la chiffre, et c'est honnête.
 */
export function estCodeChantier(code: string): boolean {
  const t = String(code || '').toUpperCase().replace(/\s+/g, '');
  return /^([ABC]K\d|K[A-Z]{0,2}\d)/.test(t);
}

export function formeDeCode(code: string): string | null {
  const t = String(code || '').toUpperCase().replace(/\s+/g, '');
  if (!t) return null;
  /* Avant tout le reste : sans cela « AK3 » tomberait sur « A\d » et
     ressortirait en triangle de police, avec le barème qui va avec. */
  if (estCodeChantier(t)) return null;
  if (/^M\d/.test(t)) return FORME_PANONCEAU;
  if (/^AB4/.test(t) || /^STOP/.test(t)) return FORME_OCTOGONE;
  if (/^AB3/.test(t)) return FORME_TRIANGLE;
  if (/^AB[16]/.test(t)) return FORME_LOSANGE;
  if (/^A\d/.test(t)) return FORME_TRIANGLE;
  if (/^B\d/.test(t)) return FORME_CERCLE;
  if (/^(C|CE)\d/.test(t)) return FORME_CARRE;
  return null;
}

/** Groupe d'association : les panneaux de danger portent des panonceaux plus larges. */
export function groupePanonceau(codePanneau: string): 'A' | 'ABC' {
  return /^A\d/.test(String(codePanneau || '').toUpperCase()) ? 'A' : 'ABC';
}

/** Au-delà, la mention ne tient plus sur une ligne et le panonceau grandit. */
export const LETTRES_UNE_LIGNE = 12;

/**
 * Classe de panonceau : 0 étroit une ligne, 1 deux lignes ou picto, 2 carré.
 *
 * Les panonceaux à mention libre — M9z, M9z1, M4z — n'ont pas de classe fixe :
 * elle dépend de ce qu'on y écrit. « RAPPEL » tient sur une ligne et donne un
 * 700x200 sous un A3a de 700 ; une mention longue en réclame deux, et le
 * panonceau passe au format haut.
 */
export function classePanonceau(code: string, mention?: string): number {
  const k = String(code || '').replace(/\s.*/, '');
  const fixe = PANO_CLASS[k];
  if (fixe != null) return fixe;

  if (/^M(9Z|4Z)/i.test(k)) {
    const lettres = String(mention || '').replace(/[^A-Za-zÀ-ÿ0-9]/g, '').length;
    if (lettres > LETTRES_UNE_LIGNE) return 1;
  }
  return 0;
}

/**
 * Remise appliquée au tarif public pour chaque niveau négocié.
 *
 * Les niveaux R1 à R4 ne sont pas des grilles indépendantes : ce sont le
 * tarif public R0 diminué d'un pourcentage fixe, ce qu'annonce d'ailleurs le
 * libellé des contrats — « TARIF R4 — 35 % REMISE ». Vérifié sur 197 des 198
 * valeurs de la table.
 */
const REMISE_NIVEAU: Record<string, number> = {
  R1: 0.80, R2: 0.75, R3: 0.70, R4: 0.65,
};

function grille(niveau: NiveauTarif, gamme: Gamme, forme: string): GrilleForme | null {
  const stockee = TARIFS[niveau]?.[gamme]?.[forme] ?? null;
  const taux = REMISE_NIVEAU[niveau];
  const publique = taux ? (TARIFS['R0']?.[gamme]?.[forme] ?? null) : null;
  if (!stockee || !publique) return stockee;

  /* La table stocke les niveaux négociés ARRONDIS AU CENTIME : le panonceau
     700x200 classe 2 y vaut 26,64 alors qu'Odoo facture 26,644 — soit
     40,99 × 0,65. L'écart ne se voit pas sur une unité mais atteint deux
     centimes sur quatre, et grandit avec les quantités : de quoi faire
     diverger un devis de sa contrepartie Odoo. On repart donc du tarif
     public en gardant le millième.

     Les classes absentes de R0 — le « Grand format » en R2 et R3 — gardent
     leur valeur stockée : sans tarif public, il n'y a rien d'où dériver. */
  const prix: Record<string, number[]> = { ...stockee.prix };
  for (const [classe, valeurs] of Object.entries(publique.prix)) {
    prix[classe] = valeurs.map((v) =>
      v == null ? v : Math.round(v * taux * 1000) / 1000);
  }
  return { ...stockee, prix };
}

export interface Chiffre {
  /** Prix unitaire HT au niveau demandé. */
  prix: number;
  /** Dimension retenue, telle qu'elle figure au tarif. */
  dimension: string;
  forme: string;
  /** Ce qui a servi au calcul, à montrer pour que le devis soit relisible. */
  explication: string;
}

/**
 * Prix d'un panneau, d'après son code, sa gamme et sa classe.
 *
 * Renvoie `null` quand la combinaison n'existe pas au tarif — un triangle en
 * classe 1 n'existe qu'en trois tailles, par exemple. On ne rabat pas sur une
 * taille voisine : le prix serait faux et l'article aussi.
 */
export function prixPanneau(
  code: string,
  { taille = 'P', classe = 2, niveau = 'R4', gamme = 'Magellan (dos ouvert)' }: {
    taille?: Taille; classe?: number; niveau?: NiveauTarif; gamme?: Gamme;
  } = {},
): Chiffre | null {
  const forme = formeDeCode(code);
  if (!forme || forme === FORME_PANONCEAU) return null;

  const g = grille(niveau, gamme, forme);
  if (!g) return null;

  const i = TAILLES.indexOf(taille);
  const serie = g.prix[String(classe)];
  const prix = serie?.[i];
  if (prix == null) return null;

  return {
    prix,
    dimension: g.sizes[i] ?? '',
    forme,
    explication: `${forme.split(' (')[0]} ${g.sizes[i]} classe ${classe} — tarif ${niveau}`,
  };
}

/**
 * Panonceau qui accompagne un panneau, dimensionné d'après sa gamme.
 *
 * Le dimensionnement ne se choisit pas : le panonceau doit s'aligner sur la
 * largeur du panneau. La table d'association du catalogue le donne, croisant
 * le groupe du panneau, la classe du panonceau et la gamme.
 *
 * Les gammes G et TG manquent souvent au tarif ; on redescend alors à la plus
 * grande dimension disponible de la même classe, comme le fait le Chiffrage.
 */
export function panonceauPour(
  codePanonceau: string,
  codePanneau: string,
  { taille = 'P', classe = 2, niveau = 'R4', gamme = 'Magellan (dos ouvert)', mention }: {
    taille?: Taille; classe?: number; niveau?: NiveauTarif; gamme?: Gamme;
    /** Texte porté par le panonceau — décide de sa hauteur sur les M9z. */
    mention?: string;
  } = {},
): Chiffre | null {
  const g = grille(niveau, gamme, FORME_PANONCEAU);
  if (!g) return null;

  /* Le GROUPE vient du panneau — un danger porte des panonceaux plus larges —
     mais la CLASSE vient du panonceau lui-même : c'est lui qui a une ou deux
     lignes. La classe était lue sur le code du panneau, qui ne figure jamais
     dans PANO_CLASS : tout retombait donc en classe 0, et un M4c à
     pictogramme sortait au format d'un M1 sur une ligne. */
  const groupe = groupePanonceau(codePanneau);
  const dims = PANO_TABLE[groupe]?.[String(classePanonceau(codePanonceau, mention))];
  if (!dims) return null;

  const depart = Math.max(0, Math.min(4, TAILLES.indexOf(taille)));
  let i = -1;
  let dimension = '';
  for (let t = depart; t >= 0 && i < 0; t--) {
    dimension = dims[t];
    i = g.sizes.indexOf(dimension);
  }
  if (i < 0) return null;

  const prix = g.prix[String(classe)]?.[i];
  if (prix == null) return null;

  return {
    prix,
    dimension,
    forme: FORME_PANONCEAU,
    explication: `panonceau ${dimension} pour ${codePanneau} en gamme ${taille}, classe ${classe}`,
  };
}

export interface Support {
  /** Longueur normalisée, en mètres. */
  longueur: number;
  prix: number;
  /** Colliers de fixation, un par élément porté. */
  colliers: number;
  prixColliers: number;
  explication: string;
}

/**
 * Mât Ø60 pour un ensemble panneau + panonceau.
 *
 * La longueur se déduit de la réglementation, pas d'un choix : hauteur libre
 * sous le panneau le plus bas (2,10 m en agglomération), plus la hauteur de ce
 * qui est porté, plus l'ancrage (0,50 m). On arrondit ensuite à la longueur
 * standard immédiatement supérieure — un mât ne se coupe pas à la demande.
 */
export function supportPour(
  hauteursPorteesM: number[],
  { niveau = 'R4', hauteurLibre = POSE.hauteurLibre }: {
    niveau?: NiveauTarif; hauteurLibre?: number;
  } = {},
): Support | null {
  const p = SUP_PRIX[niveau] ?? SUP_PRIX.R4;
  if (!p) return null;

  const porte = hauteursPorteesM.reduce((s, h) => s + (h || 0), 0);
  const besoin = POSE.ancrage + hauteurLibre + porte;
  const longueur = LONGUEURS_MAT.find(l => l >= besoin - 1e-6)
    ?? LONGUEURS_MAT[LONGUEURS_MAT.length - 1];

  let prix = p.mat[String(longueur)];
  if (prix == null) {
    // Au-delà de 5 m le tarif se prolonge au mètre linéaire.
    prix = Math.round((p.mat['5'] + (longueur - 5) * p.leml) * 100) / 100;
  }

  const colliers = Math.max(1, hauteursPorteesM.length);
  return {
    longueur,
    prix,
    colliers,
    prixColliers: Math.round(colliers * p.collier * 100) / 100,
    explication: `${longueur} m = ${POSE.ancrage} d'ancrage + ${hauteurLibre} de hauteur libre`
      + ` + ${Math.round(porte * 100) / 100} porté(s), arrondi au standard supérieur`,
  };
}

/** Hauteur hors-tout d'une dimension du tarif : « 650 (P) » → 0,65 m ; « 500x150 » → 0,15 m. */
export function hauteurDeDimension(dimension: string): number {
  const d = String(dimension || '');
  const lxh = d.match(/(\d+)\s*x\s*(\d+)/i);
  if (lxh) return Number(lxh[2]) / 1000;
  const seul = d.match(/(\d+)/);
  return seul ? Number(seul[1]) / 1000 : 0;
}

/**
 * Code IISR reconnu dans une demande en clair.
 *
 * « B14 « 30 » » donne B14-30, « C18 » donne C18. La valeur accolée compte :
 * elle distingue une limitation à 30 d'une limitation à 50, qui sont deux
 * articles et deux prix identiques mais deux marchandises différentes.
 */
export function codeDansTexte(texte: string): { code: string; valeur?: string } | null {
  const t = String(texte || '').toUpperCase();
  /* La lettre de variante peut être suivie d'un chiffre : B21a2, B21a1, M9z1,
     AB3a. Le motif s'arrêtait à la lettre, puis exigeait une fin de mot — qui
     n'arrivait pas, le chiffre étant un caractère de mot. Le B21a2 n'était donc
     reconnu ni comme panneau, ni comme rien : ni tarif, ni recherche Odoo. */
  /* EB10 et EB20 en tête de l'alternance : sans eux, « EB10 » n'était reconnu
     par aucune branche — « E\d » exige un chiffre juste après le E, et
     « B\d » réclame une frontière de mot que le E empêche. Ces panneaux
     d'agglomération ne recevaient donc ni forme, ni tarif, ni recherche
     Odoo. Les placer d'abord évite aussi qu'une autre branche ne morde
     dessus. */
  /* LA GAMME CHANTIER EN TÊTE, AVANT TOUT LE RESTE.
     L'alternance ne la connaissait pas. Sur « 2 AK3 1000 C2 », aucune branche
     ne mordait sur AK3 — « A\d » réclame un chiffre juste après le A — mais
     « C\d » mordait sur le segment de CLASSE, et l'AK3 ressortait en carré
     C2 : mauvaise forme, mauvaise grille, et le sélecteur de gamme s'affichait
     pour un panneau qui n'en relève pas. La placer d'abord règle les deux. */
  const m = t.match(/\b([ABC]K\d{1,2}[A-Z]?\d?|K[A-Z]{0,2}\d{1,3}[A-Z]?\d?|EB\d{1,2}|AB\d{1,2}[A-Z]?\d?|A\d{1,3}[A-Z]?\d?|B\d{1,3}[A-Z]?\d?|CE\d{1,3}[A-Z]?\d?|C\d{1,3}[A-Z]?\d?|M\d{1,2}[A-Z]?\d?|E\d{1,3}[A-Z]?\d?)\b/);
  if (!m) return null;
  const code = m[1];
  // Une valeur entre guillemets ou juste après : « B14 « 30 » ».
  const apres = t.slice(t.indexOf(code) + code.length, t.indexOf(code) + code.length + 14);
  const v = apres.match(/[«"'\s]*(\d{1,3})\b/);
  return { code, valeur: v ? v[1] : undefined };
}
