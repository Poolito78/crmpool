-- Troisième mention de fiche : « systeme » (fiche système de mise en œuvre).
ALTER TABLE public.produits DROP CONSTRAINT IF EXISTS produits_fiche_type_check;
ALTER TABLE public.produits ADD CONSTRAINT produits_fiche_type_check
  CHECK (fiche_type IN ('fournisseur', 'isofloor', 'systeme'));

ALTER TABLE public.categorie_documents DROP CONSTRAINT IF EXISTS categorie_documents_mention_check;
ALTER TABLE public.categorie_documents ADD CONSTRAINT categorie_documents_mention_check
  CHECK (mention IN ('fournisseur', 'isofloor', 'systeme'));
