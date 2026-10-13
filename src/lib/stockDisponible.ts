/* Stock disponible d'un article = stock MonCRM − quantités réservées.
 *
 * Réservé = commandes clients EN COURS (à traiter, AR envoyé, commande
 * envoyée) : la marchandise est encore au dépôt mais déjà promise. Une
 * commande livrée, facturée ou payée est sortie du stock, la compter encore
 * la retrancherait deux fois.
 *
 * La page Stock et l'assistant vocal lisent tous deux cette règle : deux
 * calculs finiraient par annoncer deux disponibles différents pour le même
 * article. Le stock Odoo (`Produit.stockOdoo`) est un autre chiffre, celui
 * que voit l'ERP — il s'affiche À CÔTÉ, jamais à la place.
 */

import type { CommandeClient, StatutCommandeClient } from '@/lib/store';

export const STATUTS_RESERVANT: StatutCommandeClient[] = ['a_traiter', 'accuse_envoye', 'commande_envoyee'];

/** Quantité réservée par identifiant d'article. */
export function quantitesReservees(commandesClient: CommandeClient[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const cc of commandesClient) {
    if (!STATUTS_RESERVANT.includes(cc.statut)) continue;
    for (const l of cc.lignes) {
      if (l.produitId) map[l.produitId] = (map[l.produitId] || 0) + (l.quantite || 0);
    }
  }
  return map;
}
