-- Add archive fields to devis table
ALTER TABLE devis ADD COLUMN IF NOT EXISTS archive_date text;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS archive_raison text;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS archive_commentaire text;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS archive_concurrents jsonb;
