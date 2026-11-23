import type { CaMois, CaFlooringQuartz } from '@/lib/caOdoo';

// ─── Rémunération variable de François MOUHOT ───────────────────────────────
//
// Reprend le calcul du classeur « Total Variable » de l'utilisateur, mois par
// mois :
//   % ISOSIGN  = CA ISOSIGN du portefeuille FM (STI et RTE compris) × 0,5 %
//   % ISOMARK  = CA ISOMARK du portefeuille FM (ISOFLOOR compris)   × 1 %
//   % Flooring hors secteur = CA Flooring & Quartz national hors FM × 1 %
// Le total variable d'un mois est la somme des trois.
//
// ⚠️ Flooring hors secteur passé de 2 % à 1 % le 23/11/2026 (règle de
// l'utilisateur ; 2 % depuis le 11/10).
//
// ⚠️ ON NE RECALCULE AUCUN CA : ISOSIGN / ISOMARK viennent du réalisé mensuel
// (`summary.monthly`), le hors FM du récap Flooring & Quartz, tous deux publiés
// par `ca-refresh`. Un mois sans récap Flooring a un hors FM `null`, jamais 0.

export const TAUX_ISOSIGN = 0.005;
export const TAUX_ISOMARK = 0.01;
/** Taux sur le CA Flooring & Quartz national hors FM (« Flooring hors secteur »). */
export const TAUX_REMUNERATION_FM = 0.01;

export type LigneVariable = {
  mois: number;
  isosign: number;
  isomark: number;
  /** CA Flooring & Quartz national hors FM ; `null` si le récap est indisponible. */
  horsFm: number | null;
  varIsosign: number;
  varIsomark: number;
  varFlooring: number;
  total: number;
};

/** Une ligne par mois du réalisé, avec les trois parts variables. */
export function lignesVariable(mois: CaMois[], fq: CaFlooringQuartz | null): LigneVariable[] {
  const horsFm = new Map<number, number>();
  if (fq && !('erreur' in fq)) for (const m of fq.mois) horsFm.set(m.mois, m.hors_fm);
  return mois.map(m => {
    const hf = horsFm.has(m.mois) ? horsFm.get(m.mois)! : null;
    const varIsosign = m.isosign * TAUX_ISOSIGN;
    const varIsomark = m.isomark * TAUX_ISOMARK;
    const varFlooring = (hf ?? 0) * TAUX_REMUNERATION_FM;
    return { mois: m.mois, isosign: m.isosign, isomark: m.isomark, horsFm: hf, varIsosign, varIsomark, varFlooring, total: varIsosign + varIsomark + varFlooring };
  });
}

/**
 * Dernier mois COMPLET à la date d'arrêté (AAAA-MM-JJ) : le mois de l'arrêté
 * s'il en est le dernier jour, sinon le précédent — arrêté au 12/10 →
 * septembre, comme le « Total Variable SEPTEMBRE » du classeur. `null` en
 * janvier non clos.
 */
export function moisVariable(cutoff: string | null): number | null {
  if (!cutoff) return null;
  const [a, m, j] = cutoff.split('-').map(Number);
  if (!a || !m || !j) return null;
  const dernierJour = new Date(a, m, 0).getDate();
  const mois = j >= dernierJour ? m : m - 1;
  return mois >= 1 ? mois : null;
}
