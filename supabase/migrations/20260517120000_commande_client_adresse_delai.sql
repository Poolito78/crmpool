-- Ajoute adresse_livraison_id et delai_reglement sur commandes_client
ALTER TABLE public.commandes_client
  ADD COLUMN IF NOT EXISTS adresse_livraison_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delai_reglement       TEXT DEFAULT NULL;
