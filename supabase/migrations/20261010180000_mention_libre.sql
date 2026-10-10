-- La mention d'une fiche devient un TEXTE LIBRE (les trois mentions habituelles
-- restent proposées par leur clé : fournisseur, isofloor, systeme).
ALTER TABLE public.produits DROP CONSTRAINT IF EXISTS produits_fiche_type_check;
ALTER TABLE public.categorie_documents DROP CONSTRAINT IF EXISTS categorie_documents_mention_check;
