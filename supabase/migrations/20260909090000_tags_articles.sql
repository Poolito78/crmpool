-- Tags d'articles : le mot du CLIENT, a cote de la designation du catalogue.
--
-- LE PROBLEME. Le client ne demande pas ce qui est ecrit dans le catalogue.
-- Il ecrit « cycliste » ; l'article s'appelle « Homme a velo ». Aucune
-- recherche ne les rapproche : ni la reference, ni la description, ni la
-- categorie ne contiennent le mot tape. Le commercial retrouve l'article de
-- tete, le pose sur la ligne de devis — et le CRM oublie aussitot ce qu'il
-- vient d'apprendre. Le devis suivant repart de zero, chez lui comme chez le
-- collegue d'a cote.
--
-- CE QU'ON RETIENT, C'EST LE MOT, PAS LA LIGNE DE DEVIS. Un tag n'appartient
-- ni au devis ni au client : c'est un synonyme du catalogue, vrai pour tout le
-- monde des qu'il a ete constate une fois. D'ou une table commune, en lecture
-- et ecriture pour tous les authentifies, comme `systemes` ou
-- `categorie_documents`.
--
-- UNE TABLE, ET NON UNE COLONNE `tags text[]` SUR `produits`. La raison est
-- l'ecriture, pas la lecture. Retenir un tag se fait depuis l'ECRAN DEVIS,
-- avec en memoire un article charge parfois plusieurs heures plus tot ;
-- l'application ecrit les articles par ligne entiere (`produitToDb`), donc
-- ajouter un tag par ce chemin reecrirait les quarante colonnes de l'article
-- — prix d'achat et `prix_achat_maj` compris. Un tag appris ecraserait un
-- prix corrige entre-temps par quelqu'un d'autre, sans que personne ne le
-- voie. Une ligne dediee n'ecrit que le tag.
--
-- Elle porte en plus ce qu'une colonne tableau ne saurait pas dire : d'ou
-- vient le tag (saisi a la main sur la fiche, ou appris a la volee) et quand.
-- Sans cela, impossible de faire le menage plus tard sur ce que le CRM a
-- appris tout seul sans toucher a ce qui a ete saisi volontairement.

create table if not exists public.produit_tags (
  id         uuid primary key default gen_random_uuid(),
  produit_id uuid not null references public.produits(id) on delete cascade,
  -- Toujours stocke en minuscules, espaces resserres : c'est la forme
  -- comparee par la recherche. La casse tapee par le client n'apprend rien.
  tag        text not null check (length(btrim(tag)) > 0),
  -- 'manuel' = saisi sur la fiche article ; 'appris' = retenu par le CRM
  -- apres un choix d'article en saisie de devis.
  origine    text not null default 'manuel' check (origine in ('manuel', 'appris')),
  cree_par   uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- Le meme mot deux fois sur le meme article n'apprend rien, et l'apprentissage
-- automatique repasserait par la a chaque devis : la contrainte rend
-- l'insertion idempotente (`on conflict do nothing`) au lieu d'obliger chaque
-- appelant a verifier avant d'ecrire.
create unique index if not exists idx_produit_tags_unique
  on public.produit_tags(produit_id, tag);

create index if not exists idx_produit_tags_produit
  on public.produit_tags(produit_id);

-- Recherche « quel article veut dire ce mot ? ». Comme pour le catalogue, un
-- index classique n'aiderait que sur un prefixe : pg_trgm rend indexable la
-- recherche au milieu du mot. L'extension est deja installee par la migration
-- 20260809210000.
create extension if not exists pg_trgm;
create index if not exists idx_produit_tags_tag_trgm
  on public.produit_tags using gin (tag gin_trgm_ops);

alter table public.produit_tags enable row level security;

drop policy if exists produit_tags_lecture on public.produit_tags;
create policy produit_tags_lecture on public.produit_tags
  for select to authenticated using (true);

drop policy if exists produit_tags_ecriture on public.produit_tags;
create policy produit_tags_ecriture on public.produit_tags
  for all to authenticated using (true) with check (true);

comment on table public.produit_tags is
  'Synonymes clients d''un article : les mots par lesquels on le demande, jamais affiches dans un devis, utilises pour la recherche produit.';
