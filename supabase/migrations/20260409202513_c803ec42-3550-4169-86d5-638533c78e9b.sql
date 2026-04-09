ALTER TABLE public.fournisseurs ADD COLUMN delai_reglement integer NOT NULL DEFAULT 30;
ALTER TABLE public.fournisseurs ADD COLUMN encours_max numeric NOT NULL DEFAULT 0;