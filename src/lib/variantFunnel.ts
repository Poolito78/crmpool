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
 * l'occultant (OV) et le bord plié (BP) le sont.
 *
 * Le RAL n'y figure pas : BRUT est toujours écrit. L'inventer sur un article
 * qui n'en porte pas (résine, consommable) serait faux.
 */
const IMPLICITES: [SegmentCategory, string][] = [
  ['dos', DOS_DEFAULT],
  ['face', FACE_DEFAULT],
  ['profil', PROFIL_DEFAULT],
];

/**
 * Valeurs retenues quand l'utilisateur ne précise rien.
 *
 * Ces attributs ne sont donc pas demandés, mais restent modifiables : ils
 * ressortent dans `defaultOptions` avec les valeurs réellement disponibles.
 * L'ordre suit celui de l'entonnoir.
 */
const DEFAUTS: [SegmentCategory, string][] = [
  ['film', FILM_DEFAULT],
  ['dos', DOS_DEFAULT],
  ['profil', PROFIL_DEFAULT],
  ['face', FACE_DEFAULT],
  ['ral', RAL_DEFAULT],
];

/**
 * Défauts complets pour un modèle donné, dans l'ordre de l'entonnoir.
 *
 * La gamme dépend du modèle (voir GAMME_RANG), elle est donc calculée sur ses
 * variantes plutôt que fixée : l'échelle est une propriété du modèle, pas du
 * sous-ensemble déjà filtré.
 */
function defautsPour(toutes: ParsedReference[]): [SegmentCategory, string][] {
  const liste: [SegmentCategory, string][] = [];

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

  let pool = parsed;
  for (const key of Object.keys(constraints) as SegmentCategory[]) {
    const value = constraints[key]!;
    pool = pool.filter(
      (p) => (p.byCategory[key] ?? '').toUpperCase() === value.toUpperCase()
    );
  }

  /* Application des défauts (dos ouvert, RAL brut).
     Les options sont relevées AVANT de restreindre, sinon le défaut masquerait
     les autres valeurs et on ne pourrait plus en changer. */
  const defaultsApplied: SegmentCategory[] = [];
  const defaultOptions: PendingCategory[] = [];
  const defautsAppliques = new Map<SegmentCategory, string>();
  for (const [category, valeur] of defautsPour(parsed)) {
    if (constraints[category]) continue;
    const restreint = pool.filter(
      (p) => (p.byCategory[category] ?? '').toUpperCase() === valeur
    );
    if (restreint.length === 0) continue; // ce défaut n'existe pas ici : on ne force rien
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

  const resolved: Partial<Record<SegmentCategory, string>> = { ...constraints };
  for (const category of defaultsApplied) {
    resolved[category] = defautsAppliques.get(category)!;
  }

  const pending: PendingCategory[] = [];
  for (const category of FUNNEL_ORDER) {
    if (constraints[category]) continue;
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
