-- Memoire de l'analyseur : qui emet le document (15/10/2026).
--
-- Une signature de l'emetteur (SIREN, domaine de son site ou de ses
-- adresses) -> le SENS du document (il nous vend : fournisseur ; il nous
-- achete : client), le fournisseur MonCRM retenu et son nom. Corriger une
-- fois « devis client » en « devis fournisseur » suffit : le document suivant
-- du meme emetteur est remis a l'endroit. Voir src/lib/memoireDocuments.ts.
--
-- conflit : la signature a ete vue pour deux sens ou deux fournisseurs (le
-- n° de TVA d'ISOSIGN dans le bloc client d'un fournisseur, par exemple).
-- Elle n'est plus rappelee.

create table if not exists public.memoire_documents (
  cle            text primary key check (length(btrim(cle)) > 0),
  sens           text not null check (sens in ('fournisseur', 'client')),
  type_document  text,
  nom            text,
  -- Texte et non cle etrangere : un fournisseur supprime ne doit pas
  -- empecher de se souvenir du sens.
  fournisseur_id text,
  nb             integer not null default 1,
  conflit        boolean not null default false,
  cree_par       uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.memoire_documents enable row level security;

drop policy if exists memoire_documents_lecture on public.memoire_documents;
create policy memoire_documents_lecture on public.memoire_documents
  for select to authenticated using (true);

drop policy if exists memoire_documents_ecriture on public.memoire_documents;
create policy memoire_documents_ecriture on public.memoire_documents
  for all to authenticated using (true) with check (true);

comment on table public.memoire_documents is
  'Memoire de l''analyseur : signature de l''emetteur (SIREN, domaine) -> sens du document et fournisseur retenu.';
