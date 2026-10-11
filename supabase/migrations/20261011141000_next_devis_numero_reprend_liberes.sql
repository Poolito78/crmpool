-- Le numéro d'un devis est attribué CÔTÉ SERVEUR (`trg_set_devis_numero`,
-- migration 20260615100000) : le numéro proposé par l'application est écrasé.
-- C'est donc ici que se joue la reprise des numéros libérés
-- (`devis_numeros_liberes`, migration 20261011140000) — la changer dans
-- l'application seule n'aurait rien changé.
--
-- Ordre : le plus petit numéro libéré de l'année courante, encore libre, puis
-- seulement le compteur. `for update skip locked` : deux créations simultanées
-- ne reçoivent pas le même numéro libéré. Le compteur n'est pas touché quand
-- un numéro libéré est repris — il reste le plus grand jamais attribué.

create or replace function public.next_devis_numero()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  a int := extract(year from now())::int;
  n int;
  libre text;
begin
  select l.numero into libre
  from public.devis_numeros_liberes l
  where l.numero ~ ('^DEV-' || a || '-[0-9]+$')
    and not exists (select 1 from public.devis d where d.numero = l.numero)
  order by substring(l.numero from '([0-9]+)$')::int
  limit 1
  for update skip locked;

  if libre is not null then
    delete from public.devis_numeros_liberes where numero = libre;
    return libre;
  end if;

  insert into public.devis_numero_counter(annee, dernier) values (a, 1)
  on conflict (annee) do update set dernier = public.devis_numero_counter.dernier + 1
  returning dernier into n;
  return 'DEV-' || a || '-' || lpad(n::text, 3, '0');
end;
$$;
