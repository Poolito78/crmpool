-- Grille MESSAGERIE d'un fournisseur (colis), distincte de la grille
-- d'affrètement à la palette : un prix par zone et par tranche de poids,
-- et une table département → zone (tarif QRM 2026), lue par l'analyse de
-- document (`grilleMessagerie.ts`). Format :
-- { titre, depart, validite, conditions[], source, dateImport,
--   tranches: [{ min, max }], zones: [{ zone, prix[] }],
--   departements: { "01": "07", … }, supplementParEnvoi }
ALTER TABLE fournisseurs ADD COLUMN IF NOT EXISTS grille_messagerie jsonb;
