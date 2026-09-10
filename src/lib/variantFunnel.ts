/**
 * variantFunnel.ts
 * -----------------
 * Entonnoir de sélection de variantes produit, sur le modèle du sélecteur
 * de variantes Odoo (Dimension / Film / Profil / Dos / Face / RAL).
 *
 * Contexte : dans `produits`, un modèle à variantes (est_modele=false,
 * modele_cle='IS A13A' par exemple) encode ses attributs dans `reference`
 * sous forme de segments pointés :
 *
 *   A13A.700.C2.BTR.IS.BRUT
 *   A13A.700.C2.BTR.ST.IS.L7002
 *   A13A.500.C1.F.BTR.IS.BRUT
 *
 * Un segment absent = valeur par défaut (pas de F -> Dos ouvert,
 * pas de ST/OV -> face standard, pas de RAL -> BRUT).
 *
 * Ce module ne dépend d'aucun modèle particulier : la catégorie de chaque
 * segment est déduite par pattern, pas par position fixe, pour rester
 * valable sur toute la table `produits` (IS B14, IS M1, IS MSP...).
 */

export type SegmentCategory =
  | 'dimension'
  | 'largeur'
  | 'hauteur'
  | 'film'
  | 'dos'
  | 'profil'
  | 'face'
  | 'equipement'
  | 'marque'
  | 'ral'
  | 'autre';

/** Ordre d'affichage de l'entonnoir, calqué sur le popup de variantes Odoo. */
export const FUNNEL_ORDER: SegmentCategory[] = [
  'dimension',
  'largeur',
  'hauteur',
  'film',
  'dos',
  'profil',
  'face',
  'equipement',
  'ral',
];

/** Libellés FR pour l'UI. */
export const CATEGORY_LABELS: Record<SegmentCategory, string> = {
  dimension: 'Dimension',
  largeur: 'Largeur',
  hauteur: 'Hauteur',
  film: 'Film / Classe',
  dos: 'Dos',
  profil: 'Profil',
  face: 'Face',
  equipement: 'Équipement',
  marque: 'Marque',
  ral: 'RAL',
  autre: 'Autre',
};


const RAL_DEFAULT = 'BRUT';
/** Dos ouvert : le cas courant, jamais écrit — seul le fermé est marqué `F`. */
const DOS_DEFAULT = 'O';
/** Face standard ; l'occultant `OV` n'apparaît que s'il est demandé. */
const FACE_DEFAULT = 'ST';
/** Bord tombé rebordé ; le bord plié `BP` n'apparaît que s'il est demandé. */
const PROFIL_DEFAULT = 'BTR';
/** Classe 2 par défaut. */
const FILM_DEFAULT = 'C2';

/**
 * Équipement de pose de la signalisation TEMPORAIRE : `P` = support / pieds
 * (le configurateur choisit le support incliné ou le TS29 selon la taille),
 * `R` = kit rail. Les deux ne coexistent JAMAIS sur une référence (vérifié :
 * 0 sur les 635 du catalogue qui en portent un), et le panneau nu — sans
 * aucun des deux — est une troisième possibilité bien réelle : KD22 en 1000×300
 * vaut 226,29 € nu, 274,01 € avec kit rail, 321,57 € avec support.
 *
 * D'où ce jeton pour « rien » : sans lui, les variantes nues n'auraient pas de
 * valeur à opposer et resteraient inatteignables. Il ne sort jamais dans une
 * référence — c'est l'article retenu qui la porte.
 */
const EQUIPEMENT_AUCUN = 'AUCUN';

/** Kit rail. */
const EQUIPEMENT_RAIL = 'R';

/**
 * Équipement retenu quand rien n'est précisé, PAR ORDRE DE REPLI : kit rail,
 * sinon rien. Une famille sans variante rail existe (l'ISOTEXTE n'a que le nu
 * et le support) ; là, le devis retombe sur « sans rail » et la seule question
 * qui reste est avec ou sans pied. « Avec support » se demande dans les deux
 * cas — il reste proposé en puce.
 */
const EQUIPEMENT_DEFAUTS = [EQUIPEMENT_RAIL, EQUIPEMENT_AUCUN];

/**
 * Libellés des VALEURS, là où le jeton de référence ne se lit pas.
 *
 * On ne traduit que ce qui est illisible : « P » et « R » ne disent rien à un
 * commercial, alors que 700, C2 ou BTR sont le vocabulaire de la maison et
 * doivent rester tels quels — les remplacer rendrait la puce méconnaissable
 * face à la référence affichée juste à côté.
 */
const VALUE_LABELS: Partial<Record<SegmentCategory, Record<string, string>>> = {
  equipement: {
    [EQUIPEMENT_AUCUN]: 'Sans rail',
    P: 'Avec support',
    R: 'Kit rail',
  },
};

/** Libellé lisible d'une valeur d'attribut ; la valeur brute à défaut. */
export function labelValeur(category: SegmentCategory, valeur: string): string {
  return VALUE_LABELS[category]?.[valeur.toUpperCase()] ?? valeur;
}

/**
 * Gamme retenue quand rien n'est précisé : « Petite ».
 *
 * Elle ne se traduit pas par la même cote partout :
 * - Panneaux : c'est un RANG dans l'échelle de tailles du modèle, car la gamme
 *   dépend de la forme — Petite vaut 700 en triangle, 650 en cercle, 500 en
 *   carré, 600 en octogone. Échelles vérifiées sur le catalogue (IS AB3A
 *   500/700/1000/1250/1500, IS B1 450/650/850/1050/1250, IS C20A
 *   350/500/700/900/1050, IS AB4 400/600/800).
 * - Panonceaux : leur largeur reprend celle du panneau qu'ils accompagnent,
 *   c'est donc une cote absolue (Petite = 700).
 *
 * Si la valeur n'existe pas pour le modèle, aucun défaut n'est appliqué.
 */
const GAMME_RANG = 1; // 0 Miniature, 1 Petite, 2 Normale, 3 Grande
const GAMME_LARGEUR = '700';

/**
 * Échelles de tailles standard, par forme.
 *
 * On ne peut pas prendre le rang dans les tailles du modèle lui-même, pour deux
 * raisons vérifiées sur le catalogue :
 * - un panneau peut porter des tailles SPÉCIALES hors échelle (un carré en 400) ;
 *   elles décaleraient le rang ;
 * - les familles chantier sont tronquées par le bas (IS BK1 650/850/1050/1250,
 *   IS AK17 700/1000/1250) : leur première taille EST déjà la gamme Petite.
 *
 * On rattache donc le modèle à l'échelle qui couvre le mieux ses tailles, puis
 * on lit la gamme dans cette échelle. Relevé : 350/500/700/900/1050 est partagée
 * par 106 modèles (carrés C, CE, B50…), 450/650/850/1050(/1250) par 75 (cercles
 * B), 500/700/1000(/1250/1500) par 35 (triangles A, AB), 400/600/800(/1000) par
 * les octogones AB4.
 */
const ECHELLES_STANDARD: number[][] = [
  [350, 500, 700, 900, 1050, 1200], // carré
  [450, 650, 850, 1050, 1250],      // cercle
  [500, 700, 1000, 1250, 1500],     // triangle
  [400, 600, 800, 1000],            // octogone
];

/**
 * Taille correspondant à la gamme par défaut pour ce jeu de cotes.
 *
 * Rien n'est retenu si le rattachement est douteux (deux échelles à égalité, ou
 * une seule cote en commun) ou si le modèle n'offre pas cette taille : mieux
 * vaut laisser choisir que poser une cote fausse sur un devis.
 */
function gammeStandard(cotes: number[]): string | undefined {
  let meilleure: number[] | null = null;
  let meilleurScore = 0;
  let exaequo = false;
  for (const echelle of ECHELLES_STANDARD) {
    const score = cotes.filter((c) => echelle.includes(c)).length;
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleure = echelle;
      exaequo = false;
    } else if (score === meilleurScore && score > 0) {
      exaequo = true;
    }
  }
  if (!meilleure || meilleurScore < 2 || exaequo) return undefined;
  const petite = meilleure[GAMME_RANG];
  return petite != null && cotes.includes(petite) ? String(petite) : undefined;
}

/**
 * Attributs dont l'ABSENCE de segment vaut la valeur par défaut : dos ouvert,
 * face standard et bord tombé rebordé ne s'écrivent pas ; seuls le fermé (F),
 * l'occultant (OV) et le bord plié (BP) le sont. L'équipement suit la même
 * mécanique : l'absence de segment vaut EQUIPEMENT_AUCUN.
 *
 * Le RAL n'y figure pas : BRUT est toujours écrit. L'inventer sur un article
 * qui n'en porte pas (résine, consommable) serait faux.
 */
const IMPLICITES: [SegmentCategory, string][] = [
  ['dos', DOS_DEFAULT],
  ['face', FACE_DEFAULT],
  ['profil', PROFIL_DEFAULT],
  ['equipement', EQUIPEMENT_AUCUN],
];

/**
 * Un défaut : la valeur retenue, ou plusieurs essayées dans l'ordre quand la
 * première peut manquer à la famille (voir EQUIPEMENT_DEFAUTS).
 */
type DefautCategorie = [SegmentCategory, string | string[]];

/**
 * Valeurs retenues quand l'utilisateur ne précise rien.
 *
 * Ces attributs ne sont donc pas demandés, mais restent modifiables : ils
 * ressortent dans `defaultOptions` avec les valeurs réellement disponibles.
 * L'ordre suit celui de l'entonnoir.
 */
const DEFAUTS: DefautCategorie[] = [
  ['film', FILM_DEFAULT],
  ['dos', DOS_DEFAULT],
  ['profil', PROFIL_DEFAULT],
  ['face', FACE_DEFAULT],
  ['equipement', EQUIPEMENT_DEFAUTS],
  ['ral', RAL_DEFAULT],
];

/**
 * Défauts complets pour un modèle donné, dans l'ordre de l'entonnoir.
 *
 * La gamme dépend du modèle (voir GAMME_RANG), elle est donc calculée sur ses
 * variantes plutôt que fixée : l'échelle est une propriété du modèle, pas du
 * sous-ensemble déjà filtré.
 */
function defautsPour(toutes: ParsedReference[]): DefautCategorie[] {
  const liste: DefautCategorie[] = [];

  const cotes = Array.from(
    new Set(toutes.map((p) => p.byCategory.dimension).filter(Boolean) as string[])
  )
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const gamme = gammeStandard(cotes);
  if (gamme) liste.push(['dimension', gamme]);
  liste.push(['largeur', GAMME_LARGEUR]);

  return [...liste, ...DEFAUTS];
}

/**
 * Tri des valeurs proposées. Les cotes sont numériques : un tri alphabétique
 * placerait 1050 avant 450, ce qui rend la rangée de tailles illisible.
 */
function trierValeurs(valeurs: string[]): string[] {
  return [...valeurs].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b, 'fr');
  });
}

/**
 * Classe un segment brut de référence (ex: "C2", "700", "ST", "L7002", "BRUT").
 * Ajuster/étendre ces regex si de nouveaux formats de fiche apparaissent
 * (ex: nouveau profil autre que BTR).
 */
export function classifySegment(segmentRaw: string): SegmentCategory {
  const s = segmentRaw.trim().toUpperCase();
  if (!s) return 'autre';

  // 3430 est un code de film, pas une cote : il doit être reconnu AVANT la
  // règle de dimension, sinon `^\d{3,4}$` l'attrape et la règle film ci-dessous
  // devient du code mort. Vérifié sur les 334 références du catalogue qui le
  // portent : 333 ont par ailleurs une vraie cote (A13A.700.3430.BTR.IS.BRUT),
  // et la seule où il est le seul nombre est justement un film (CL1.BLANC.3430).
  if (/^C\d+V?$/.test(s) || s === '3430') return 'film'; // C1, C2, C1V, C2V, C3, 3430
  if (/^\d{3,4}$/.test(s)) return 'dimension'; // 500, 700, 1000, 1250, 1500
  if (s === 'O' || s === 'F') return 'dos'; // Ouvert / Fermé
  // BTR = bord tombé rebordé, BP = bord plié (gamme « Bords Pliés »).
  if (s === 'BP' || /^BT[A-Z0-9]*$/.test(s)) return 'profil';
  if (s === 'ST' || s === 'OV') return 'face'; // Standard / Occultant
  if (s === 'P' || s === 'R') return 'equipement'; // pieds/support ou kit rail
  if (s === 'IS') return 'marque'; // marqueur constant ISOSIGN
  if (s === RAL_DEFAULT || /^L[A-Z0-9]+$/.test(s)) return 'ral'; // BRUT, L1001, LCHAMP...

  return 'autre';
}

export interface ParsedReference {
  reference: string;
  segments: { raw: string; category: SegmentCategory }[];
  byCategory: Partial<Record<SegmentCategory, string>>;
}

export function parseReference(reference: string): ParsedReference {
  const segments = reference.split('.').map((raw) => ({
    raw,
    category: classifySegment(raw),
  }));

  /* Deux cotes = un panonceau, coté largeur × hauteur dans cet ordre
     (M9Z1LM#1PLACE.500.150 = 500 de large, 150 de haut). Une seule cote = la
     taille du panneau, laissée en « dimension ». Au-delà de deux, on ne devine
     pas : 15 références au catalogue, aux formats hétérogènes.
     Sans cette distinction, `byCategory` ne gardait que le premier nombre et
     deux variantes ne différant que par la hauteur étaient indiscernables. */
  const cotes = segments.filter((s) => s.category === 'dimension');
  if (cotes.length === 2) {
    cotes[0].category = 'largeur';
    cotes[1].category = 'hauteur';
  }

  const byCategory: Partial<Record<SegmentCategory, string>> = {};
  for (const seg of segments) {
    // En cas de collision de catégorie sur un même segment (rare), le premier
    // trouvé gagne : à surveiller si un modèle a deux segments "autre".
    if (!byCategory[seg.category]) byCategory[seg.category] = seg.raw;
  }
  return { reference, segments, byCategory };
}

export interface CandidateProduit {
  reference: string;
  description?: string;
}

export interface FunnelInput {
  /** Toutes les variantes du modele_cle déjà identifié (est_modele=false). */
  candidates: CandidateProduit[];
  /** Texte tapé après le code modèle, ex: "700 c2" ou "700 st l7002". */
  query: string;
  /** Choix explicites de l'utilisateur via les chips (prioritaires sur `query`). */
  chipOverrides?: Partial<Record<SegmentCategory, string>>;
}

export interface PendingCategory {
  category: SegmentCategory;
  label: string;
  options: string[];
}

export interface FunnelResult {
  /** Références encore possibles compte tenu des contraintes appliquées. */
  matches: string[];
  /** Attributs déjà fixés (tapés, choisis via chip, ou défaut RAL=BRUT). */
  resolved: Partial<Record<SegmentCategory, string>>;
  /** Attributs encore ambigus : à proposer sous forme de chips à l'utilisateur. */
  pending: PendingCategory[];
  /** Attributs tranchés par un défaut métier (dos ouvert, RAL brut) : ils ne
   *  sont pas demandés, mais restent modifiables. */
  defaultsApplied: SegmentCategory[];
  /** Valeurs disponibles pour ces attributs à défaut, relevées avant que le
   *  défaut ne restreigne — de quoi proposer d'en changer. */
  defaultOptions: PendingCategory[];
  /** Référence unique si l'entonnoir est totalement résolu. */
  exact?: string;
}

/**
 * Réduit la liste de variantes d'un modèle en fonction du texte tapé et/ou
 * des choix de chips déjà faits par l'utilisateur, et indique les attributs
 * qui restent à trancher.
 *
 * Règle métier : si le RAL n'est pas tapé et qu'une variante BRUT existe
 * parmi les candidats restants, elle est retenue par défaut (sans pour
 * autant empêcher l'utilisateur de choisir un RAL via chip ensuite).
 */
/**
 * Parmi plusieurs variantes d'une même famille, celles que les règles métier
 * retiennent quand la demande ne tranche pas — dans l'ordre d'entrée.
 *
 * ⚠️ **UNE LISTE DE PROPOSITIONS N'EST PAS CLASSÉE PAR CE QU'ON VEND.** Odoo
 * rend ses résultats dans son ordre à lui : sur « panneau AK3 » il renvoie le
 * AK3.1000 avant le AK3.700, et retenir le premier posait un 1000 sur le devis
 * — 50,02 € au lieu de 39,41 € — alors que la règle est claire : à défaut de
 * précision, gamme **Petite**. C'est le même défaut que l'entonnoir de
 * variantes applique déjà quand on choisit à la main ; il n'y a aucune raison
 * qu'une reprise d'office décide autrement.
 *
 * `demande` est le texte du client : ce qu'il précise l'emporte sur le
 * défaut — « AK3 1000 » garde le 1000.
 *
 * ⚠️ **NE FILTRE JAMAIS JUSQU'AU VIDE.** Quand la famille ne se prête pas à
 * ces règles (une résine, un consommable), quand les cotes ne se rattachent à
 * aucune échelle standard, ou quand la demande contredit tous les candidats,
 * la liste d'entrée est rendue telle quelle : mieux vaut la proposition
 * d'Odoo que pas de proposition du tout — une ligne sans article part au
 * devis sans prix.
 */
export function variantesParDefaut(
  candidates: CandidateProduit[],
  demande = '',
): string[] {
  const toutes = candidates.map((c) => c.reference);
  if (candidates.length < 2) return toutes;
  const { matches } = buildFunnel({ candidates, query: demande });
  return matches.length ? matches : toutes;
}

export function buildFunnel({
  candidates,
  query,
  chipOverrides = {},
}: FunnelInput): FunnelResult {
  const brut = candidates.map((c) => parseReference(c.reference));

  /* Les attributs implicites (dos ouvert, face standard, bord tombé rebordé) ne
     portent aucun segment : seuls F, OV et BP sont écrits. Sans les
     matérialiser, la valeur courante ne serait jamais proposable, et surtout
     appliquer le défaut EXCLURAIT les variantes qui ne l'écrivent pas — c'est-
     à-dire la majorité.

     On ne le fait que sur les familles qui déclarent l'attribut au moins une
     fois : inutile d'inventer un dos ou un profil sur une résine ou un
     consommable, où la notion n'existe pas. */
  const declares = IMPLICITES.filter(([categorie]) =>
    brut.some((p) => p.byCategory[categorie])
  );
  const parsed = declares.length
    ? brut.map((p) => {
        const manquants = declares.filter(([categorie]) => !p.byCategory[categorie]);
        if (!manquants.length) return p;
        const byCategory = { ...p.byCategory };
        for (const [categorie, valeur] of manquants) byCategory[categorie] = valeur;
        return { ...p, byCategory };
      })
    : brut;

  const tokens = query
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);

  /* Un nombre tapé n'a pas le même sens selon la famille : sur un panonceau
     (deux cotes), le premier est la largeur et le second la hauteur ; sur un
     panneau, c'est sa dimension. On le déduit des candidats plutôt que de
     l'imposer, car `classifySegment` ne voit qu'un segment isolé. */
  const estPanonceau = parsed.some((p) => p.byCategory.largeur);
  const nombres: string[] = [];
  const typedByCategory: Partial<Record<SegmentCategory, string>> = {};
  for (const token of tokens) {
    const category = classifySegment(token);
    if (category === 'dimension') { nombres.push(token); continue; }
    if (category !== 'autre') typedByCategory[category] = token;
  }
  if (estPanonceau) {
    if (nombres[0]) typedByCategory.largeur = nombres[0];
    if (nombres[1]) typedByCategory.hauteur = nombres[1];
  } else if (nombres[0]) {
    typedByCategory.dimension = nombres[0];
  }

  // Les chips explicites priment sur le texte tapé.
  const constraints: Partial<Record<SegmentCategory, string>> = {
    ...typedByCategory,
    ...chipOverrides,
  };

  /* ⚠️ **UNE CONTRAINTE QUE PERSONNE NE SATISFAIT N'EN EST PAS UNE.**
   *
   * `classifySegment` lit un segment de RÉFÉRENCE, où tout est propre. Ici on
   * lui donne des mots du CLIENT, et le français en abuse : « LONGUEUR »,
   * « LONG » et « LG » passent tous `^L[A-Z0-9]+$` et deviennent une demande
   * de RAL. Quant à la classe `C2` que `texteRechercheOdoo` ajoute à toute
   * ligne, elle n'a aucun sens sur un mât d'acier, qui ne porte pas de film.
   *
   * Filtrer sec vidait alors le vivier, `variantesParDefaut` rendait la liste
   * d'entrée telle quelle — son garde-fou anti-vide — et le défaut métier
   * RAL = BRUT n'était jamais appliqué. Mesuré le 10/09/2026 sur la demande
   * AGILIS « supports 40×80, longueur 3 m » : le mot « longueur » suffisait à
   * mettre les huit laquées à égalité avec SG80401_5.3000.IS.BRUT, et la
   * reprise d'office retenait SG80401_5.3000.IS.L1000 — en rupture et hors
   * barème — là où la commande Odoo facture bien la brute.
   *
   * On écarte donc la contrainte au lieu du vivier : elle ne dit rien de ce
   * qu'on a sous la main, et les défauts qui suivent, eux, disent quelque
   * chose. `resolved` ne l'annonce pas — on n'a pas tranché cet attribut. */
  let pool = parsed;
  const ignorees: SegmentCategory[] = [];
  for (const key of Object.keys(constraints) as SegmentCategory[]) {
    const value = constraints[key]!;
    const essai = pool.filter(
      (p) => (p.byCategory[key] ?? '').toUpperCase() === value.toUpperCase()
    );
    if (essai.length) pool = essai;
    else ignorees.push(key);
  }
  const retenues: Partial<Record<SegmentCategory, string>> = { ...constraints };
  for (const key of ignorees) delete retenues[key];

  /* Application des défauts (dos ouvert, RAL brut).
     Les options sont relevées AVANT de restreindre, sinon le défaut masquerait
     les autres valeurs et on ne pourrait plus en changer. */
  const defaultsApplied: SegmentCategory[] = [];
  const defaultOptions: PendingCategory[] = [];
  const defautsAppliques = new Map<SegmentCategory, string>();
  for (const [category, valeurs] of defautsPour(parsed)) {
    if (retenues[category]) continue;
    /* Plusieurs valeurs = ordre de repli : on retient la première que la
       famille propose réellement. Aucune ne convient (dos sur une résine,
       rail sur un panneau permanent) : on ne force rien. */
    const candidats = Array.isArray(valeurs) ? valeurs : [valeurs];
    let valeur: string | undefined;
    let restreint: ParsedReference[] = [];
    for (const candidat of candidats) {
      const essai = pool.filter(
        (p) => (p.byCategory[category] ?? '').toUpperCase() === candidat
      );
      if (essai.length) { valeur = candidat; restreint = essai; break; }
    }
    if (!valeur) continue;
    const options = trierValeurs(
      Array.from(new Set(pool.map((p) => p.byCategory[category]).filter(Boolean) as string[]))
    );
    if (options.length > 1) {
      defaultOptions.push({ category, label: CATEGORY_LABELS[category], options });
    }
    pool = restreint;
    defaultsApplied.push(category);
    defautsAppliques.set(category, valeur);
  }

  const resolved: Partial<Record<SegmentCategory, string>> = { ...retenues };
  for (const category of defaultsApplied) {
    resolved[category] = defautsAppliques.get(category)!;
  }

  const pending: PendingCategory[] = [];
  for (const category of FUNNEL_ORDER) {
    if (retenues[category]) continue;
    if (defaultsApplied.includes(category)) continue; // résolu par défaut, modifiable via chip
    const values = trierValeurs(
      Array.from(new Set(pool.map((p) => p.byCategory[category]).filter(Boolean) as string[]))
    );
    if (values.length > 1) {
      pending.push({ category, label: CATEGORY_LABELS[category], options: values });
    }
  }

  return {
    matches: pool.map((p) => p.reference),
    resolved,
    pending,
    defaultsApplied,
    defaultOptions,
    exact: pool.length === 1 ? pool[0].reference : undefined,
  };
}
