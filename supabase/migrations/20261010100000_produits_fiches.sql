-- Fiches techniques PDF déposées depuis la fiche article. Seau PUBLIC : le lien
-- part dans les mails et les devis, le client doit pouvoir l'ouvrir.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produits-fiches', 'produits-fiches', true, 15728640, array['application/pdf'])
on conflict (id) do update
  set public = true, file_size_limit = 15728640, allowed_mime_types = array['application/pdf'];

drop policy if exists produits_fiches_lecture on storage.objects;
create policy produits_fiches_lecture on storage.objects
  for select using (bucket_id = 'produits-fiches');

drop policy if exists produits_fiches_depot on storage.objects;
create policy produits_fiches_depot on storage.objects
  for insert to authenticated with check (bucket_id = 'produits-fiches');

drop policy if exists produits_fiches_suppression on storage.objects;
create policy produits_fiches_suppression on storage.objects
  for delete to authenticated using (bucket_id = 'produits-fiches');
