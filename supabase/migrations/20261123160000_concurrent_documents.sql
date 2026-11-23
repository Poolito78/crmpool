-- Documents d'un concurrent (tarifs, devis rapportés par un client), classés
-- sur sa fiche depuis l'analyse de document.
--
-- Base PARTAGÉE comme le reste de la veille (concurrents, concurrent_produits,
-- concurrent_notes) : tout utilisateur connecté lit et classe. Le fichier vit
-- dans le bucket PRIVÉ `concurrents-docs` (un tarif concurrent n'a rien à
-- faire en accès public) et s'ouvre par lien signé.

create table if not exists public.concurrent_documents (
  id uuid primary key default gen_random_uuid(),
  concurrent_id uuid not null references public.concurrents(id) on delete cascade,
  nom text not null,
  chemin text not null,
  taille bigint,
  type_mime text,
  -- libellé : « Devis / tarif concurrent », numéro ; client_nom : où il a été trouvé
  libelle text,
  client_nom text,
  date_document date,
  created_by uuid default auth.uid(),
  created_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_concurrent_documents_concurrent
  on public.concurrent_documents (concurrent_id, created_at desc);

alter table public.concurrent_documents enable row level security;

drop policy if exists concurrent_documents_all_auth on public.concurrent_documents;
create policy concurrent_documents_all_auth on public.concurrent_documents
  for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit)
values ('concurrents-docs', 'concurrents-docs', false, 52428800)
on conflict (id) do nothing;

drop policy if exists concurrents_docs_lecture on storage.objects;
create policy concurrents_docs_lecture on storage.objects
  for select to authenticated using (bucket_id = 'concurrents-docs');

drop policy if exists concurrents_docs_depot on storage.objects;
create policy concurrents_docs_depot on storage.objects
  for insert to authenticated with check (bucket_id = 'concurrents-docs');

drop policy if exists concurrents_docs_suppression on storage.objects;
create policy concurrents_docs_suppression on storage.objects
  for delete to authenticated using (bucket_id = 'concurrents-docs');
