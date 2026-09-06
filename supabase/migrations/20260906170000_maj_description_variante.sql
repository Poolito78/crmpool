-- Écriture en bloc des désignations Odoo.
--
-- 22 700 articles, un PATCH par ligne : la fonction Edge y passerait des
-- heures et Odoo aurait le temps de bouger entre-temps. On envoie donc la
-- page entière en un seul appel, et Postgres fait la jointure.
--
-- `is distinct from` : on ne réécrit pas une ligne déjà juste, pour que le
-- compte rendu (« écrits ») dise ce qui a VRAIMENT changé.
create or replace function public.maj_description_variante(lignes jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with entrantes as (
    select reference, designation
    from jsonb_to_recordset(lignes) as x(reference text, designation text)
  ), majees as (
    update public.produits p
       set description_variante = e.designation
      from entrantes e
     where p.reference = e.reference
       and coalesce(p.description_variante, '') is distinct from coalesce(e.designation, '')
    returning 1
  )
  select count(*) into n from majees;
  return n;
end;
$$;

revoke all on function public.maj_description_variante(jsonb) from public, anon, authenticated;
