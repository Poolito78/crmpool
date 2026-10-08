-- Port fournisseur par tranche de poids : [{ "poidsMin": 100, "coutTransport": 38.11 }, …]
ALTER TABLE public.fournisseurs
  ADD COLUMN IF NOT EXISTS paliers_port_poids jsonb;
