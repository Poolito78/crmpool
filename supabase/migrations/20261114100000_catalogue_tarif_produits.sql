-- Colonne : présent dans le catalogue tarif ISOFLOOR
-- Permet de marquer depuis la fiche produit CRM les articles à inclure
-- dans le catalogue 2026 (catalogue_2026_preview.html).
ALTER TABLE produits ADD COLUMN IF NOT EXISTS catalogue_tarif boolean DEFAULT false;
