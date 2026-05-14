ALTER TABLE produits ADD COLUMN IF NOT EXISTS type_kit boolean DEFAULT false;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS lignes_kit jsonb DEFAULT '[]';
