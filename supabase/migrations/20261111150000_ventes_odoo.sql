-- Ventes Odoo : copie EN LECTURE SEULE des lignes de commandes et de factures
-- lues dans Odoo (11/11/2026). Premier usage : le Flooring 2026 (catégories
-- « ISOMARK / FLOORING… »), tous commerciaux, pour l'analyse croisée.
--
-- ⚠️ CE NE SONT PAS DES DOCUMENTS MONCRM. Rien ici n'entre dans
-- commandes_client ni factures_client : une facture insérée là redevient un
-- brouillon à « émettre » (trigger figer_facture_client), donc une seconde
-- facture légale pour une vente déjà facturée par Odoo. Cette table ne sert
-- qu'à l'analyse ; elle se remplace à chaque import (année + périmètre).
--
-- Une ligne = une ligne d'article Odoo (account.move.line ou
-- sale.order.line). Un avoir porte total_ht et quantite NÉGATIFS.

create table if not exists public.ventes_odoo (
  id                uuid primary key default gen_random_uuid(),
  source            text not null check (source in ('facture', 'commande')),
  perimetre         text not null default 'flooring',
  odoo_ligne_id     integer not null,
  odoo_document_id  integer not null,
  numero            text not null default '',
  type_document     text not null default 'facture' check (type_document in ('facture', 'avoir', 'commande')),
  date              date,
  statut            text,
  partenaire_odoo_id integer,
  partenaire_nom    text,
  -- Texte et non clé étrangère : une fiche client supprimée ne doit pas
  -- faire tomber l'import.
  client_id         text,
  commercial        text,
  reference         text,
  designation       text,
  categorie         text,
  quantite          numeric not null default 0,
  total_ht          numeric not null default 0,
  reference_affaire text,
  importe_le        timestamptz not null default now(),
  unique (source, odoo_ligne_id)
);

create index if not exists idx_ventes_odoo_date on public.ventes_odoo (date);
create index if not exists idx_ventes_odoo_client on public.ventes_odoo (client_id);

alter table public.ventes_odoo enable row level security;

drop policy if exists ventes_odoo_lecture on public.ventes_odoo;
create policy ventes_odoo_lecture on public.ventes_odoo
  for select to authenticated using (true);

drop policy if exists ventes_odoo_ecriture on public.ventes_odoo;
create policy ventes_odoo_ecriture on public.ventes_odoo
  for all to authenticated using (true) with check (true);

comment on table public.ventes_odoo is
  'Copie en lecture seule des lignes de commandes / factures Odoo (analyse croisée). Jamais des documents MonCRM.';
