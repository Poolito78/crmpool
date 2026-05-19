-- Prix par palier sur les produits (quantité/poids → achat + vente)
ALTER TABLE public.produits
  ADD COLUMN IF NOT EXISTS paliers_prix JSONB DEFAULT NULL;
