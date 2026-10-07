/**
 * Numéro du prochain devis : le plus grand numéro de l'année + 1.
 *
 * ⚠️ L'ancien calcul était « nombre de devis + 1 ». Il redonnait un numéro déjà
 * pris dès qu'un devis était supprimé, ou qu'un numéro avait été repris à la
 * main : DEV-2026-106 existait en double. Compter ne dit rien des numéros
 * utilisés ; seul le plus grand le dit.
 *
 * Seuls les numéros de la forme `DEV-AAAA-nnn` comptent (celui d'un devis
 * concurrent ou d'un numéro de document client, « AF037419 », est ignoré).
 */
export function prochainNumeroDevis(devis: { numero?: string }[], annee = new Date().getFullYear()): string {
  const motif = new RegExp(`^DEV-${annee}-(\\d+)$`);
  let max = 0;
  for (const d of devis) {
    const m = (d.numero || '').trim().match(motif);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `DEV-${annee}-${String(max + 1).padStart(3, '0')}`;
}
