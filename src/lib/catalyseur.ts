import type { LigneDevis, Produit } from './store';
import { cleSousCompo, varianteDeLigne, type VarianteCompo } from './variantesCompo';

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
 * composition lisible, ou une résine absente du tableau (108, 203, 216…),
 * n'est PAS compté : il remonte « à vérifier » — on ne devine pas un dosage.
 *
 * Entre deux lignes du tableau on n'interpole pas : on prend la plus froide,
 * la plus prudente (`ligneDuTableau`).
 */

export const TEMPERATURES_CATALYSE = [30, 25, 20, 15, 10, 5, 0] as const;
export type TemperatureCatalyse = typeof TEMPERATURES_CATALYSE[number];
export const TEMPERATURE_PAR_DEFAUT: TemperatureCatalyse = 20;

export type FamilleResine = '107' | '215' | '208_319' | '319clear' | '405';

export const LIBELLE_FAMILLE: Record<FamilleResine, string> = {
  '107': 'Flowfast 107',
  '215': 'Flowfast 215',
  '208_319': 'Flowfast 208 / 319 unpig.',
  '319clear': 'Flowfast 319 clear',
  '405': 'Flowfast 405 cleaner',
};

/** Pourcentage de catalyseur (en poids, pour 1 kg de résine). Fiche ISOFLOOR Flowfast CATALYST C2. */
const DOSAGE: Record<Exclude<FamilleResine, '405'>, Record<TemperatureCatalyse, number>> = {
  '107':      { 30: 1.0, 25: 1.5,  20: 2.0, 15: 3.0, 10: 4.0, 5: 5.0, 0: 6.0 },
  '215':      { 30: 1.0, 25: 1.5,  20: 2.0, 15: 3.0, 10: 4.0, 5: 4.5, 0: 5.0 },
  '208_319':  { 30: 1.0, 25: 1.25, 20: 1.5, 15: 2.3, 10: 3.0, 5: 3.5, 0: 4.0 },
  '319clear': { 30: 0.9, 25: 1.0,  20: 1.0, 15: 1.5, 10: 2.0, 5: 2.5, 0: 3.0 },
};
/** « *Flowfast 405 cleaner 10 % (100 g par kg) » — sans dépendance à la température. */
const DOSAGE_405 = 10;

export function pourcentageCatalyse(famille: FamilleResine, t: TemperatureCatalyse): number {
  return famille === '405' ? DOSAGE_405 : DOSAGE[famille][t];
}

export function estTemperatureCatalyse(t: unknown): t is TemperatureCatalyse {
  return TEMPERATURES_CATALYSE.includes(t as TemperatureCatalyse);
}

/**
 * La ligne du tableau qui dose une température quelconque — LA PLUS PRUDENTE
 * (règle du 11/10/2026) : entre deux lignes, on prend la plus FROIDE, celle
 * qui met le plus de catalyseur. 18 °C se dose comme 15 °C. Au-dessus de
 * +30 °C, la ligne +30 °C. Sous 0 °C, le tableau ne dit rien : `null`, et le
 * calcul n'est pas fait (on n'extrapole pas une donnée de fabricant).
 */
export function ligneDuTableau(t: number | undefined | null): TemperatureCatalyse | null {
  const v = t == null || !Number.isFinite(t) ? TEMPERATURE_PAR_DEFAUT : t;
  if (v < 0) return null;
  return TEMPERATURES_CATALYSE.find(x => x <= v) ?? null;   // tableau rangé du plus chaud au plus froid
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
  if (/\b215\b/.test(t)) return '215';
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
}

export interface CalculCatalyse {
  temperature: TemperatureCatalyse;
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
) {
  if (profondeur > 5) return;
  for (const c of v.composants) {
    const p = c.produitId ? trouver(c.produitId) : undefined;
    if (!p) continue;
    const q = (c.quantite || 0) * facteur;
    const sousId = vc?.[cleSousCompo(p.id)];
    const sous = sousId ? p.variantesCompo?.find(x => x.id === sousId) : undefined;
    if (sous) { resinesDeVariante(sous, trouver, vc, q, profondeur + 1, sortie, aVerifier); continue; }
    const f = familleResine(p);
    if (f === null) continue;
    if (f === 'a_verifier' || !(p.poids && p.poids > 0)) { aVerifier.push(p.description || p.reference); continue; }
    sortie.push({ famille: f, kg: q * p.poids, origine: `${p.description || p.reference} × ${arrondi(q)}` });
  }
}

/** Le calcul complet, pour toutes les lignes d'article du devis. */
export function calculerCatalyse(
  lignes: LigneDevis[],
  trouver: (id: string) => Article | undefined,
  temperature: TemperatureCatalyse,
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
    if (compo) { resinesDeVariante(compo, trouver, l.variantesChoisies, l.quantite, 0, resines, aVerifier); continue; }
    const f = familleResine(p);
    if (f === null) continue;
    if (f === 'a_verifier' || !(p.poids && p.poids > 0)) { aVerifier.push(l.description || p.reference); continue; }
    resines.push({ famille: f, kg: l.quantite * p.poids, origine: `${p.description || p.reference} × ${l.quantite}` });
  }
  const kgCatalyseur = arrondi(resines.reduce((s, r) => s + r.kg * pourcentageCatalyse(r.famille, temperature) / 100, 0));
  const quantite = poidsContenant && poidsContenant > 0 ? Math.ceil(arrondi(kgCatalyseur / poidsContenant, 6)) : null;
  return { temperature, resines, kgCatalyseur, quantite, aVerifier: [...new Set(aVerifier)] };
}
