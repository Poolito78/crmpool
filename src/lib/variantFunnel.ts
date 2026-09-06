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
  'film',
  'dos',
  'profil',
  'face',
  'ral',
];

/** Libellés FR pour l'UI. */
export const CATEGORY_LABELS: Record<SegmentCategory, string> = {
  dimension: 'Dimension',
  film: 'Film / Classe',
  dos: 'Dos',
  profil: 'Profil',
  face: 'Face',
  marque: 'Marque',
  ral: 'RAL',
  autre: 'Autre',
};

const RAL_DEFAULT = 'BRUT';

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
  if (/^BT[A-Z0-9]*$/.test(s)) return 'profil'; // BTR, et variantes de profil futures
  if (s === 'ST' || s === 'OV') return 'face'; // Standard / Ovale (ou équivalent fiche)
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
  const parsed = candidates.map((c) => parseReference(c.reference));

  const tokens = query
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);

  const typedByCategory: Partial<Record<SegmentCategory, string>> = {};
  for (const token of tokens) {
    const category = classifySegment(token);
    if (category !== 'autre') typedByCategory[category] = token;
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

  // Défaut RAL = BRUT si non précisé et qu'un BRUT existe encore dans le pool.
  let ralAutoApplied = false;
  if (!constraints.ral) {
    const brutPool = pool.filter(
      (p) => (p.byCategory.ral ?? '').toUpperCase() === RAL_DEFAULT
    );
    if (brutPool.length > 0) {
      pool = brutPool;
      ralAutoApplied = true;
    }
  }

  const resolved: Partial<Record<SegmentCategory, string>> = { ...constraints };
  if (ralAutoApplied) resolved.ral = RAL_DEFAULT;

  const pending: PendingCategory[] = [];
  for (const category of FUNNEL_ORDER) {
    if (constraints[category]) continue;
    if (category === 'ral' && ralAutoApplied) continue; // résolu par défaut, modifiable via chip
    const values = Array.from(
      new Set(pool.map((p) => p.byCategory[category]).filter(Boolean) as string[])
    ).sort();
    if (values.length > 1) {
      pending.push({ category, label: CATEGORY_LABELS[category], options: values });
    }
  }

  return {
    matches: pool.map((p) => p.reference),
    resolved,
    pending,
    exact: pool.length === 1 ? pool[0].reference : undefined,
  };
}
