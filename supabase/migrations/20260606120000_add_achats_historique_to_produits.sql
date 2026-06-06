-- Historique manuel des achats datés (prix + quantité) pour la valorisation du stock.
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS achats_historique jsonb;
