-- Poids maximal chargé sur une palette pour CET article (kg), saisi sur la
-- fiche article. Il remplace, pour ses lignes, le poids par palette de la
-- grille d'affrètement du fournisseur : une commande mêlant quartz
-- (1 000 kg/palette) et seaux (600 kg/palette) additionne les fractions de
-- palette de chaque ligne (`palettesDesLignes`, store.ts). NULL = celui de
-- la fiche fournisseur.
ALTER TABLE produits ADD COLUMN IF NOT EXISTS kg_par_palette numeric;
