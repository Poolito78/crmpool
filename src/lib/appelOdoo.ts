/**
 * Clé d'un appel à `odoo-prix` : deux demandes identiques doivent la partager.
 *
 * CE QUI COÛTAIT CHER : l'effet qui interroge Odoo dépend de `clients` — un
 * tableau dont l'identité change à la moindre écriture — et de
 * `referencesDuDevis`, qui se recalcule dès qu'un article est corrigé. Chaque
 * frappe relançait donc le cycle entier : contrat cadre, contacts,
 * tarification, puis jusqu'à douze recherches enchaînées chez Odoo. Le plus
 * souvent la demande était pourtant RIGOUREUSEMENT LA MÊME que la précédente.
 *
 * On compare donc ce qu'on s'apprête à envoyer, pas ce qui a bougé dans React.
 *
 * L'ORDRE NE COMPTE PAS. `referencesDuDevis` sort d'un `Set` alimenté ligne à
 * ligne : retirer puis remettre le même article suffit à en changer l'ordre
 * sans rien changer à la demande. On trie donc avant de comparer, sans quoi le
 * cache manquerait précisément les cas qu'il doit couvrir.
 *
 * LA QUANTITÉ COMPTE, elle : le tarif contractuel a des paliers, et « 1 » et
 * « 50 » ne donnent pas le même prix. Elle voyage donc avec le texte.
 */

export interface CorpsAppelOdoo {
  client: unknown;
  lignes: { reference: string; quantite: number }[];
  recherches: { texte: string; quantite: number }[];
  niveau?: string;
  niveauDefaut?: string;
}

export function cleAppelOdoo(corps: CorpsAppelOdoo): string {
  const lignes = corps.lignes
    .map(l => `${l.reference}\u0001${l.quantite}`)
    .sort();
  const recherches = corps.recherches
    .map(r => `${r.texte}\u0001${r.quantite}`)
    .sort();
  return JSON.stringify({
    client: corps.client ?? null,
    lignes,
    recherches,
    niveau: corps.niveau ?? null,
    niveauDefaut: corps.niveauDefaut ?? null,
  });
}
