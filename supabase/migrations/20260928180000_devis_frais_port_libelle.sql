-- Le mode d'expédition Odoo des frais de port d'un devis — « FRAIS DE PORT
-- SH DE 26 A 100KG ». L'envoi vers Odoo (odoo-devis) y retrouve l'article de
-- port du même nom (PORTSH100) au lieu du « FRAIS DE PORT » générique.
-- NULL = port générique.
alter table public.devis add column if not exists frais_port_libelle text;
