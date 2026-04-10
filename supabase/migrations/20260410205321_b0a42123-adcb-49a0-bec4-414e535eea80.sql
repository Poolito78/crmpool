
-- Remove encours_max from fournisseurs
ALTER TABLE public.fournisseurs DROP COLUMN IF EXISTS encours_max;

-- Add date_echeance to commandes_fournisseur
ALTER TABLE public.commandes_fournisseur ADD COLUMN IF NOT EXISTS date_echeance text DEFAULT NULL;

-- Add date_echeance to commandes_client  
ALTER TABLE public.commandes_client ADD COLUMN IF NOT EXISTS date_echeance text DEFAULT NULL;
