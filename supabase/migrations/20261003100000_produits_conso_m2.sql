-- Articles consommés au m² (toile de verre…) : une unité de vente couvre
-- `surface_unite_m2` m², et `consommation` se lit alors en m²/m² (1 par défaut).
ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS conso_unite text;
ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS surface_unite_m2 numeric;
