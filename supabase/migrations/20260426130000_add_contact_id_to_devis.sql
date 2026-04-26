-- Add contact_id column to devis table
ALTER TABLE devis ADD COLUMN IF NOT EXISTS contact_id text;
