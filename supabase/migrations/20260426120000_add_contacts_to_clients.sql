-- Add contacts column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contacts jsonb DEFAULT '[]'::jsonb;
