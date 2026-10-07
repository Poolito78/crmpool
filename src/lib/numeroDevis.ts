/**
 * Numéro suivant d'un document (devis, commande, facture) : le plus grand
 * numéro déjà pris + 1.
 *
 * ⚠️ L'ancien calcul était « nombre de documents + 1 ». Il redonnait un numéro
 * déjà pris dès qu'un document était supprimé, ou qu'un numéro avait été repris
 * à la main : DEV-2026-106 existait en double. Compter ne dit rien des numéros
 * utilisés ; seul le plus grand le dit.
 *
 * Seuls les numéros de la forme `<préfixe>-nnn` comptent : le numéro d'un
 * document client (« AF037419 ») ou d'une autre série (PRO- pour FAC-) est
 * ignoré. Le préfixe porte l'année : `FAC-2026`.
 */
export function prochainNumero(
  documents: { numero?: string }[],
  prefixe: string,
  largeur = 3,
): string {
  const motif = new RegExp(`^${prefixe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`);
  let max = 0;
  for (const d of documents) {
    const m = (d.numero || '').trim().match(motif);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefixe}-${String(max + 1).padStart(largeur, '0')}`;
}

export const prochainNumeroDevis = (devis: { numero?: string }[], annee = new Date().getFullYear()) =>
  prochainNumero(devis, `DEV-${annee}`);
