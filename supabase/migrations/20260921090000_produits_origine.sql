-- D'où vient un article : importé d'Odoo, ou créé dans MonCRM.
--
-- Jusqu'ici l'origine se DÉDUISAIT de reference_odoo. Deux cas la trompaient :
--  - une fiche Odoo dupliquée dans le CRM gardait la référence Odoo de
--    l'original, et passait pour un article Odoo ;
--  - un article créé dans le CRM puis rattaché à Odoo (« Retenir … » sur
--    l'écran du devis) devenait « Odoo » alors qu'il est né ici.
-- L'origine est donc stockée, et se modifie depuis l'onglet Infos de la fiche.

ALTER TABLE produits ADD COLUMN IF NOT EXISTS origine text;

UPDATE produits
SET origine = CASE WHEN reference_odoo IS NOT NULL AND btrim(reference_odoo) <> '' THEN 'odoo' ELSE 'crm' END
WHERE origine IS NULL;

ALTER TABLE produits ALTER COLUMN origine SET DEFAULT 'crm';

DO $$ BEGIN
  ALTER TABLE produits ADD CONSTRAINT produits_origine_check CHECK (origine IN ('odoo', 'crm'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
