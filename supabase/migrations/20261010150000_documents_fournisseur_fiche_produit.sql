-- Nouveau genre de document fournisseur : « fiche_produit » (fiche technique).
ALTER TABLE public.documents_fournisseur DROP CONSTRAINT IF EXISTS documents_fournisseur_genre_check;
ALTER TABLE public.documents_fournisseur ADD CONSTRAINT documents_fournisseur_genre_check
  CHECK (genre IN ('devis', 'commande', 'bon_livraison', 'facture', 'fiche_produit', 'autre'));
