-- Options d'un article : produits proposés en option quand l'article est saisi
-- dans un devis (à cocher), à la différence d'un kit dont toutes les lignes
-- sont insérées d'office.
ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS type_options boolean DEFAULT false;
ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS lignes_options jsonb;
