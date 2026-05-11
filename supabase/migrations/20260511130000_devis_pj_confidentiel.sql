-- Ajout colonne confidentiel sur devis_pieces_jointes
ALTER TABLE public.devis_pieces_jointes
  ADD COLUMN IF NOT EXISTS confidentiel BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS devis_pj_confidentiel_idx
  ON public.devis_pieces_jointes (devis_id, confidentiel);
