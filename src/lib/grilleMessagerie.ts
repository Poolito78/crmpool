import type { GrilleMessagerie } from './store';
import { enteteDuTarif, prixDe, type ItemPDF } from './grilleAffretement';
import { normaliserDept } from './transportFournisseur';

/**
 * GRILLE MESSAGERIE d'un fournisseur — les colis, à ne pas confondre avec
 * l'affrètement à la palette (`grilleAffretement.ts`). Tarif QRM 2026 :
 *
 *   page 1 :            0 à 4 kg   5 à 9 kg  …  90 à 99 kg
 *            Zone 01     18,00 €    19,00 €  …    48,00 €
 *            Corse      148,00 €   171,00 €  …   474,00 €
 *
 *   page 2 : Zone 01   27
 *            Zone 03   02 ; 41 ; 45 ; … ; 91-95        (+ une carte de France
 *            Corse     20                               dont les numéros
 *                                                       traînent sur les lignes)
 *
 * Lue sans IA, à la position des cellules, comme l'affrètement. Les
 * départements d'une zone sont la suite CONTIGUË de cellules qui suit son
 * libellé : les numéros de la carte, plus loin sur la même ligne, n'en font
 * pas partie. « 91-95 » vaut 91 à 95, « 20 » la Corse (2A et 2B).
 *
 * Seul le supplément « pour tout envoi » est compté dans le prix ; les
 * autres frais (zones urbaines, ADR, RDV) dépendent de l'envoi et restent
 * écrits dans `conditions`.
 */

const MEME_LIGNE = 3;
/** Écart maximal entre deux cellules d'une même liste de départements (points PDF). */
const CONTIGU = 45;
/** Écart entre le libellé « Zone 01 » et le premier département de sa liste. */
const APRES_LIBELLE = 60;

const RE_TRANCHE = /^(\d+(?:[.,]\d+)?)\s*(?:à|a|-)\s*(\d+(?:[.,]\d+)?)\s*kg$/i;
const RE_ZONE = /^(?:zone\s*([0-9]{1,2}|[A-Z]))$|^(corse)$/i;

const num = (s: string) => parseFloat(s.replace(',', '.'));

function zoneDe(s: string): string | undefined {
  const m = s.trim().match(RE_ZONE);
  if (!m) return undefined;
  return m[2] ? 'CORSE' : /^\d$/.test(m[1]) ? `0${m[1]}` : m[1].toUpperCase();
}

/** « 02 ; 41 ; 91-95 », « 30 ; 31 ; », « ; 98 » → départements. « 20 » = Corse. */
export function departementsDeListe(texte: string): string[] {
  const out: string[] = [];
  for (const tok of texte.split(/[;,\s]+/).filter(Boolean)) {
    const r = tok.match(/^(\d{2})-(\d{2})$/);
    if (r) {
      for (let n = Number(r[1]); n <= Number(r[2]); n++) {
        const d = normaliserDept(String(n));
        if (d) out.push(d);
      }
    } else if (tok === '20') {
      out.push('2A', '2B');
    } else {
      const d = /^(\d{2,3}|2[AB])$/i.test(tok) ? normaliserDept(tok) : undefined;
      if (d) out.push(d);
    }
  }
  return out;
}

export function lireGrilleMessagerie(items: ItemPDF[]): Omit<GrilleMessagerie, 'dateImport' | 'source'> | null {
  const cellules = items
    .map(i => ({ ...i, str: i.str.replace(/\s+/g, ' ').trim() }))
    .filter(i => i.str);
  const proche = (a: number, b: number) => Math.abs(a - b) <= MEME_LIGNE;
  const surLigne = (c: ItemPDF) => cellules
    .filter(x => x.page === c.page && proche(x.y, c.y) && x.x > c.x)
    .sort((a, b) => a.x - b.x);

  /* En-tête des tranches : la ligne qui en porte le plus. */
  const entetes = cellules.filter(c => RE_TRANCHE.test(c.str));
  if (entetes.length < 2) return null;
  const ref = entetes
    .map(c => ({ c, n: entetes.filter(x => x.page === c.page && proche(x.y, c.y)).length }))
    .sort((a, b) => b.n - a.n)[0].c;
  const colonnes = entetes
    .filter(x => x.page === ref.page && proche(x.y, ref.y))
    .sort((a, b) => a.x - b.x)
    .map(c => {
      const m = c.str.match(RE_TRANCHE)!;
      return { x: c.x, min: num(m[1]), max: num(m[2]) };
    });

  const zones: { zone: string; prix: (number | null)[] }[] = [];
  const departements: Record<string, string> = {};

  for (const lib of cellules) {
    const zone = zoneDe(lib.str);
    if (!zone) continue;
    const ligne = surLigne(lib);
    const prix = ligne.filter(c => prixDe(c.str) !== undefined);

    if (prix.length && lib.page === ref.page && !zones.some(z => z.zone === zone)) {
      /* Chaque prix va à la tranche la plus proche. */
      const parCol: (number | null)[] = colonnes.map(() => null);
      for (const p of prix) {
        let k = 0;
        colonnes.forEach((c, j) => { if (Math.abs(c.x - p.x) < Math.abs(colonnes[k].x - p.x)) k = j; });
        if (parCol[k] == null) parCol[k] = prixDe(p.str)!;
      }
      zones.push({ zone, prix: parCol });
    } else if (!prix.length) {
      /* Liste des départements : la suite contiguë qui suit le libellé. */
      const liste: string[] = [];
      let dernier = lib.x;
      for (const c of ligne) {
        if (c.x - dernier > (liste.length ? CONTIGU : APRES_LIBELLE)) break;
        liste.push(c.str);
        dernier = c.x;
      }
      for (const d of departementsDeListe(liste.join(' '))) {
        if (!departements[d]) departements[d] = zone;
      }
    }
  }

  if (zones.length < 3) return null;

  /* Frais écrits sous « FRAIS … » : le supplément « pour tout envoi » est
     compté, les autres sont rappelés tels quels (sans les numéros de carte). */
  let supplementParEnvoi: number | undefined;
  const toutEnvoi = cellules.find(c => /pour tout envoi/i.test(c.str));
  if (toutEnvoi) {
    const p = cellules
      .filter(c => c.page === toutEnvoi.page && proche(c.y, toutEnvoi.y) && prixDe(c.str) !== undefined)
      .sort((a, b) => Math.abs(a.x - toutEnvoi.x) - Math.abs(b.x - toutEnvoi.x))[0];
    if (p) supplementParEnvoi = prixDe(p.str);
  }
  const conditions: string[] = [];
  /* Le PREMIER titre « FRAIS … » de la page (le plus haut) : supplémentaires, puis complémentaires. */
  const frais = cellules
    .filter(c => /^frais\b/i.test(c.str))
    .sort((a, b) => a.page - b.page || b.y - a.y)[0];
  if (frais) {
    const bas = cellules.filter(c => c.page === frais.page && c.y < frais.y + MEME_LIGNE && !/^\d{2}$/.test(c.str));
    const lignes: { y: number; c: ItemPDF[] }[] = [];
    for (const c of bas) {
      const l = lignes.find(x => proche(x.y, c.y));
      if (l) l.c.push(c); else lignes.push({ y: c.y, c: [c] });
    }
    for (const l of lignes.sort((a, b) => b.y - a.y)) {
      const t = l.c.sort((a, b) => a.x - b.x).map(c => c.str).join(' ').trim();
      if (t && !/^frais\b/i.test(t)) conditions.push(t);
    }
  }
  const pied = cellules.find(c => /^prix ht/i.test(c.str) && /kg|sg|frais/i.test(c.str));
  if (pied) conditions.unshift(pied.str);

  return {
    ...enteteDuTarif(cellules.map(c => c.str), /messagerie/i),
    ...(conditions.length ? { conditions } : {}),
    tranches: colonnes.map(({ min, max }) => ({ min, max })),
    zones,
    departements,
    ...(supplementParEnvoi ? { supplementParEnvoi } : {}),
  };
}
