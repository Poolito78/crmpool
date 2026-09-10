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

/**
 * Ce qu'il faut d'une proposition Odoo pour la classer : son prix pour ce
 * client, et ce qu'Odoo en a en magasin.
 */
export interface PropositionOdoo {
  /** Prix de la liste du client. `null` = article hors barème. */
  contrat: number | null;
  /** Stock constaté chez Odoo. Absent = article non suivi en quantité. */
  stockDispo?: number;
}

/**
 * Ce qui disqualifie une proposition Odoo, à pertinence égale.
 *
 * ⚠️ **UN ARTICLE HORS BARÈME N'A PAS DE PRIX POUR CE CLIENT.** Il part au
 * devis sans montant, ou au tarif public — l'écart se compte en dizaines
 * d'euros par ligne. La rupture, elle, coûte un délai : elle pèse, mais moins.
 * Aucune des deux n'élimine — Odoo reste la source, et un article qui n'existe
 * qu'en rupture doit rester proposable.
 *
 * ⚠️ **UN STOCK INCONNU N'EST PAS UNE RUPTURE.** `stockDispo` manque sur les
 * articles qu'Odoo ne suit pas en quantité ; les pénaliser reviendrait à
 * préférer systématiquement ceux qu'il suit.
 */
function penaliteProposition(t: PropositionOdoo): number {
  return (t.contrat == null ? 2 : 0) + ((t.stockDispo ?? 1) <= 0 ? 1 : 0);
}

/**
 * Les propositions d'Odoo, ce qu'on peut vendre d'abord.
 *
 * ⚠️ **LA TÊTE DE LISTE EST CE QUE L'APPLI RETIENT.** Le 10/09/2026, sur la
 * demande AGILIS « 10 supports 40×80 mm, longueur 3 m », l'écran affichait
 * SG80401_5.3000.IS.BRUT en tête et cochait SG80401_5.3000.IS.L1000, marqué
 * « rupture » ET « hors barème ». Deux ordres pour une seule liste : on ne
 * peut pas vérifier un choix qu'on ne voit pas.
 *
 * Le tri est STABLE : l'ordre de pertinence d'Odoo reste maître entre deux
 * propositions également vendables. Il ne retire rien — il classe.
 */
export function ordonnerPropositions<T extends PropositionOdoo>(props: T[]): T[] {
  return props
    .map((t, rang) => ({ t, rang }))
    .sort((a, b) => penaliteProposition(a.t) - penaliteProposition(b.t) || a.rang - b.rang)
    .map(x => x.t);
}
