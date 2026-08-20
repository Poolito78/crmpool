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
 * Panneaux d'agglomération EB10 (entrée) et EB20 (sortie), catégorie SD1.
 *
 * Ces panneaux échappent au calcul typographique : le fabricant les
 * dimensionne au simple COMPTAGE de caractères. La règle est volontairement
 * prudente — « MARSEILLE », neuf caractères, mesure 828 mm quand la table lui
 * accorde 1300 — car elle doit valoir quelles que soient les lettres : un
 * « IIIIIIIII » et un « MMMMMMMMM » reçoivent le même format.
 *
 * On s'y tient plutôt que d'appliquer notre propre mesure, et ce n'est pas
 * seulement par prudence commerciale : `longueurMention` DONNE UN RÉSULTAT
 * FAUX sur ces panneaux. Le plan Kadri du dossier AF035681 le chiffre deux
 * fois : « MOULIGNON » composé en L1 100 y occupe 899 mm à l'échelle 105 %,
 * soit 856 mm de longueur de base, quand nous en calculons 703 ; la ligne de
 * commune « c°ne de QUINCY-VOISINS » y occupe 1078 mm, soit 1027 de base,
 * quand nous en calculons 830. Dans les deux cas nous sommes environ 20 %
 * trop courts. Les lettres d'un panneau d'agglomération sont bien plus
 * espacées que celles d'un directionnel : de l'ordre de 0,19 Hc entre deux
 * signes, contre 0,0315 Hc ailleurs — ce serait le « coefficient d'espacement
 * 70 % » que Kadri imprime au bas de chaque plan. Tant que ce coefficient
 * n'est pas élucidé, ne jamais mesurer un EB avec les fonctions du haut de ce
 * fichier.
 *
 * CE QUI COMMANDE LE FORMAT, C'EST LA HAUTEUR DE COMPOSITION, PAS L'ENTRÉE
 * OU LA SORTIE. Le point a longtemps été masqué : les deux tables du
 * fabricant, distribuées comme « table EB10 » et « table EB20 », sont en
 * réalité la table du Hc 125 et celle du Hc 100. Le plan AF035681 le
 * démontre : son EB10 et son EB20 portent le même nom, sont tous deux
 * composés en Hc 100, et font tous deux 1300 × 400. S'ils relevaient de deux
 * tables différentes, ils n'auraient pas la même largeur.
 *
 * Le Hc suit la vitesse de la voie : 100 mm jusqu'à 70 km/h, 125 mm à
 * 80 km/h.
 *
 * DEUX LIGNES, ET LA MENTION DE COMMUNE. Il faut distinguer deux mises en
 * page que le mot « deux lignes » confond :
 *
 *  - Le NOM sur deux lignes, chacune à pleine hauteur de composition.
 *  - Le nom sur une ligne, suivi d'une MENTION DE COMMUNE composée à
 *    62,5 mm en italique — l'alphabet L4 — quand la commune diffère de
 *    l'agglomération : « MOULIGNON » puis « c°ne de QUINCY-VOISINS ».
 *
 * Dans les deux cas le panneau gagne un cran de hauteur, et c'est la même
 * échelle qui sert : 250, puis 400, puis 600.
 */

/**
 * Comptages de caractères par hauteur de composition.
 *
 * Une seule entrée par largeur normalisée : le nombre maximal de signes que
 * la largeur admet. Les deux tables sont homothétiques à 1,25 près, ce qui
 * est cohérent avec un simple changement d'échelle entre Hc 100 et Hc 125.
 */
const FORMATS_PAR_HC: Record<number, { largeur: number; caracteres: number }[]> = {
  100: [
    { largeur: 800, caracteres: 7 },
    { largeur: 1000, caracteres: 9 },
    { largeur: 1300, caracteres: 12 },
    { largeur: 1600, caracteres: 15 },
    { largeur: 1900, caracteres: 18 },
    { largeur: 2200, caracteres: 20 },
  ],
  125: [
    { largeur: 800, caracteres: 5 },
    { largeur: 1000, caracteres: 7 },
    { largeur: 1300, caracteres: 9 },
    { largeur: 1600, caracteres: 11 },
    { largeur: 1900, caracteres: 14 },
    { largeur: 2200, caracteres: 17 },
    { largeur: 2500, caracteres: 19 },
  ],
};

/** Hauteurs de panneau admises, par crans successifs. */
const ECHELLE_HAUTEURS = [250, 400, 600] as const;

/**
 * Hauteur du panneau : un cran de départ donné par le Hc, puis un cran de
 * plus par ligne supplémentaire — seconde ligne de nom ou mention de commune.
 *
 * Les quatre cas attestés tombent tous sur cette règle :
 *
 *   Hc 100, 1 ligne, sans mention → 250   (table fabricant EB20 une ligne)
 *   Hc 100, 1 ligne, avec mention → 400   (plan Kadri AF035681, EB10 et EB20)
 *   Hc 125, 1 ligne, sans mention → 400   (table fabricant EB10 une ligne)
 *   Hc 125, 2 lignes, sans mention → 600  (table fabricant EB10 deux lignes)
 *
 * Renvoie `null` au-delà du dernier cran : un Hc 125 sur deux lignes AVEC
 * mention dépasserait 600 et n'est attesté nulle part.
 */
function hauteurAgglomeration(
  hc: number,
  lignesNom: number,
  avecMention: boolean,
): number | null {
  const depart = hc >= 125 ? 1 : 0;
  const cran = depart + (lignesNom - 1) + (avecMention ? 1 : 0);
  return ECHELLE_HAUTEURS[cran] ?? null;
}

/** Hauteur de composition d'une mention de commune, en millimètres. */
export const HC_MENTION_COMMUNE = 62.5;

/** Hauteur de composition retenue par défaut, faute de vitesse connue. */
export const HC_AGGLO_DEFAUT = 125;

export type TypeAgglomeration = 'EB10' | 'EB20';

export interface PanneauAgglomeration {
  type: TypeAgglomeration;
  largeur: number;
  hauteur: number;
  hc: number;
  /** Nombre de lignes de nom composées sur le panneau. */
  lignes: number;
  /** Une mention de commune est-elle portée sous le nom ? */
  mention: boolean;
  /**
   * Nombre de signes de la ligne de nom la plus longue, espaces et traits
   * d'union compris — c'est elle qui impose la largeur.
   */
  caracteres: number;
  /**
   * Vrai quand une mention de commune accompagne le nom : elle est composée
   * plus petit, mais elle est souvent plus longue, et elle peut alors imposer
   * le format au-dessus. Le comptage de caractères ne sait pas l'anticiper,
   * puisque les deux lignes n'ont pas la même hauteur. Sur le plan AF035681,
   * elle a fait passer le panneau de 1000 à 1300.
   */
  largeurAConfirmer: boolean;
  explication: string;
}

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

export interface OptionsAgglomeration {
  type?: TypeAgglomeration;
  /**
   * Hauteur de composition, 100 ou 125 mm, selon la vitesse de la voie.
   * Par défaut 125 : c'est le cas défavorable, donc le devis prudent.
   */
  hc?: number;
  /** Mention de commune portée sous le nom, en 62,5 mm italique. */
  mention?: string;
}

export function dimensionnerAgglomeration(
  nom: string | string[],
  options: OptionsAgglomeration | TypeAgglomeration = {},
): PanneauAgglomeration | null {
  /* Ancien appel positionnel `dimensionnerAgglomeration(nom, 'EB20')` : on
     l'accepte encore pour ne pas casser les appelants existants. */
  const opts: OptionsAgglomeration =
    typeof options === 'string' ? { type: options } : options;
  const type = opts.type ?? 'EB10';
  const hc = opts.hc ?? HC_AGGLO_DEFAUT;
  const mention = String(opts.mention ?? '').trim();

  /* Une chaîne = une ligne ; un tableau = autant de lignes que d'entrées.
     Les lignes vides sont écartées : « ["MOULIGNON", ""] » reste un panneau
     une ligne. */
  const lignesTexte = (Array.isArray(nom) ? nom : [nom])
    .map((l) => String(l ?? '').trim())
    .filter((l) => l.length > 0);
  if (!lignesTexte.length) return null;

  const formats = FORMATS_PAR_HC[hc];
  /* Hc hors des deux tables du fabricant : on ne devine pas. */
  if (!formats) return null;

  const hauteur = hauteurAgglomeration(hc, lignesTexte.length, !!mention);
  if (hauteur === null) return null;

  /* Tout signe compte, espaces et traits d'union compris : c'est
     l'encombrement qui décide, pas le nombre de lettres. La ligne la plus
     longue impose la largeur, les autres s'y alignent. */
  const caracteres = Math.max(...lignesTexte.map((l) => [...l].length));
  const format = formats.find((f) => caracteres <= f.caracteres);
  /* Trop long même pour le plus grand format : à composer sur une ligne de
     plus, ce que l'appelant doit décider. */
  if (!format) return null;

  const mise = lignesTexte.length === 1 ? 'une ligne' : `${lignesTexte.length} lignes`;
  return {
    type,
    largeur: format.largeur,
    hauteur,
    hc,
    lignes: lignesTexte.length,
    mention: !!mention,
    caracteres,
    largeurAConfirmer: !!mention,
    explication:
      `« ${lignesTexte.join(' / ')} »${mention ? ` + « ${mention} »` : ''} : `
      + `${caracteres} signe(s) sur la ligne de nom la plus longue → ${type} de `
      + `${format.largeur} × ${hauteur} mm (SD1, ${mise}, Hc ${hc}`
      + `${mention ? `, mention en ${HC_MENTION_COMMUNE} italique` : ''})`,
  };
}

/**
 * Coupe un nom d'agglomération en deux lignes.
 *
 * On coupe sur un séparateur existant du nom — espace ou trait d'union — en
 * cherchant l'équilibre entre les deux lignes, car c'est la plus longue qui
 * décide de la largeur. Le trait d'union reste attaché à la fin de la
 * première ligne, comme sur les plans.
 *
 * Renvoie `null` quand le nom n'offre aucun point de coupe : « VILLENEUVE »
 * ne se coupe pas, il faut un plus grand format.
 */
export function couperEnDeuxLignes(nom: string): [string, string] | null {
  const texte = String(nom ?? '').trim();
  const points: number[] = [];
  for (let i = 0; i < texte.length; i++) {
    if (texte[i] === ' ' || texte[i] === '-') points.push(i);
  }
  if (!points.length) return null;

  let meilleur: [string, string] | null = null;
  let ecartMin = Infinity;
  for (const i of points) {
    /* L'espace disparaît à la coupe ; le trait d'union se garde. */
    const haut = texte[i] === '-' ? texte.slice(0, i + 1) : texte.slice(0, i);
    const bas = texte.slice(i + 1).trim();
    if (!haut || !bas) continue;
    const ecart = Math.abs(haut.length - bas.length);
    if (ecart < ecartMin) {
      ecartMin = ecart;
      meilleur = [haut, bas];
    }
  }
  return meilleur;
}

/**
 * Dimensionne un panneau d'agglomération en choisissant seul le nombre de
 * lignes.
 *
 * Une ligne d'abord, puisque c'est la mise en page normale. Si le nom est
 * trop long pour le plus grand format, on le coupe en deux lignes équilibrées
 * et on redimensionne. Renvoie `null` quand même la coupe ne suffit pas, ou
 * quand le nom ne se coupe pas.
 */
export function dimensionnerAgglomerationAuto(
  nom: string,
  options: OptionsAgglomeration | TypeAgglomeration = {},
): PanneauAgglomeration | null {
  const uneLigne = dimensionnerAgglomeration(nom, options);
  if (uneLigne) return uneLigne;

  const coupe = couperEnDeuxLignes(nom);
  return coupe ? dimensionnerAgglomeration(coupe, options) : null;
}
