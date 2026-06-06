-- Ajoute une colonne "quantité" aux produits concurrents (Veille Concurrence)
-- pour les prix renseignés par quantité (ex : prix pour 1000 unités).
ALTER TABLE concurrent_produits
  ADD COLUMN IF NOT EXISTS quantite numeric;
