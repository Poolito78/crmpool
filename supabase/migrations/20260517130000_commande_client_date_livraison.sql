-- Ajoute date_livraison (livraison effective) sur commandes_client
ALTER TABLE public.commandes_client
  ADD COLUMN IF NOT EXISTS date_livraison TEXT DEFAULT NULL;
