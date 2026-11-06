import type { ItemPDF } from './grilleAffretement';

/**
 * LE PORT D'UN DOCUMENT FOURNISSEUR : combien, pour quel poids, livré où.
 * Ces trois valeurs font un palier de la fiche fournisseur (« 184,90 € dès
 * 1 032 kg, livraison 77 »), donc le coût d'achat des prochains transports.
 *
 * Le poids et le code postal se lisent SUR LE DOCUMENT, sans IA. Une
 * confirmation Tremco porte « Poids brut: 1.012,00 KG » à chaque ligne, mais
 * pdf.js rend « 1.012,00 Poids brut: KG » : le texte brut ne se recherche pas,
 * et le modèle le lit dans le désordre. On reconstitue donc d'abord les lignes
 * à la position des cellules (`texteEnLignes`).
 *
 * Le poids retenu est celui que le transporteur facture : un total écrit, sinon
 * la somme des poids BRUTS, sinon celle des poids nets. RIEN N'EST DEVINÉ : sans
 * poids écrit, l'écran le dit et passe aux poids des fiches articles.
 */

export interface PoidsEcrit {
  kg: number;
  origine: 'total' | 'brut' | 'net' | 'unique';
  /** Nombre de poids additionnés (à comparer aux lignes d'article du document). */
  nbLignes: number;
}

export const LIBELLE_ORIGINE_POIDS: Record<PoidsEcrit['origine'], string> = {
  total: 'poids total du document',
  brut: 'poids brut du document',
  net: 'poids net du document',
  unique: 'poids du document',
};

const NOMBRE = String.raw`(\d{1,3}(?:[ .\u00a0\u202f]\d{3})+(?:,\d+)?|\d{1,3}(?:,\d{3})+\.\d+|\d+(?:[.,]\d+)?)`;
const RE_TOTAL = new RegExp(
  String.raw`\b(?:poids\s+(?:brut\s+)?total(?:\s+brut)?|total\s+poids|poids\s+exp[ée]di[ée])\s*:?\s*${NOMBRE}\s*kg\b`, 'i');
const RE_BRUT = new RegExp(String.raw`\bpoids\s+brut\s*:?\s*${NOMBRE}\s*kg\b`, 'gi');
const RE_NET = new RegExp(String.raw`\bpoids\s+net\s*:?\s*${NOMBRE}\s*kg\b`, 'gi');
const RE_POIDS = new RegExp(String.raw`\bpoids\s*:?\s*${NOMBRE}\s*kg\b`, 'gi');

/**
 * Un nombre tel qu'écrit : « 1.012,00 », « 1 012,00 », « 1,012.00 », « 890,5 ».
 * Le point seul suivi de trois chiffres est un séparateur de milliers
 * (« 1.012 »), la virgule seule toujours une décimale (« 1,250 kg »).
 */
export function nombreLu(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/[\s\u00a0\u202f€]/g, '').replace(/kg$/i, '');
  if (!/^\d[\d.,]*$/.test(t)) return undefined;
  const virgule = t.lastIndexOf(',');
  const point = t.lastIndexOf('.');
  let n: string;
  if (virgule >= 0 && point >= 0) {
    n = virgule > point ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (point >= 0) {
    n = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t;
  } else {
    n = t.replace(',', '.');
  }
  const r = parseFloat(n);
  return Number.isFinite(r) ? r : undefined;
}

/** Les cellules du PDF remises en lignes, de haut en bas et de gauche à droite. */
export function texteEnLignes(items: ItemPDF[]): string {
  const lignes: { page: number; y: number; c: ItemPDF[] }[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const l = lignes.find(x => x.page === it.page && Math.abs(x.y - it.y) <= 3);
    if (l) l.c.push(it); else lignes.push({ page: it.page, y: it.y, c: [it] });
  }
  return lignes
    .sort((a, b) => a.page - b.page || b.y - a.y)
    .map(l => l.c.sort((a, b) => a.x - b.x).map(c => c.str.trim()).join(' '))
    .join('\n');
}

const somme = (texte: string, re: RegExp): { kg: number; n: number } => {
  let kg = 0;
  let n = 0;
  for (const m of texte.matchAll(re)) {
    const v = nombreLu(m[1]);
    if (v && v > 0) { kg += v; n += 1; }
  }
  return { kg: Math.round(kg * 100) / 100, n };
};

/** Le poids écrit sur le document ; `undefined` s'il n'y en a pas. */
export function lirePoidsEcrit(texte: string): PoidsEcrit | undefined {
  const total = nombreLu(texte.match(RE_TOTAL)?.[1]);
  if (total && total > 0) return { kg: total, origine: 'total', nbLignes: 1 };
  const brut = somme(texte, RE_BRUT);
  if (brut.n) return { kg: brut.kg, origine: 'brut', nbLignes: brut.n };
  const net = somme(texte, RE_NET);
  if (net.n) return { kg: net.kg, origine: 'net', nbLignes: net.n };
  /* « Poids : 12 kg » répété peut être le poids d'un article : seul, c'est celui de l'envoi. */
  const seul = somme(texte, RE_POIDS);
  return seul.n === 1 ? { kg: seul.kg, origine: 'unique', nbLignes: 1 } : undefined;
}

/**
 * Le code postal sous « Adresse de livraison ». Une ligne qui porte aussi
 * « facturation » annonce deux colonnes : le premier code venu serait celui de
 * la facturation, on préfère ne rien répondre.
 */
export function lireCodePostalLivraison(texte: string): string | undefined {
  const lignes = texte.split('\n');
  const i = lignes.findIndex(l => /adresse\s+de\s+livraison/i.test(l));
  if (i < 0 || /factur/i.test(lignes[i])) return undefined;
  for (const l of lignes.slice(i, i + 10)) {
    const m = l.match(/(?:^|\s)(\d{5})\s+[A-ZÀ-Ü]/);
    if (m) return m[1];
  }
  return undefined;
}

/**
 * Une ligne de transport n'est pas un article : « FREIGHT », « FRAIS DE
 * TRANSPORT », « Port », « Forfait livraison ». Le libellé seul ou la référence.
 */
export function estLignePort(l: { description?: string; reference?: string }): boolean {
  const re = /\b(freight|carriage|frais\s+(de\s+)?(transport|port|livraison|exp[ée]dition)|participation\s+(aux\s+frais\s+de\s+)?(transport|port|livraison)|forfait\s+(transport|port|livraison)|port\s+(ht|et\s+emballage|forfaitaire))\b|^\s*(transport|port|livraison|carriage)\s*$/i;
  return re.test(l.description || '') || /^\s*(freight|carriage)\s*$/i.test(l.reference || '');
}
