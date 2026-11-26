-- Conso d'un article dosée en % du poids d'autres articles du devis
-- (pigment à 10 % de la résine FLOWFAST 319) : { "pct": 10, "produits": ["<id>", …] }.
-- Recopiée sur la ligne de devis quand l'article y est choisi (consoRelative.ts).
ALTER TABLE produits ADD COLUMN IF NOT EXISTS conso_relative jsonb;
