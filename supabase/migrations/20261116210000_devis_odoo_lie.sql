-- Le devis Odoo créé depuis un devis du CRM ({ numero: 'AF042095', id, montantHT, le }) :
-- le mail au client cite les deux numéros et joint le PDF d'Odoo.
ALTER TABLE devis ADD COLUMN IF NOT EXISTS odoo_devis jsonb;
