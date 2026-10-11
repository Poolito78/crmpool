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

/**
 * Numéro du prochain devis : le plus petit numéro LIBÉRÉ par une suppression
 * (table `devis_numeros_liberes`, migration 20261011140000) et toujours libre,
 * sinon le plus grand + 1. Règle du 11/10/2026 : « les devis supprimés sont
 * supprimés, leur numéro redevient disponible » — pour une suite sans trou.
 *
 * Seuls les numéros notés à la suppression sont repris, jamais les trous
 * anciens : combler « le plus petit libre » donnerait DEV-2026-002 à un devis
 * d'octobre. Un numéro libéré d'une autre année n'est pas repris.
 */
export function prochainNumeroDevis(
  devis: { numero?: string }[],
  annee = new Date().getFullYear(),
  liberes: string[] = [],
): string {
  const prefixe = `DEV-${annee}`;
  const motif = new RegExp(`^${prefixe}-(\\d+)$`);
  const pris = new Set(devis.map(d => (d.numero || '').trim()));
  const candidats = liberes
    .map(n => n.trim())
    .filter(n => motif.test(n) && !pris.has(n))
    .sort((a, b) => parseInt(a.match(motif)![1], 10) - parseInt(b.match(motif)![1], 10));
  return candidats[0] ?? prochainNumero(devis, prefixe);
}
