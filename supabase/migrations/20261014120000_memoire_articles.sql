-- Memoire de l'analyseur et retours des devis realises (14/10/2026).
--
-- memoire_articles : la DEMANDE entiere du client -> l'article retenu. Une
-- correction faite a la main dans l'analyse de document (ou relevee en
-- comparant le devis reellement envoye au chiffrage du CRM) se rappelle a la
-- demande suivante identique. Voir src/lib/memoireArticles.ts.
--
-- ecarts_devis : le releve des ecarts entre un devis realise (importe) et le
-- devis du CRM, garde pour corriger le CRM. Voir src/lib/comparaisonDevis.ts.

create table if not exists public.memoire_articles (
  id          uuid primary key default gen_random_uuid(),
  -- cleDemande(demande) : mots sans accents ni liaisons, tries. Unique : une
  -- demande ne retient qu'un article, le dernier choisi.
  cle         text not null unique check (length(btrim(cle)) > 0),
  demande     text not null,
  -- Null quand l'article n'existe que chez Odoo : la reference suffit alors.
  produit_id  uuid references public.produits(id) on delete set null,
  reference   text not null,
  designation text,
  origine     text not null default 'choix' check (origine in ('choix', 'devis_realise')),
  nb          integer not null default 1,
  cree_par    uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.memoire_articles enable row level security;

drop policy if exists memoire_articles_lecture on public.memoire_articles;
create policy memoire_articles_lecture on public.memoire_articles
  for select to authenticated using (true);

drop policy if exists memoire_articles_ecriture on public.memoire_articles;
create policy memoire_articles_ecriture on public.memoire_articles
  for all to authenticated using (true) with check (true);

comment on table public.memoire_articles is
  'Memoire de l''analyseur : demande client (cle normalisee) -> article retenu a la main ou d''apres un devis realise.';

create table if not exists public.ecarts_devis (
  id             uuid primary key default gen_random_uuid(),
  devis_id       text,
  devis_numero   text,
  -- Numero du devis realise importe (AF0xxxxx chez Odoo).
  numero_realise text,
  -- [{ type, realise, crm, detail }] : voir EcartDevis dans comparaisonDevis.ts.
  ecarts         jsonb not null default '[]'::jsonb,
  resume         text,
  cree_par       uuid default auth.uid(),
  created_at     timestamptz not null default now()
);

create index if not exists idx_ecarts_devis_devis on public.ecarts_devis(devis_id);

alter table public.ecarts_devis enable row level security;

drop policy if exists ecarts_devis_lecture on public.ecarts_devis;
create policy ecarts_devis_lecture on public.ecarts_devis
  for select to authenticated using (true);

drop policy if exists ecarts_devis_ecriture on public.ecarts_devis;
create policy ecarts_devis_ecriture on public.ecarts_devis
  for all to authenticated using (true) with check (true);

comment on table public.ecarts_devis is
  'Ecarts releves entre un devis realise (importe) et le chiffrage du CRM.';
