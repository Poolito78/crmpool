-- Mention d'un document de catégorie : « fournisseur » ou « isofloor » (précède
-- le texte du lien dans les mails et les devis), comme sur les fiches d'articles.
ALTER TABLE public.categorie_documents ADD COLUMN IF NOT EXISTS mention text
  CHECK (mention IN ('fournisseur', 'isofloor'));
