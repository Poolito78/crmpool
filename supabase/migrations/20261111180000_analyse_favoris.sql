-- Favoris de l'analyse croisée (11/11/2026), comme les « Favoris » d'Odoo :
-- une recherche enregistrée — source, regroupements de lignes et de
-- colonnes, mesures, filtres — rappelée d'un clic. Un favori appartient à
-- son utilisateur et à un écran (`ecran` = Devis, Commandes, Factures,
-- tableau de bord, fiche client).

create table if not exists public.analyse_favoris (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  ecran      text not null,
  nom        text not null check (length(btrim(nom)) > 0),
  reglage    jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_analyse_favoris_user on public.analyse_favoris (user_id, ecran);

alter table public.analyse_favoris enable row level security;

drop policy if exists analyse_favoris_proprietaire on public.analyse_favoris;
create policy analyse_favoris_proprietaire on public.analyse_favoris
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
