-- Unités pour la quantité et le prix de vente des produits concurrents
ALTER TABLE concurrent_produits ADD COLUMN IF NOT EXISTS quantite_unite text;
ALTER TABLE concurrent_produits ADD COLUMN IF NOT EXISTS prix_unite text;
