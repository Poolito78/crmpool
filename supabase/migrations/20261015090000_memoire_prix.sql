-- Prix appris d'une offre réellement envoyée (15/10/2026).
--
-- Quand l'offre Odoo comparée au chiffrage du CRM facture un article à un
-- autre prix (SFGAB168 : 35,30 € dans AF039468, 8,25 € au contrat PROMO
-- AGILIS), « Apprendre de ce devis » retient le prix pratiqué POUR CE CLIENT.
-- Le chiffrage suivant du même client le reprend, en le disant. Voir
-- src/lib/memoirePrix.ts.

create table if not exists public.memoire_prix (
  id           uuid primary key default gen_random_uuid(),
  client_id    text not null,
  reference    text not null,
  prix         numeric not null,
  -- Numéro de l'offre d'où vient le prix (AF039468).
  numero_offre text,
  cree_par     uuid default auth.uid(),
  updated_at   timestamptz not null default now(),
  unique (client_id, reference)
);

alter table public.memoire_prix enable row level security;

drop policy if exists memoire_prix_lecture on public.memoire_prix;
create policy memoire_prix_lecture on public.memoire_prix
  for select to authenticated using (true);

drop policy if exists memoire_prix_ecriture on public.memoire_prix;
create policy memoire_prix_ecriture on public.memoire_prix
  for all to authenticated using (true) with check (true);

comment on table public.memoire_prix is
  'Prix pratiqué par client et par référence, appris en comparant une offre envoyée au chiffrage du CRM.';
