-- Grille d'affrètement d'un fournisseur : un prix HT par département de
-- livraison et par nombre de palettes (tarif QRM 2026), lue par l'analyse de
-- document (`grilleAffretement.ts`). Format :
-- { titre, depart, validite, conditions[], source, dateImport,
--   tarifs: [{ dept, nom, service, paliers: [{ palettes, prix }] }] }
ALTER TABLE fournisseurs ADD COLUMN IF NOT EXISTS grille_affretement jsonb;
