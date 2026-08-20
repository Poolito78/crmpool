/**
 * Composition et dimensionnement d'un panneau de signalisation de direction.
 *
 * Un panneau directionnel ne se choisit pas dans un catalogue : sa taille est
 * la conséquence de ce qui est écrit dessus. Le logiciel Kadri, qui fait
 * référence chez ISOSIGN, procède ainsi et ce module reproduit son résultat.
 *
 * L'enchaînement, établi en confrontant les BAT Kadri aux règles de
 * l'Instruction interministérielle :
 *
 *  1. Chaque mention est composée dans son alphabet et mesurée.
 *  2. La LARGEUR est commune à tout l'ensemble : c'est la mention la plus
 *     longue qui impose le format, les autres s'y alignent. Vérifié sur dix
 *     ensembles Kadri sur onze.
 *  3. La largeur nécessaire est arrondie au format normalisé supérieur.
 *  4. L'échelle horizontale est alors le résultat, pas une donnée : elle est
 *     calculée pour que le texte remplisse la largeur utile, et plafonnée à
 *     125 %. Une échelle de 125 % signale un texte trop court pour son
 *     panneau ; toute valeur inférieure, un texte qui remplit.
 *
 * La HAUTEUR, elle, ne se calcule pas : elle se lit dans la table du
 * fabricant, à partir du nombre de lignes et de la hauteur de composition.
 *
 * Les lignes COMPOSITES — « L4 250 200 » pour « 900 m », « L1 100 80 » pour
 * « 3,5 » — se déclarent par le champ `fin` d'une mention : la seconde
 * hauteur s'applique à la fin du texte.
 *
 * Les panneaux d'AGGLOMÉRATION — EB10 en entrée, EB20 en sortie — relèvent
 * d'une logique différente et ont leur propre fonction,
 * `dimensionnerAgglomeration` : le fabricant les dimensionne au comptage de
 * caractères, pas à la mesure du texte. Ne pas les passer à
 * `dimensionnerPanneau`, qui les traiterait comme des directionnels à pointe.
 */

import { ALPHABETS, UNITES_PAR_HC, type Alphabet } from './alphabetsSignalisation.donnees';

/**
 * Gammes de hauteur de composition, en millimètres.
 *
 * Monter « d'une gamme » (le « Hc + 1 » de l'Instruction, appliqué aux fonds
 * foncés) revient à prendre la valeur suivante de cette liste.
 */
export const GAMMES_HC = [100, 125, 160, 200, 250, 320] as const;

/** Largeurs normalisées du panneau de direction LAPEROUSE, en millimètres. */
export const LARGEURS_NORMALISEES = [800, 1000, 1300, 1600, 1900, 2200, 2500] as const;

/**
 * Hauteur du panneau selon le nombre de lignes et la hauteur de composition.
 *
 * Table du fabricant : la hauteur n'est pas une formule. Une ligne en 100
 * donne 250 ; deux lignes en 100 donnent 400 ; trois lignes en 100 donnent
 * 600 — l'interligne n'est pas proportionnel.
 */
const HAUTEURS: { hauteur: number; lignes: number; hc: number }[] = [
  { hauteur: 250, lignes: 1, hc: 100 },
  { hauteur: 300, lignes: 1, hc: 125 },
  { hauteur: 400, lignes: 1, hc: 160 },
  { hauteur: 400, lignes: 2, hc: 100 },
  { hauteur: 500, lignes: 1, hc: 200 },
  { hauteur: 500, lignes: 2, hc: 125 },
  { hauteur: 600, lignes: 1, hc: 250 },
  { hauteur: 600, lignes: 2, hc: 160 },
  { hauteur: 600, lignes: 3, hc: 100 },
  { hauteur: 750, lignes: 2, hc: 200 },
  { hauteur: 750, lignes: 3, hc: 125 },
  { hauteur: 900, lignes: 2, hc: 250 },
  { hauteur: 900, lignes: 3, hc: 160 },
  { hauteur: 1200, lignes: 3, hc: 200 },
  { hauteur: 1200, lignes: 3, hc: 250 },
];

/**
 * Combinaisons interdites par le fabricant : un format trop étroit pour sa
 * hauteur n'existe pas. Largeur minimale admise pour chaque hauteur.
 */
const LARGEUR_MINI: Record<number, number> = {
  250: 800, 300: 800, 400: 800, 500: 800,
  600: 1000, 750: 1300, 900: 1600, 1200: 1900,
};

/**
 * Espacement additionnel entre caractères, en proportion de Hc.
 *
 * Les avances de la police ne suffisent pas : Kadri ajoute un espacement,
 * gouverné par le « coefficient d'espacement » qui figure sur ses plans.
 * Faute d'en connaître la définition officielle, cette valeur a été ajustée
 * par moindres carrés sur neuf mentions relevées sur les BAT. Elle reproduit
 * les longueurs de Kadri à 1,4 % en moyenne.
 */
export const ESPACEMENT_PAR_HC = 0.0315;

/** Échelle horizontale maximale : au-delà, le texte n'est plus étiré. */
export const ECHELLE_MAX = 1.25;

/**
 * Ramène aux caractères que portent réellement les polices.
 *
 * Une mention saisie au clavier ou recopiée d'un courriel arrive avec des
 * apostrophes et des tirets typographiques que les alphabets normalisés ne
 * contiennent pas. Les refuser priverait de prix des mentions parfaitement
 * ordinaires — « L'ANGLAIS », « SAINT‑DENIS » — alors qu'elles se composent
 * sans difficulté une fois ces signes ramenés à leur équivalent simple.
 */
function normaliser(texte: string): string {
  return texte
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u00A0\u202F\u2009]/g, ' ');
}

/**
 * Longueur d'une mention composée, en millimètres, à l'échelle 100 %.
 *
 * Renvoie `null` si un caractère n'appartient pas à l'alphabet — mieux vaut
 * ne rien proposer qu'une largeur fausse.
 */
export function longueurMention(
  texte: string,
  alphabet: Alphabet,
  hc: number,
): number | null {
  const { avances, crenage } = ALPHABETS[alphabet];
  let unites = 0;
  let precedent: string | null = null;
  let nb = 0;

  for (const c of normaliser(texte)) {
    const avance = avances[c];
    if (avance === undefined) return null;
    if (precedent !== null) unites += crenage[precedent + c] ?? 0;
    unites += avance;
    precedent = c;
    nb++;
  }
  if (!nb) return 0;

  const largeurCaracteres = (unites * hc) / UNITES_PAR_HC;
  return largeurCaracteres + ESPACEMENT_PAR_HC * hc * (nb - 1);
}

/**
 * Longueur totale d'une mention, fin composée comprise.
 *
 * Renvoie `null` dès qu'un caractère manque : mieux vaut ne rien proposer
 * qu'une largeur fausse.
 */
export function longueurMentionComplete(m: Mention, hc: number): number | null {
  const debut = longueurMention(m.texte, m.alphabet, hc);
  if (debut === null) return null;
  if (!m.fin) return debut;
  const fin = longueurMention(m.fin.texte, m.fin.alphabet ?? m.alphabet, m.fin.hc);
  return fin === null ? null : debut + fin;
}

/**
 * Place perdue sur la largeur, de part et d'autre du texte.
 *
 * Deux marges latérales de 0,5 Hc chacune (règle de l'Instruction), plus la
 * pointe du panneau directionnel, qui vaut environ deux tiers de sa hauteur.
 * Ce coefficient est mesuré : 0,652 avec un écart-type de 0,013 sur sept
 * relevés, les prédictions tombant à ±7 mm.
 *
 * Un panneau rectangulaire — les EB d'agglomération notamment — n'a pas de
 * pointe. Sa marge propre reste à établir : il laisse un reliquat inexpliqué
 * au-delà des marges latérales, d'où le refus de le traiter ici.
 */
export function margeLargeur(hc: number, hauteurPanneau: number): number {
  return hc + (2 / 3) * hauteurPanneau;
}

export interface Mention {
  texte: string;
  alphabet: Alphabet;
  /**
   * Fin de mention composée dans une hauteur plus petite.
   *
   * Kadri la note en listant deux hauteurs : « L4 250 200 » pour « 900 m »
   * (le « m » en 200), « L1 100 80 » pour « 3,5 » (le « ,5 » en 80), ou en
   * changeant aussi d'alphabet, « L1 250 L4 200 » pour « 33.1 ». La règle,
   * vérifiée sur sept mentions, est que la seconde hauteur s'applique à la
   * FIN du texte.
   */
  fin?: {
    texte: string;
    hc: number;
    /** Par défaut, le même alphabet que le début de la mention. */
    alphabet?: Alphabet;
  };
}

export interface Panneau {
  /** Largeur normalisée retenue, en millimètres. */
  largeur: number;
  /** Hauteur lue dans la table du fabricant, en millimètres. */
  hauteur: number;
  /** Hauteur de composition employée. */
  hc: number;
  /** Échelle horizontale par mention, dans l'ordre reçu. Plafonnée à 125 %. */
  echelles: number[];
  /** Longueur composée de chaque mention à l'échelle retenue, en millimètres. */
  longueurs: number[];
  explication: string;
}

/**
 * Dimensionne un panneau portant une ou plusieurs mentions.
 *
 * Renvoie `null` quand aucun format ne convient — texte trop long pour la
 * gamme, nombre de lignes hors table, ou caractère inconnu. Ne jamais
 * inventer un format : un devis faux coûte plus cher qu'un devis absent.
 */
export function dimensionnerPanneau(
  mentions: Mention[],
  hc: number,
): Panneau | null {
  if (!mentions.length) return null;

  const ligne = HAUTEURS.find((h) => h.lignes === mentions.length && h.hc === hc);
  if (!ligne) return null;
  const hauteur = ligne.hauteur;

  const brutes = mentions.map((m) => longueurMentionComplete(m, hc));
  if (brutes.some((l) => l === null)) return null;
  const longueurs = brutes as number[];

  /* Le texte peut être étiré jusqu'à 125 % : c'est donc la longueur ÉTIRÉE
     qui commande le format, sans quoi on retiendrait un panneau où la
     mention la plus longue ne tiendrait pas. */
  const requise = Math.max(...longueurs) * ECHELLE_MAX;
  const marge = margeLargeur(hc, hauteur);
  const mini = LARGEUR_MINI[hauteur] ?? 0;

  const largeur = LARGEURS_NORMALISEES.find(
    (l) => l >= mini && l - marge >= requise,
  );
  if (largeur === undefined) return null;

  const utile = largeur - marge;
  const echelles = longueurs.map((l) => (l > 0 ? Math.min(ECHELLE_MAX, utile / l) : ECHELLE_MAX));

  return {
    largeur,
    hauteur,
    hc,
    echelles,
    longueurs: longueurs.map((l, i) => l * echelles[i]),
    explication:
      `${mentions.length} ligne(s) en Hc ${hc} → hauteur ${hauteur} ; `
      + `mention la plus longue ${Math.max(...longueurs).toFixed(0)} mm, `
      + `marge ${marge.toFixed(0)} mm → largeur ${largeur}`,
  };
}

/**
 * Dimensionne un ENSEMBLE de panneaux portés par le même mât.
 *
 * C'est la fonction à employer en pratique : sur un mât, tous les panneaux
 * directionnels partagent la même largeur — celle qu'impose la mention la
 * plus longue de l'ensemble. Dimensionner chaque panneau isolément donne un
 * résultat faux dès qu'un voisin est plus large, ce que confirment les BAT
 * Kadri : « Z.A. ALLENDE » y occupe un 1600 alors que son texte tiendrait
 * dans un 1300, parce qu'il voisine avec une mention plus longue.
 *
 * Chaque panneau garde en revanche SA hauteur, qui ne dépend que de son
 * propre nombre de lignes.
 *
 * Renvoie `null` si un seul des panneaux ne peut pas être dimensionné.
 */
export function dimensionnerEnsemble(
  panneaux: Mention[][],
  hc: number,
): Panneau[] | null {
  if (!panneaux.length) return null;

  const seuls = panneaux.map((p) => dimensionnerPanneau(p, hc));
  if (seuls.some((p) => p === null)) return null;

  /* La largeur commune est la plus grande de celles que réclament les
     panneaux pris un à un. */
  const largeur = Math.max(...(seuls as Panneau[]).map((p) => p.largeur));

  return (seuls as Panneau[]).map((p, i) => {
    const utile = largeur - margeLargeur(hc, p.hauteur);
    const naturelles = panneaux[i].map(
      (m) => longueurMentionComplete(m, hc) as number,
    );
    const echelles = naturelles.map((l) =>
      (l > 0 ? Math.min(ECHELLE_MAX, utile / l) : ECHELLE_MAX));
    return {
      ...p,
      largeur,
      echelles,
      longueurs: naturelles.map((l, j) => l * echelles[j]),
      explication: `${p.explication} ; largeur portée à ${largeur} par l'ensemble`,
    };
  });
}

// ----------------------------------- entrée et sortie d'agglomération

/**
 * Panneaux d'agglomération EB10 (entrée) et EB20 (sortie), catégorie SD1,
 * nom porté sur UNE ligne.
 *
 * Ces panneaux échappent au calcul typographique : le fabricant les
 * dimensionne au simple COMPTAGE de caractères. La règle est volontairement
 * prudente — « MARSEILLE », neuf caractères, mesure 828 mm quand la table lui
 * accorde 1300 — car elle doit valoir quelles que soient les lettres : un
 * « IIIIIIIII » et un « MMMMMMMMM » reçoivent le même format.
 *
 * On s'y tient plutôt que d'appliquer notre propre mesure, et ce n'est pas
 * seulement par prudence commerciale : `longueurMention` DONNE UN RÉSULTAT
 * FAUX sur ces panneaux. Vérifié sur l'EB10 du dossier AF035681, qui porte
 * « MOULIGNON » — notre mesure annonce 738 mm quand Kadri en compose 899,
 * soit 18 % trop court. Les lettres d'un panneau d'agglomération sont bien
 * plus espacées que celles d'un directionnel : environ 22 % de la hauteur de
 * caractère entre deux signes, contre 3,15 % ailleurs. Ne jamais mesurer un
 * EB avec les fonctions du haut de ce fichier.
 *
 * L'entrée et la sortie ne se composent pas pareil : l'EB10 s'écrit en 125 mm
 * sur un panneau de 400 de haut, l'EB20 en 100 mm sur 250 de haut. D'où deux
 * tables, celle de l'EB20 admettant plus de signes à largeur égale puisque
 * ses lettres sont plus petites.
 */
const AGGLOMERATION = {
  EB10: {
    hc: 125,
    hauteur: 400,
    formats: [
      { largeur: 800, caracteres: 5 },
      { largeur: 1000, caracteres: 7 },
      { largeur: 1300, caracteres: 9 },
      { largeur: 1600, caracteres: 11 },
      { largeur: 1900, caracteres: 14 },
      { largeur: 2200, caracteres: 17 },
      { largeur: 2500, caracteres: 19 },
    ],
  },
  EB20: {
    hc: 100,
    hauteur: 250,
    formats: [
      { largeur: 800, caracteres: 7 },
      { largeur: 1000, caracteres: 9 },
      { largeur: 1300, caracteres: 12 },
      { largeur: 1600, caracteres: 15 },
      { largeur: 1900, caracteres: 18 },
      { largeur: 2200, caracteres: 20 },
    ],
  },
} as const;

export type TypeAgglomeration = keyof typeof AGGLOMERATION;

export interface PanneauAgglomeration {
  type: TypeAgglomeration;
  largeur: number;
  hauteur: number;
  hc: number;
  /** Nombre de signes décomptés, espaces et traits d'union compris. */
  caracteres: number;
  explication: string;
}

/**
 * Dimensionne un panneau d'entrée (EB10) ou de sortie (EB20)
 * d'agglomération portant le nom sur une seule ligne.
 *
 * Renvoie `null` quand le nom dépasse la table : il doit alors être composé
 * sur deux lignes, ce qui relève d'un autre format. C'est le cas de l'EB10 de
 * QUINCY du dossier AF035681, dont le plan Kadri porte bien deux lignes.
 */
/**
 * Reconnaît un panneau d'agglomération dans un code IISR.
 *
 * Renvoie `null` pour tout le reste : c'est ce test qui aiguille vers
 * `dimensionnerAgglomeration` plutôt que vers le calcul des directionnels.
 */
export function typeAgglomeration(code: string): TypeAgglomeration | null {
  const t = String(code || '').toUpperCase().replace(/\s+/g, '');
  if (/^EB10\b/.test(t)) return 'EB10';
  if (/^EB20\b/.test(t)) return 'EB20';
  return null;
}

/**
 * Cherche le nom d'agglomération écrit à la suite du code, dans la demande.
 *
 * Le client l'indique parfois — « 2 EB10 MOULIGNON » — mais souvent pas : sur
 * le devis AF035681, la demande dit seulement « EB10 2 UNITES » et le nom
 * n'apparaît qu'au moment du plan. Cette lecture est donc une commodité, pas
 * une source sûre : l'utilisateur doit toujours pouvoir corriger.
 *
 * On ne retient qu'un nom en capitales, éventuellement composé
 * (« SAINT-PIERRE-DU-VAUVRAY »), et on écarte les mots qui décrivent la
 * commande plutôt que le panneau — « 2 UNITES », « ENTREE D'AGGLOMERATION ».
 */
const MOTS_NON_NOMS = new Set([
  'UNITE', 'UNITES', 'ENTREE', 'ENTREES', 'SORTIE', 'SORTIES', 'PANNEAU',
  'PANNEAUX', 'AGGLO', 'AGGLOMERATION', 'CLASSE', 'CL', 'DE', 'DU', 'DES',
  'ET', 'AVEC', 'POUR', 'SUR', 'EN', 'LE', 'LA', 'LES', 'PCS', 'PIECE',
  'PIECES', 'U', 'X',
]);

export function nomAgglomerationDansTexte(
  texte: string,
  code: string,
): string | null {
  const t = String(texte || '');
  const i = t.toUpperCase().indexOf(String(code || '').toUpperCase());
  if (i === -1) return null;

  const apres = t.slice(i + code.length, i + code.length + 60);
  /* Un nom de commune : capitales, accents et traits d'union admis, au moins
     trois lettres pour écarter les abréviations. */
  const m = apres.match(/[^A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŒ]*([A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŒ][A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŒ'\- ]{2,})/);
  if (!m) return null;

  const brut = m[1].trim().replace(/\s{2,}/g, ' ');
  /* Le nom s'arrête au premier mot qui décrit la commande. Sans ce filtre,
     « EB10 2 UNITES » rendrait « UNITES » comme nom d'agglomération. */
  const mots: string[] = [];
  for (const mot of brut.split(' ')) {
    if (MOTS_NON_NOMS.has(mot.replace(/[^A-ZÀ-Ü]/g, ''))) break;
    mots.push(mot);
  }
  const nom = mots.join(' ').replace(/[-'\s]+$/, '').trim();
  return nom.length >= 3 ? nom : null;
}

export function dimensionnerAgglomeration(
  nom: string,
  type: TypeAgglomeration = 'EB10',
): PanneauAgglomeration | null {
  const texte = nom.trim();
  if (!texte) return null;

  const gamme = AGGLOMERATION[type];
  /* Tout signe compte, espaces et traits d'union compris : c'est
     l'encombrement qui décide, pas le nombre de lettres. */
  const caracteres = [...texte].length;
  const format = gamme.formats.find((f) => caracteres <= f.caracteres);
  if (!format) return null;

  return {
    type,
    largeur: format.largeur,
    hauteur: gamme.hauteur,
    hc: gamme.hc,
    caracteres,
    explication:
      `« ${texte} » : ${caracteres} signe(s) → ${type} de ${format.largeur} × `
      + `${gamme.hauteur} mm (SD1, une ligne, Hc ${gamme.hc})`,
  };
}
