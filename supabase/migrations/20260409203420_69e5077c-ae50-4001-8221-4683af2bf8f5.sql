ALTER TABLE public.fournisseurs ALTER COLUMN delai_reglement TYPE text USING delai_reglement::text;
ALTER TABLE public.fournisseurs ALTER COLUMN delai_reglement SET DEFAULT '45j FDM';