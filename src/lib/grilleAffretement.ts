import { prixAffretementGrille, type Fournisseur, type GrilleAffretement, type TarifAffretementDept } from './store';
import { normaliserDept } from './transportFournisseur';

/**
 * GRILLE D'AFFRÈTEMENT d'un fournisseur : un prix par département de
 * livraison et par nombre de palettes (tarif QRM « TARIFS HT AFFRETEMENT
 * 2026 », 95 départements × 1 à 6 palettes).
 *
 * Elle NE PASSE PAS PAR L'IA : six cents prix résumés par un modèle, ce sont
 * des prix inventés ou tronqués. Le texte du PDF, lui, mélange l'ordre des
 * cellules (tous les prix, puis tous les départements). On lit donc les
 * cellules à leur POSITION sur la page :
 *
 *   AIN 01        1      2      3   …     ← libellé + nombre de palettes
 *   T3          222 €  317 €  393 €  …     ← code service + prix, juste dessous
 *
 * Chaque prix va à la colonne de palettes la plus proche. Rien n'est deviné :
 * un département sans ligne de prix lisible est laissé de côté.
 */

export interface ItemPDF {
  str: string;
  x: number;
  y: number;
  page: number;
}

/** Écart vertical toléré entre deux cellules d'une même ligne (points PDF). */
const MEME_LIGNE = 4;
/** La ligne de prix se trouve sous le libellé, à moins de cet écart. */
const SOUS_LIBELLE = 26;

const RE_PRIX = /^(\d[\d\s  ]*(?:[.,]\d{1,2})?)\s*€$/;
const RE_LIBELLE = /^(.*[A-Za-zÀ-ÿ'’])\s*(\d{2,3}|2[AB])((?:\s+\d{1,2})*)$/;
const RE_SERVICE = /^[A-Z]{1,4}\d?$/;

/** « 222 € », « 18,00 € » → nombre ; `undefined` si ce n'est pas un prix. */
export const prixDe = (s: string): number | undefined => {
  const m = s.trim().match(RE_PRIX);
  if (!m) return undefined;
  const n = parseFloat(m[1].replace(/[\s  ]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Le libellé d'un département (« AIN 01 », « DEUX SEVRES79 », « HAUTE MARNE 52 1 2 3 »). */
function libelleDe(s: string): { nom: string; dept: string; palettes: number[] } | undefined {
  const t = s.replace(/\s+/g, ' ').trim();
  if (/[€=]/.test(t)) return undefined;
  const m = t.match(RE_LIBELLE);
  if (!m) return undefined;
  const dept = normaliserDept(m[2]);
  if (!dept) return undefined;
  const palettes = m[3].trim() ? m[3].trim().split(/\s+/).map(Number) : [];
  return { nom: m[1].trim(), dept, palettes };
}

const proche = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/**
 * Les tarifs lus, département par département. `null` si le document n'a
 * pas l'allure d'une grille (moins de 3 départements chiffrés).
 */
export function lireGrilleAffretement(items: ItemPDF[]): Omit<GrilleAffretement, 'dateImport' | 'source'> | null {
  const cellules = items
    .map(i => ({ ...i, str: i.str.replace(/\s+/g, ' ').trim() }))
    .filter(i => i.str);
  const tarifs: TarifAffretementDept[] = [];
  const vus = new Set<string>();

  for (const lib of cellules) {
    const l = libelleDe(lib.str);
    /* « Zone 01 » est une ZONE de messagerie, pas le département de l'Ain. */
    if (!l || vus.has(l.dept) || /^zone$/i.test(l.nom)) continue;
    const page = cellules.filter(c => c.page === lib.page);

    /* Ligne de prix : sous le libellé (tableau QRM), sinon sur sa ligne. */
    const prixSous = page.filter(c => prixDe(c.str) !== undefined && c.y < lib.y - 2 && c.y >= lib.y - SOUS_LIBELLE);
    const yPrix = prixSous.length ? Math.max(...prixSous.map(c => c.y)) : undefined;
    const prix = (yPrix !== undefined
      ? prixSous.filter(c => proche(c.y, yPrix, 3))
      : page.filter(c => prixDe(c.str) !== undefined && proche(c.y, lib.y, MEME_LIGNE) && c.x > lib.x))
      .sort((a, b) => a.x - b.x);
    if (!prix.length) continue;

    /* En-tête des palettes : sur la ligne du libellé, sinon le premier
       « 1 2 3 … » au-dessus sur la page, sinon 1, 2, 3… dans l'ordre. */
    const enLigne = (y: number) => page
      .filter(c => /^\d{1,2}$/.test(c.str) && proche(c.y, y, MEME_LIGNE) && c.x > lib.x)
      .sort((a, b) => a.x - b.x);
    let entete = enLigne(lib.y);
    if (!entete.length && !l.palettes.length) {
      const yHaut = page
        .filter(c => /^\d{1,2}$/.test(c.str) && c.y > lib.y)
        .map(c => c.y).sort((a, b) => a - b)[0];
      if (yHaut !== undefined) entete = enLigne(yHaut);
    }

    let paliers: { palettes: number; prix: number }[];
    if (entete.length) {
      const pris = new Set<number>();
      paliers = [];
      for (const p of prix) {
        const col = entete.reduce((best, c) => (Math.abs(c.x - p.x) < Math.abs(best.x - p.x) ? c : best));
        const n = Number(col.str);
        if (pris.has(n)) continue;
        pris.add(n);
        paliers.push({ palettes: n, prix: prixDe(p.str)! });
      }
    } else {
      const cols = l.palettes.length === prix.length ? l.palettes : prix.map((_, i) => i + 1);
      paliers = prix.map((p, i) => ({ palettes: cols[i], prix: prixDe(p.str)! }));
    }
    paliers.sort((a, b) => a.palettes - b.palettes);

    const service = page.find(c =>
      RE_SERVICE.test(c.str) && c.x < prix[0].x && proche(c.y, prix[0].y, 3) && !libelleDe(c.str));

    vus.add(l.dept);
    tarifs.push({ dept: l.dept, nom: l.nom, ...(service ? { service: service.str } : {}), paliers });
  }

  if (tarifs.length < 3) return null;
  tarifs.sort((a, b) => a.dept.localeCompare(b.dept, 'fr', { numeric: true }));

  const textes = cellules.map(c => c.str);
  const conditions = [...new Set(textes.filter(t =>
    /\b(hayon|adr|sg)\s*=|\bhors\s+adr\b|\bau d[ée]part\b/i.test(t)))];

  return {
    ...enteteDuTarif(textes, /affr[ée]tement|transport/i),
    ...(conditions.length ? { conditions } : {}),
    tarifs,
  };
}

/** Titre, validité et ville de départ d'une grille de transport, tels qu'écrits. */
export function enteteDuTarif(textes: string[], motTitre: RegExp): { titre?: string; validite?: string; depart?: string } {
  const tout = textes.join(' ');
  const titre = textes.find(t => /tarif/i.test(t) && motTitre.test(t));
  const validite = tout.match(/(\d{2}\/\d{2}\/\d{4}\s*(?:au|-|à)\s*\d{2}\/\d{2}\/\d{4})/i)?.[1];
  const depart = tout.match(/au d[ée]part d[e'’]\s*([A-ZÀ-Ü][A-ZÀ-Ü' -]*?\s*\(\d{2}\))/i)?.[1]?.trim();
  return {
    ...(titre ? { titre } : {}),
    ...(depart ? { depart } : {}),
    ...(validite ? { validite } : {}),
  };
}

/**
 * Prix d'affrètement pour un département saisi (« 1 », « 01 », « 2a ») et
 * un nombre de palettes : voir `prixAffretementGrille` (`store.ts`), qui
 * sert au calcul du port.
 */
export function prixAffretement(
  grille: Pick<GrilleAffretement, 'tarifs'> | undefined,
  dept: string | undefined,
  palettes: number,
): { prix: number; palettes: number; service?: string } | null {
  return prixAffretementGrille(grille, normaliserDept(dept), palettes);
}

/** Nombre de palettes le plus grand de la grille (en-tête du tableau). */
export function palettesDeLaGrille(grille: Pick<GrilleAffretement, 'tarifs'>): number[] {
  return [...new Set(grille.tarifs.flatMap(t => t.paliers.map(p => p.palettes)))].sort((a, b) => a - b);
}

const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/**
 * Le fournisseur NOMMÉ dans les textes donnés, dans l'ordre : la consigne de
 * l'utilisateur (« TARIF TRANSPORT QRM ») d'abord, puis le nom du fichier,
 * puis le document. Un nom ne compte que s'il apparaît comme mot entier ;
 * ISOSIGN (le destinataire) n'est jamais retenu.
 */
export function fournisseurNomme(fournisseurs: Fournisseur[], textes: string[]): Fournisseur | undefined {
  const noms = fournisseurs.flatMap(f => [f.societe, f.nom]
    .map(n => normaliser(String(n ?? '').trim()))
    .filter(n => n.length >= 2 && !/\bISOSIGN\b/.test(n))
    .map(n => ({ f, n })))
    .sort((a, b) => b.n.length - a.n.length);
  for (const texte of textes) {
    const t = normaliser(texte ?? '');
    if (!t.trim()) continue;
    const trouve = noms.find(({ n }) =>
      new RegExp(`(^|[^A-Z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Z0-9])`).test(t));
    if (trouve) return trouve.f;
  }
  return undefined;
}

/** Le nom du fichier ou la consigne annoncent un tarif de transport. */
export function ressembleTarifTransport(...textes: string[]): boolean {
  const t = normaliser(textes.join(' '));
  return /\b(TARIFS?|GRILLE|BAREME)\b/.test(t) && /\b(TRANSPORT|AFFRETEMENT|MESSAGERIE|PORT)\b/.test(t);
}
