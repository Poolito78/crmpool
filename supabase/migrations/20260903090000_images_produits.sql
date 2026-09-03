-- Images des fiches produit.
--
-- Un article se reconnait a sa photo bien avant sa reference. Le catalogue
-- n'en portait aucune : seules les OPTIONS de variante avaient un `imageUrl`,
-- pour les nuanciers RAL et les textures de quartz.
--
-- Deux provenances, une seule table. L'image DEPOSEE est compressee puis
-- rangee dans le seau `produits-images` ; `chemin` retient ou, pour pouvoir
-- la supprimer du stockage le jour ou la fiche disparait. L'image EXTERNE —
-- celle qui vit deja sur le site du fournisseur — n'a que son adresse, et
-- `chemin` reste nul : rien a supprimer, rien qui pese sur le quota.
--
-- `ordre` designe la principale : la premiere, celle qui sert de vignette.
-- Pas de colonne « est_principale » qu'il faudrait tenir a jour a deux
-- endroits et qui finirait par en designer deux, ou aucune.

create table if not exists public.produit_images (
  id         uuid primary key default gen_random_uuid(),
  produit_id uuid not null references public.produits(id) on delete cascade,
  user_id    uuid not null default auth.uid(),
  -- Adresse publique, deposee ou externe : c'est elle qu'affiche l'ecran.
  url        text not null,
  -- Chemin dans le seau. Nul pour une image externe.
  chemin     text,
  nom        text,
  octets     integer,
  largeur    integer,
  hauteur    integer,
  -- 0 = la principale.
  ordre      integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_produit_images_produit
  on public.produit_images(produit_id, ordre);

alter table public.produit_images enable row level security;

-- Le catalogue est commun a toute la societe : ses photos le sont aussi.
drop policy if exists produit_images_lecture on public.produit_images;
create policy produit_images_lecture on public.produit_images
  for select to authenticated using (true);
drop policy if exists produit_images_ecriture on public.produit_images;
create policy produit_images_ecriture on public.produit_images
  for all to authenticated using (true) with check (true);

-- Le seau est PUBLIC, a la difference de `devis-pj`.
--
-- Une photo d'article n'a rien de confidentiel, et deux raisons pratiques
-- l'emportent : le navigateur peut la mettre en cache — sur le forfait
-- gratuit, l'egress servi par le CDN dispose de ses propres 5 Go — et
-- l'adresse reste stable, sans URL signee a regenerer.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produits-images', 'produits-images', true, 5242880,
        array['image/webp','image/jpeg','image/png','image/gif','image/avif'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/webp','image/jpeg','image/png','image/gif','image/avif'];

drop policy if exists produits_images_lecture on storage.objects;
create policy produits_images_lecture on storage.objects
  for select using (bucket_id = 'produits-images');

drop policy if exists produits_images_depot on storage.objects;
create policy produits_images_depot on storage.objects
  for insert to authenticated with check (bucket_id = 'produits-images');

drop policy if exists produits_images_suppression on storage.objects;
create policy produits_images_suppression on storage.objects
  for delete to authenticated using (bucket_id = 'produits-images');
