-- Numérotation atomique des devis (évite les doublons entre commerciaux : avec
-- la RLS « own/admin », chaque utilisateur ne voyait que ses devis et calculait
-- DEV-AAAA-NNN à partir de SA liste → collisions). Le numéro est désormais
-- attribué côté serveur, de façon globale et atomique.

-- 1) Compteur par année
create table if not exists public.devis_numero_counter (
  annee int primary key,
  dernier int not null default 0
);
alter table public.devis_numero_counter enable row level security;
-- Pas de policy : seules les fonctions security definer y accèdent.

-- 2) Fonction atomique qui renvoie le prochain numéro DEV-AAAA-NNN
create or replace function public.next_devis_numero()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  a int := extract(year from now())::int;
  n int;
begin
  insert into public.devis_numero_counter(annee, dernier) values (a, 1)
  on conflict (annee) do update set dernier = public.devis_numero_counter.dernier + 1
  returning dernier into n;
  return 'DEV-' || a || '-' || lpad(n::text, 3, '0');
end;
$$;

-- 3) Trigger : attribue le numéro à l'insertion d'un devis.
--    Override les numéros auto (DEV-AAAA-NNN) ou vides ; préserve un numéro custom.
create or replace function public.set_devis_numero()
returns trigger
language plpgsql
as $$
begin
  if new.numero is null or new.numero ~ '^DEV-[0-9]{4}-[0-9]+$' then
    new.numero := public.next_devis_numero();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_devis_numero on public.devis;
create trigger trg_set_devis_numero
  before insert on public.devis
  for each row execute function public.set_devis_numero();

-- 4) Amorçage du compteur depuis le plus grand numéro existant de l'année courante
insert into public.devis_numero_counter(annee, dernier)
select extract(year from now())::int,
       coalesce(max((substring(numero from '([0-9]+)$'))::int), 0)
from public.devis
where numero like 'DEV-' || extract(year from now())::int || '-%'
on conflict (annee) do update
  set dernier = greatest(public.devis_numero_counter.dernier, excluded.dernier);
