-- Ajout des colonnes fiche produit (lien + texte du lien)
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS fiche_url text,
  ADD COLUMN IF NOT EXISTS fiche_link_label text;
