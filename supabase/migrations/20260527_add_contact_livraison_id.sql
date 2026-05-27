-- Ajout du contact de livraison sur les devis
ALTER TABLE devis ADD COLUMN IF NOT EXISTS contact_livraison_id text;
