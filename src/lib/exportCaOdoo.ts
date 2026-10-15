import * as XLSX from 'xlsx';
import type { CaOdooData, CaMois, CaFlooringQuartz } from '@/lib/caOdoo';

// ─── Extraction Excel de la tuile « CA Odoo » ───────────────────────────────
//
// Reprend, onglet par onglet, ce que la tuile affiche : marques, réalisé
// mensuel, puis « CA ISOFLOOR » — le tableau croisé Flooring & Quartz d'Odoo
// (commerciaux × mois) suivi du CA national hors FM — et « Rémunération FM »
// (hors FM × TAUX_REMUNERATION_FM, en formule).
//
// ⚠️ ON NE RECALCULE RIEN. Les montants sont ceux du jeu publié par
// `ca-refresh` ; seuls les cumuls de colonnes sont refaits, par simple somme
// des lignes affichées. Un « dont » (ISOFLOOR, verticale, STI, RTE) est DÉJÀ COMPRIS dans
// sa marque : il a sa colonne, il ne s'additionne jamais au total.
//
// Les montants partent en NOMBRES (format « # ##0,00 € »), jamais en texte :
// l'Excel doit pouvoir les additionner. Le détail par client reste dans
// l'extraction du tableau de bord « Détail par client » : le jeu lu ici ne
// garde pas les lignes clients.

const NOMS_MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const EUR = '#,##0.00 "€"';
const PCT = '0.0%';

type Cellule = string | number | null;

/** Feuille depuis un tableau de lignes ; les nombres reçoivent le format euro. */
function feuille(lignes: Cellule[][], largeurs: number[], formatsPct: Set<string> = new Set()) {
  const ws = XLSX.utils.aoa_to_sheet(lignes.map(l => l.map(v => (v === null ? '' : v))));
  for (const adresse of Object.keys(ws)) {
    if (adresse.startsWith('!')) continue;
    const c = ws[adresse] as XLSX.CellObject;
    if (c.t === 'n') c.z = formatsPct.has(adresse) ? PCT : EUR;
  }
  ws['!cols'] = largeurs.map(wch => ({ wch }));
  return ws;
}

const evolution = (avant: number, apres: number) => (avant ? (apres - avant) / avant : null);

function ongletMarques(d: CaOdooData) {
  const pct = new Set<string>();
  const lignes: Cellule[][] = [
    [`CA Odoo — facturé par marque, 01/01 → ${d.cutoff?.split('-').reverse().join('/') ?? '—'}, 2026 vs 2025 à date`],
    [],
    ['Marque', 'CA 2026', 'CA 2025', 'Écart', 'Projection FY26'],
  ];
  const ajouter = (libelle: string, a26: number, a25: number, proj: number) => {
    lignes.push([libelle, a26, a25, evolution(a25, a26), proj]);
    pct.add(`D${lignes.length}`);
  };
  for (const m of d.marques) {
    ajouter(m.label, m.ca26, m.ca25, m.projection);
    for (const s of m.donts) ajouter(`   ${s.label}`, s.ca26, s.ca25, s.projection);
  }
  ajouter('Total', d.ca26, d.ca25ytd, d.projection);
  lignes.push([], ['CA 2025 année pleine', d.ca25full]);
  lignes.push(['« dont » = déjà compris dans la marque du dessus, ne pas additionner.']);
  return feuille(lignes, [38, 16, 16, 10, 18], pct);
}

function ongletMensuel(d: CaOdooData) {
  const n1 = new Map(d.mois2025.map(m => [m.mois, m.total]));
  const lignes: Cellule[][] = [
    ['Réalisé mensuel 2026 — source Odoo, avoirs déduits ; total 2025 = rapport commercial (STI compris)'],
    [],
    ['Mois', 'ISOMARK', 'dont ISOFLOOR', 'ISOSIGN', 'dont STI', 'dont RTE', 'Total', 'Total 2025'],
  ];
  const cumul = { isomark: 0, isofloor: 0, isosign: 0, sti: 0, rte: 0, total: 0 };
  for (const m of d.mois) {
    lignes.push([NOMS_MOIS[m.mois - 1], m.isomark, m.isofloor, m.isosign, m.sti, m.rte, m.total, n1.get(m.mois) ?? null]);
    (Object.keys(cumul) as (keyof typeof cumul)[]).forEach(k => { cumul[k] += (m as CaMois)[k]; });
  }
  lignes.push(['Cumul', cumul.isomark, cumul.isofloor, cumul.isosign, cumul.sti, cumul.rte, cumul.total]);
  return feuille(lignes, [14, 15, 15, 15, 15, 15, 15, 15]);
}

function ongletIsofloor(fq: CaFlooringQuartz | null) {
  if (!fq || 'erreur' in fq) {
    const raison = fq && 'erreur' in fq ? fq.erreur : 'relancer l\'actualisation.';
    return feuille([
      ['CA ISOFLOOR — Flooring & Quartz, tous commerciaux'],
      [`Récap indisponible : ${raison}`],
    ], [90]);
  }
  const jour = Number(fq.cutoff.slice(8, 10));
  const dernier = fq.mois[fq.mois.length - 1]?.mois;
  const somme = (k: 'total' | 'hors_fm') => fq.mois.reduce((a, m) => a + m[k], 0);
  const lignes: Cellule[][] = [
    [`Analyse des factures Flooring & Quartz ${fq.annee} — Total HT du 01/01 au ${fq.cutoff.split('-').reverse().join('/')}, factures et avoirs clients (favori Odoo « ${fq.favori} »)`],
    [],
    ['', ...fq.mois.map(m => `${NOMS_MOIS[m.mois - 1]} ${fq.annee}${m.mois === dernier ? ` (au ${jour})` : ''}`), 'Total HT'],
    ['Total', ...fq.mois.map(m => m.total), somme('total')],
    ...fq.commerciaux.map(c => [c.nom, ...c.mois.map(v => (v ? v : null)), c.total] as Cellule[]),
    ['CA national hors FM (Total − F. MOUHOT)', ...fq.mois.map(m => m.hors_fm), somme('hors_fm')],
    [],
    ['Détail ISOFLOOR / quartz & granit par mois'],
    ['Mois', 'ISOFLOOR', 'Quartz & granit', 'Total global', '− F. MOUHOT', '= Hors FM', 'dont ISOFLOOR hors FM', 'dont quartz hors FM'],
    ...fq.mois.map(m => [
      NOMS_MOIS[m.mois - 1], m.isofloor, m.quartz, m.total, m.fm, m.hors_fm, m.hors_fm_isofloor, m.hors_fm_quartz,
    ] as Cellule[]),
    [],
    ['Catégories Odoo comprises', 'Rangée en', 'Total HT'],
    ...fq.categories.map(c => [c.nom, c.isofloor ? 'ISOFLOOR' : 'Quartz & granit', c.total] as Cellule[]),
  ];
  return feuille(lignes, [40, ...fq.mois.map(() => 15), 16]);
}

/**
 * Taux de rémunération de François MOUHOT sur le CA Flooring & Quartz national
 * hors FM : 2 % (règle du 11/10/2026, confirmée après un passage à 1 % —
 * 5 910,51 € en septembre → 118,21 €).
 */
export const TAUX_REMUNERATION_FM = 0.02;

/**
 * Récap mensuel : Total Flooring & Quartz, part F. MOUHOT, CA national hors FM
 * et rémunération brute = hors FM × TAUX_REMUNERATION_FM. La rémunération part en FORMULE
 * (`=D×taux`) : corriger un montant dans l'Excel la recalcule. Un mois au hors
 * FM négatif (avoirs) donne une rémunération négative — on ne la plafonne pas,
 * c'est au lecteur d'en décider.
 */
function ongletRemuneration(fq: CaFlooringQuartz | null) {
  if (!fq || 'erreur' in fq) {
    const raison = fq && 'erreur' in fq ? fq.erreur : 'relancer l\'actualisation.';
    return feuille([['Rémunération FM — Flooring & Quartz'], [`Récap indisponible : ${raison}`]], [90]);
  }
  const debut = 4; // première ligne de mois (numérotation Excel)
  const fin = debut + fq.mois.length - 1;
  const lignes: Cellule[][] = [
    [`Détail ISOFLOOR / quartz & granit par mois — ${fq.annee}, du 01/01 au ${fq.cutoff.split('-').reverse().join('/')}`],
    [],
    ['Mois', 'Total isofloor', 'F. MOUHOT', 'Hors FM CA NATIONAL', `RÉMUNÉRATION BRUT FM (${TAUX_REMUNERATION_FM * 100} %)`],
    ...fq.mois.map(m => [NOMS_MOIS[m.mois - 1], m.total, m.fm, m.hors_fm, m.hors_fm * TAUX_REMUNERATION_FM] as Cellule[]),
    ['Cumul', ...[1, 2, 3, 4].map(j => fq.mois.reduce((a, m) => a + [m.total, m.fm, m.hors_fm, m.hors_fm * TAUX_REMUNERATION_FM][j - 1], 0))],
  ];
  const ws = feuille(lignes, [14, 18, 18, 22, 30]);
  for (let r = debut; r <= fin; r++) (ws[`E${r}`] as XLSX.CellObject).f = `D${r}*${TAUX_REMUNERATION_FM}`;
  for (const col of ['B', 'C', 'D', 'E']) (ws[`${col}${fin + 1}`] as XLSX.CellObject).f = `SUM(${col}${debut}:${col}${fin})`;
  return ws;
}

/** Télécharge le classeur de la tuile CA Odoo. */
export function exporterCaOdoo(d: CaOdooData) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ongletMarques(d), 'Marques');
  XLSX.utils.book_append_sheet(wb, ongletMensuel(d), 'Réalisé mensuel');
  XLSX.utils.book_append_sheet(wb, ongletIsofloor(d.flooringQuartz), 'CA ISOFLOOR');
  XLSX.utils.book_append_sheet(wb, ongletRemuneration(d.flooringQuartz), 'Rémunération FM');
  XLSX.writeFile(wb, `CA_Odoo_${d.cutoff ?? new Date().toISOString().slice(0, 10)}.xlsx`);
}
