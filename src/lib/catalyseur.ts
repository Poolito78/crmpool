import type { LigneDevis, Produit } from './store';
import { cleSousCompo, composantsPersonnalises, varianteDeLigne, type VarianteCompo } from './variantesCompo';

/**
 * LE CATALYSEUR D'UN DEVIS FLOWFAST, À LA TEMPÉRATURE DU CHANTIER.
 *
 * Fiche ISOFLOOR « Flowfast CATALYST C2 » : le catalyseur se dose en POIDS,
 * pour 1 kg de RÉSINE, selon la famille de résine et la température. Plus il
 * fait froid, plus il en faut — 1 % à +30 °C, 6 % à 0 °C pour le 107. Le
 * FLOWFAST 405 Cleaner se dose à 10 % quelle que soit la température.
 *
 * La ligne du catalyseur (CATALYST2, 2 kg) porte la température
 * (`LigneDevis.temperatureCatalyse`, 20 °C par défaut) et sa quantité se
 * calcule : kilos de résine du devis × pourcentage → kilos de catalyseur →
 * contenants entiers.
 *
 * ⚠️ ON COMPTE LA RÉSINE, PAS LE POIDS DE LA LIGNE. Un kit pèse aussi son
 * granulat : FLOWFAST21535 fait 35 kg pour 10 kg de 215, le kit 319 ROAD
 * 45,8 kg pour 20 kg de 319. Une ligne à variante composée est donc lue
 * composant par composant (sous-variantes comprises). Un kit sans
 * composition lisible, une résine sans fiche (F1 Mortar, 101…), ou un article
 * sans poids n'est PAS compté : il remonte « à vérifier » — on ne devine pas
 * un dosage. Les 108, 203, 205, 216 et 230 ont leur propre fiche (`DOSAGE`).
 *
 * Entre deux lignes du tableau on n'interpole pas : on prend la plus froide,
 * la plus prudente (`ligneDuTableau`).
 */

export const TEMPERATURES_CATALYSE = [30, 25, 20, 15, 10, 5, 0] as const;
export type TemperatureCatalyse = typeof TEMPERATURES_CATALYSE[number];
export const TEMPERATURE_PAR_DEFAUT: TemperatureCatalyse = 20;

export type FamilleResine = '107' | '215' | '208_319' | '319clear' | '405'
  | '108' | '203' | '205' | '216' | '230';

export const LIBELLE_FAMILLE: Record<FamilleResine, string> = {
  '107': 'Flowfast 107',
  '215': 'Flowfast 215',
  '208_319': 'Flowfast 208 / 319 unpig.',
  '319clear': 'Flowfast 319 clear',
  '405': 'Flowfast 405 cleaner',
  '108': 'Flowfast 108 Damp Primer',
  '203': 'Flowfast 203 Hot Binder',
  '205': 'Flowfast 205 Standard Binder',
  '216': 'Flowfast 216 Flexible Binder R',
  '230': 'Flowfast 230 Membrane',
};

/**
 * Pourcentage de catalyseur C2 (en poids, pour 1 kg de résine), par
 * température, du plus chaud au plus froid. Chaque famille garde LES POINTS DE
 * SA FICHE — on n'en invente pas d'intermédiaires.
 *  - 107, 215, 208/319 unpig., 319 clear : fiche ISOFLOOR « Flowfast CATALYST C2 » (7 points).
 *  - 108, 203, 205, 216, 230 : fiches techniques Flowcrete France (Tremco CPG),
 *    état 11/2021, lues sur flowcrete.eu le 11/10/2026 (4 points : +30, +20, +10, 0 °C).
 *    Sous 0 °C, elles demandent en plus l'accélérateur Flowfast 404 : hors calcul.
 */
const DOSAGE: Record<Exclude<FamilleResine, '405'>, [number, number][]> = {
  '107':      [[30, 1.0], [25, 1.5],  [20, 2.0], [15, 3.0], [10, 4.0], [5, 5.0], [0, 6.0]],
  '215':      [[30, 1.0], [25, 1.5],  [20, 2.0], [15, 3.0], [10, 4.0], [5, 4.5], [0, 5.0]],
  '208_319':  [[30, 1.0], [25, 1.25], [20, 1.5], [15, 2.3], [10, 3.0], [5, 3.5], [0, 4.0]],
  '319clear': [[30, 0.9], [25, 1.0],  [20, 1.0], [15, 1.5], [10, 2.0], [5, 2.5], [0, 3.0]],
  '108':      [[30, 1.0], [20, 2.0], [10, 4.0], [0, 6.0]],
  '203':      [[30, 1.0], [20, 2.0], [10, 4.0], [0, 5.0]],
  '205':      [[30, 1.0], [20, 2.0], [10, 4.0], [0, 5.0]],
  '216':      [[30, 1.0], [20, 2.0], [10, 4.0], [0, 5.0]],
  '230':      [[30, 1.0], [20, 1.4], [10, 2.4], [0, 4.0]],
};
/** « *Flowfast 405 cleaner 10 % (100 g par kg) » — sans dépendance à la température. */
const DOSAGE_405 = 10;

/**
 * Le point de la fiche qui dose une température — LE PLUS PRUDENT (règle du
 * 11/10/2026) : entre deux points, le plus FROID, celui qui met le plus de
 * catalyseur. 18 °C se dose comme 15 °C au tableau ISOFLOOR, comme 10 °C sur
 * une fiche Flowcrete à 4 points. Au-dessus de +30 °C, le point +30 °C. Sous
 * 0 °C, `null` : la fiche exige l'accélérateur 404, on ne calcule pas.
 */
export function dosageA(famille: FamilleResine, t: number): { pct: number; point: number } | null {
  if (!Number.isFinite(t) || t < 0) return null;
  if (famille === '405') return { pct: DOSAGE_405, point: t };
  const p = DOSAGE[famille].find(([temp]) => temp <= t);   // points rangés du plus chaud au plus froid
  return p ? { pct: p[1], point: p[0] } : null;
}

/** Pourcentage au point le plus prudent (0 si hors fiche — l'appelant vérifie avant avec `ligneDuTableau`). */
export function pourcentageCatalyse(famille: FamilleResine, t: number): number {
  return dosageA(famille, t)?.pct ?? 0;
}

export function estTemperatureCatalyse(t: unknown): t is TemperatureCatalyse {
  return TEMPERATURES_CATALYSE.includes(t as TemperatureCatalyse);
}

/**
 * La température qu'on calcule : celle saisie (20 °C sans saisie), ou `null`
 * sous 0 °C — hors des fiches, qui exigent alors l'accélérateur 404.
 */
export function ligneDuTableau(t: number | undefined | null): number | null {
  const v = t == null || !Number.isFinite(t) ? TEMPERATURE_PAR_DEFAUT : t;
  return v < 0 ? null : v;
}

type Article = Pick<Produit, 'id' | 'reference' | 'description' | 'poids'>
  & Partial<Pick<Produit, 'descriptionVariante' | 'variantesCompo' | 'typeVariantesCompo'>>;

const texte = (p: Article) => `${p.reference ?? ''} ${p.description ?? ''} ${p.descriptionVariante ?? ''}`.toUpperCase();

/** Le catalyseur lui-même (CATALYST2 « Catalyst (2 kg) ») — pas un kit qui en contient. */
export function estCatalyseur(p: Article | undefined): boolean {
  if (!p) return false;
  return /^CATALYST/i.test(p.reference ?? '') || /^\s*CATALYST\b/i.test(p.description ?? '');
}

/**
 * La famille d'une résine VENDUE SEULE, ou :
 *  - `null` : pas une résine Flowfast (granulat, pigment…) — ignorée ;
 *  - `'a_verifier'` : Flowfast dont on ne sait pas lire la dose (kit sans
 *    composition, 319 sans « unpig. » ni « clear », résine hors tableau).
 */
export function familleResine(p: Article): FamilleResine | 'a_verifier' | null {
  const t = texte(p);
  if (!/FLOW\s*FAST/.test(t) || estCatalyseur(p)) return null;
  // Durcisseur / catalyseur vendu à part (DURFLOWFASTEURO) : ce n'est pas de la résine.
  if (/DURCISSEUR/.test(t) || (/CATALYST/.test(t) && !/\+/.test(t))) return null;
  // Un kit lu sans composition mélange résine et granulat : son poids n'est pas celui de la résine.
  if (/\bKIT\b|\+|PART\s*A/.test(t)) return 'a_verifier';
  // Charges et teintes de la gamme (SNL Filler…) : rien à catalyser.
  // `\bPIGMENT` et non `PIGMENT` : « UNPIGMENTED » est précisément la résine 319 à doser.
  if (/\bSNL|FILLER|\bPIGMENT|QUARTZ/.test(t)) return null;
  if (/\b405\b/.test(t)) return '405';
  if (/\b107\b|PRIMER\s*107/.test(t)) return '107';
  if (/\b108\b|PRIMER\s*108/.test(t)) return '108';
  if (/\b215\b/.test(t)) return '215';
  if (/\b216\b/.test(t)) return '216';
  if (/\b203\b/.test(t)) return '203';
  if (/\b205\b/.test(t)) return '205';
  if (/\b230\b/.test(t)) return '230';
  if (/\b208\b/.test(t)) return '208_319';
  if (/\b319\b|319[A-Z.]/.test(t)) {
    if (/CLEAR/.test(t)) return '319clear';
    if (/UNPIG/.test(t)) return '208_319';
    return 'a_verifier';
  }
  return 'a_verifier';
}

export interface ResineComptee {
  famille: FamilleResine;
  kg: number;
  /** D'où vient ce poids (« FLOWFAST 319 Unpigmented (20 kg) × 2 »). */
  origine: string;
  /** Dosage retenu, et le point de la fiche qui le donne (18 °C → point 15 ou 10). */
  pct: number;
  point: number;
}

export interface CalculCatalyse {
  /** Température saisie (pas forcément un point de fiche). */
  temperature: number;
  resines: ResineComptee[];
  /** Kilos de catalyseur nécessaires. */
  kgCatalyseur: number;
  /** Contenants entiers (arrondi au-dessus), ou `null` si le contenant n'a pas de poids. */
  quantite: number | null;
  /** Lignes Flowfast que l'on n'a pas su compter. */
  aVerifier: string[];
}

const arrondi = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/** Résine contenue dans UNE unité d'une variante composée (sous-variantes comprises). */
function resinesDeVariante(
  v: VarianteCompo,
  trouver: (id: string) => Article | undefined,
  vc: Record<string, string> | undefined,
  facteur: number,
  profondeur: number,
  sortie: ResineComptee[],
  aVerifier: string[],
  temperature: number,
) {
  if (profondeur > 5) return;
  for (const c of v.composants) {
    const p = c.produitId ? trouver(c.produitId) : undefined;
    if (!p) continue;
    const q = (c.quantite || 0) * facteur;
    const sousId = vc?.[cleSousCompo(p.id)];
    const sous = sousId ? p.variantesCompo?.find(x => x.id === sousId) : undefined;
    if (sous) { resinesDeVariante(sous, trouver, vc, q, profondeur + 1, sortie, aVerifier, temperature); continue; }
    compter(p, q, `${p.description || p.reference} × ${arrondi(q)}`, p.description || p.reference, sortie, aVerifier, temperature);
  }
}

/** Range un article : compté s'il a une famille, un poids et un dosage, sinon « à vérifier ». */
function compter(p: Article, q: number, origine: string, nom: string, sortie: ResineComptee[], aVerifier: string[], temperature: number) {
  const f = familleResine(p);
  if (f === null) return;
  // Un poids absent (FLOWFAST230 est à 0 kg en base) ne se devine pas plus qu'un dosage.
  if (f === 'a_verifier' || !(p.poids && p.poids > 0)) { aVerifier.push(nom); return; }
  const d = dosageA(f, temperature);
  if (!d) { aVerifier.push(nom); return; }
  sortie.push({ famille: f, kg: q * p.poids, origine, pct: d.pct, point: d.point });
}

/** Le calcul complet, pour toutes les lignes d'article du devis. */
export function calculerCatalyse(
  lignes: LigneDevis[],
  trouver: (id: string) => Article | undefined,
  /** Température du chantier, en °C (≥ 0 : sous 0 °C l'appelant ne calcule pas). */
  temperature: number,
  /** Poids d'un contenant de catalyseur (2 kg pour CATALYST2). */
  poidsContenant: number | undefined,
): CalculCatalyse {
  const resines: ResineComptee[] = [];
  const aVerifier: string[] = [];
  for (const l of lignes) {
    // Un article se reconnaît par exclusion : son `type` vaut souvent `undefined` (voir CLAUDE.md).
    if (l.type === 'groupe' || l.type === 'soustotal' || l.type === 'texte' || !l.produitId) continue;
    const p = trouver(l.produitId);
    if (!p || estCatalyseur(p) || !(l.quantite > 0)) continue;
    const compo = varianteDeLigne(p, l.variantesChoisies);
    // Composition propre à la ligne (quantités retouchées, composant dupliqué) : elle fait foi, à plat.
    const perso = compo ? composantsPersonnalises(l.variantesChoisies) : null;
    if (perso) { resinesDeVariante({ id: 'perso', nom: '', composants: perso }, trouver, undefined, l.quantite, 0, resines, aVerifier, temperature); continue; }
    if (compo) { resinesDeVariante(compo, trouver, l.variantesChoisies, l.quantite, 0, resines, aVerifier, temperature); continue; }
    compter(p, l.quantite, `${p.description || p.reference} × ${l.quantite}`, l.description || p.reference, resines, aVerifier, temperature);
  }
  const kgCatalyseur = arrondi(resines.reduce((s, r) => s + r.kg * r.pct / 100, 0));
  const quantite = poidsContenant && poidsContenant > 0 ? Math.ceil(arrondi(kgCatalyseur / poidsContenant, 6)) : null;
  return { temperature, resines, kgCatalyseur, quantite, aVerifier: [...new Set(aVerifier)] };
}
