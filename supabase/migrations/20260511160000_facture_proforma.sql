-- Ajout du flag proforma sur les factures client
ALTER TABLE public.factures_client
  ADD COLUMN IF NOT EXISTS est_proforma BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS factures_client_proforma_idx
  ON public.factures_client (est_proforma);
