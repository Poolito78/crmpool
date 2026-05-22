-- Ajoute ligne_id optionnel sur devis_pieces_jointes
-- Permet d'associer une image à une ligne spécifique du devis
ALTER TABLE public.devis_pieces_jointes
  ADD COLUMN IF NOT EXISTS ligne_id text;
