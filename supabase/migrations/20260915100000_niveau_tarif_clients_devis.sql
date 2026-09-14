-- Niveau de tarif R0-R4 porté par la fiche client et repris (modifiable) par
-- chaque devis, plus ce qu'Odoo dit des conditions tarifaires du client.
--
-- `clients.niveau_tarif`      niveau par défaut des devis de ce client
-- `clients.liste_prix_odoo`   liste de prix Odoo (property_product_pricelist)
-- `clients.contrat_cadre_odoo` intitulé du ou des contrats-cadres rattachés
-- `clients.tarifs_odoo_maj`   date de la dernière lecture chez Odoo
-- `devis.niveau_tarif`        niveau appliqué à CE devis (null = prix catalogue)

alter table public.clients add column if not exists niveau_tarif text;
alter table public.clients add column if not exists liste_prix_odoo text;
alter table public.clients add column if not exists contrat_cadre_odoo text;
alter table public.clients add column if not exists tarifs_odoo_maj timestamptz;

alter table public.devis add column if not exists niveau_tarif text;

create index if not exists grille_contrat_niveau_idx on public.grille_contrat (niveau, id);
