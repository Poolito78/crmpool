-- Taille d'affichage/impression d'une image collée dans une ligne (S / M / L)
ALTER TABLE devis_pieces_jointes ADD COLUMN IF NOT EXISTS image_taille text;
