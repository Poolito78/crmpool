import { consoDeLigne, consoFiche, surfaceDeLigne, uniteDeLigne, type LigneDevis, type Produit, type UniteSurface } from './store';
import { produitParId } from './indexProduits';
import { calculerCatalyse, estCatalyseur, familleResine } from './catalyseur';

/**
 * UNE CONSO DOSÉE EN % DU POIDS D'AUTRES LIGNES DU DEVIS.
 *
 * Le pigment d'un Flowfast se dose sur la RÉSINE : 10 % du poids de FLOWFAST
 * 319 posé au chantier, pas une conso au m² de la fiche. Une ligne qui porte
 * `LigneDevis.consoRelative` voit donc sa conso calculée : kilos consommés
 * des lignes SOURCES × pourcentage → kg de la ligne → conso (÷ sa surface)
 * et quantité (÷ son poids, au conditionnement supérieur).
 *
 * LES SOURCES SE PRENNENT D'OFFICE : les résines Flowfast placées AU-DESSUS,
 * dans le même groupe (deux lignes de 319 dans la finition comptent toutes
 * les deux ; le primaire 107 d'un autre groupe, non). On en coche d'autres
 * (`inclus`) ou on en décoche (`exclus`) : le choix est retenu sur la ligne.
 *
 * Le poids d'une source est celui CONSOMMÉ (surface × conso), comme pour le
 * catalyseur ; sans surface ni conso, celui des unités vendues. Un kit dont on
 * lit la composition ne compte que sa résine (`calculerCatalyse`) — son
 * granulat ne se pigmente pas.
 */
export interface ConsoRelative {
  /** Pourcentage du poids des sources (10 = 10 %). */
  pct: number;
  /** Lignes cochées à la main, en plus des résines prises d'office. */
  inclus?: string[];
  /** Lignes décochées à la main, parmi les résines prises d'office. */
  exclus?: string[];
}

export const PCT_CONSO_RELATIVE_DEFAUT = 10;

export interface SourceConso {
  ligne: LigneDevis;
  /** Kilos de la ligne retenus pour le dosage. */
  kg: number;
  /** D'où viennent ces kilos. */
  base: 'resine' | 'consomme' | 'vendu';
  /** Prise d'office (résine Flowfast du même groupe). */
  parDefaut: boolean;
  /** Retenue dans le calcul (d'office ou cochée, et pas décochée). */
  retenue: boolean;
}

export interface CalculConsoRelative {
  pct: number;
  sources: SourceConso[];
  /** Kilos des sources retenues. */
  kgSources: number;
  /** Kilos de la ligne dosée. */
  kg: number;
}

const estArticle = (l: LigneDevis) => !(l.type === 'groupe' || l.type === 'soustotal' || l.type === 'texte');
const arrondi = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/** Le segment du devis où se trouve une ligne : le dernier en-tête de groupe ou sous-total au-dessus. */
function segment(lignes: LigneDevis[], idx: number): string | null {
  for (let i = idx - 1; i >= 0; i--) {
    const t = lignes[i].type;
    if (t === 'groupe' || t === 'soustotal') return lignes[i].id;
  }
  return null;
}

/** Résine Flowfast à pigmenter (pas le cleaner 405, ni le catalyseur, ni les charges). */
function estResine(p: Produit | undefined): boolean {
  if (!p || estCatalyseur(p)) return false;
  const f = familleResine(p);
  return f !== null && f !== '405';
}

/** Kilos consommés d'une ligne : surface × conso, sinon unités vendues × poids. */
function kgDeLigne(
  l: LigneDevis,
  p: Produit | undefined,
  produits: Produit[],
  surfaceGlobaleM2: number,
  uniteDevis?: UniteSurface,
): { kg: number; base: SourceConso['base'] } {
  if (!p || !(p.poids && p.poids > 0)) return { kg: 0, base: 'vendu' };
  const u = uniteDeLigne(l, uniteDevis);
  const conso = consoDeLigne(l, u) ?? consoFiche(p, u) ?? 0;
  const surf = surfaceDeLigne(l, surfaceGlobaleM2, uniteDevis);
  const consomme = conso > 0 && surf > 0;
  // Une ligne vendue au m² (pavés) a une conso en m²/m², pas en kg : on ne la lit pas comme des kilos.
  const auM2 = /^m(²|2)$/i.test((l.unite || '').trim());
  const unites = consomme && !auM2 ? surf * conso / p.poids : (l.quantite || 0);
  // Résine contenue (un kit ne compte que sa résine) — température sans effet sur les kilos.
  const resine = familleResine(p) !== null
    ? calculerCatalyse([{ ...l, quantite: unites }], id => produitParId(produits, id), 20, undefined).resines
    : [];
  if (resine.length) return { kg: resine.reduce((s, r) => s + r.kg, 0), base: 'resine' };
  return { kg: unites * p.poids, base: consomme && !auM2 ? 'consomme' : 'vendu' };
}

/**
 * Le calcul d'une ligne dosée en %, ou `null` si elle ne l'est pas. Les
 * sources possibles sont les lignes d'article AU-DESSUS (pas les catalyseurs,
 * ni d'autres lignes dosées en %, pour ne jamais tourner en rond).
 */
export function calculerConsoRelative(
  lignes: LigneDevis[],
  id: string,
  produits: Produit[],
  surfaceGlobaleM2: number,
  uniteDevis?: UniteSurface,
): CalculConsoRelative | null {
  const idx = lignes.findIndex(l => l.id === id);
  const cible = lignes[idx];
  const r = cible?.consoRelative;
  if (!r) return null;
  const seg = segment(lignes, idx);
  const inclus = new Set(r.inclus ?? []);
  const exclus = new Set(r.exclus ?? []);
  const sources: SourceConso[] = [];
  for (let i = 0; i < idx; i++) {
    const l = lignes[i];
    if (!estArticle(l) || l.consoRelative || !l.produitId) continue;
    const p = produitParId(produits, l.produitId);
    if (!p || estCatalyseur(p)) continue;
    const { kg, base } = kgDeLigne(l, p, produits, surfaceGlobaleM2, uniteDevis);
    const parDefaut = estResine(p) && segment(lignes, i) === seg;
    if (!(kg > 0) && !parDefaut) continue;
    const retenue = inclus.has(l.id) || (parDefaut && !exclus.has(l.id));
    sources.push({ ligne: l, kg: arrondi(kg), base, parDefaut, retenue });
  }
  const pct = r.pct > 0 ? r.pct : 0;
  const kgSources = arrondi(sources.filter(s => s.retenue).reduce((s, x) => s + x.kg, 0));
  return { pct, sources, kgSources, kg: arrondi(kgSources * pct / 100) };
}

/** Coche ou décoche une source : retenue d'office, on la retire des exclus ; sinon on l'ajoute aux inclus (et inversement). */
export function basculerSource(r: ConsoRelative, s: Pick<SourceConso, 'ligne' | 'parDefaut'>, coche: boolean): ConsoRelative {
  const inclus = new Set(r.inclus ?? []);
  const exclus = new Set(r.exclus ?? []);
  const id = s.ligne.id;
  if (s.parDefaut) { inclus.delete(id); if (coche) exclus.delete(id); else exclus.add(id); }
  else { exclus.delete(id); if (coche) inclus.add(id); else inclus.delete(id); }
  return { pct: r.pct, ...(inclus.size ? { inclus: [...inclus] } : {}), ...(exclus.size ? { exclus: [...exclus] } : {}) };
}
