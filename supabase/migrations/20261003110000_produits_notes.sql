-- Notes libres d'une fiche article (texte, chiffres : saisie à la main, internes).
ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS notes text;
