-- Variantes composées d'un article : combinaisons de produits proposées à la
-- saisie de l'article dans un devis (avant les options), tenant sur une ligne.
ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS type_variantes_compo boolean DEFAULT false;
ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS variantes_compo jsonb;
