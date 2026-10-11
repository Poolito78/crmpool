-- Le numéro d'un devis supprimé redevient disponible (règle du 11/10/2026).
--
-- Le numéro suivant était « le plus grand + 1 » : supprimer DEV-2026-137 à 141
-- laissait un trou, et le devis suivant prenait 143. Désormais chaque
-- suppression NOTE son numéro ici, et le devis suivant reprend le plus petit
-- numéro noté encore libre (`prochainNumeroDevis`, numeroDevis.ts).
--
-- ⚠️ SEULS les numéros supprimés à partir d'aujourd'hui sont repris : les 35
-- trous plus anciens (2, 10, 15…) restent des trous — combler « le plus petit
-- libre » aurait donné DEV-2026-002 à un devis d'octobre. On y ajoute 137 à
-- 141, supprimés juste avant que la règle n'existe.

create table if not exists public.devis_numeros_liberes (
  numero text primary key,
  libere_le timestamptz not null default now()
);

alter table public.devis_numeros_liberes enable row level security;
drop policy if exists "lecture authentifiee" on public.devis_numeros_liberes;
create policy "lecture authentifiee" on public.devis_numeros_liberes
  for select to authenticated using (true);

-- Suppression d'un devis : son numéro (série DEV-aaaa-nnn) est noté.
create or replace function public.devis_liberer_numero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.numero ~ '^DEV-\d{4}-\d+$' then
    insert into public.devis_numeros_liberes (numero) values (old.numero)
    on conflict (numero) do update set libere_le = now();
  end if;
  return old;
end;
$$;

drop trigger if exists trg_devis_liberer_numero on public.devis;
create trigger trg_devis_liberer_numero
  after delete on public.devis
  for each row execute function public.devis_liberer_numero();

-- Un numéro repris par un nouveau devis n'est plus libre.
create or replace function public.devis_reprendre_numero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.numero is not null then
    delete from public.devis_numeros_liberes where numero = new.numero;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_devis_reprendre_numero on public.devis;
create trigger trg_devis_reprendre_numero
  after insert or update of numero on public.devis
  for each row execute function public.devis_reprendre_numero();

-- Les cinq numéros supprimés juste avant la règle (s'ils sont toujours libres).
insert into public.devis_numeros_liberes (numero)
select n from unnest(array['DEV-2026-137','DEV-2026-138','DEV-2026-139','DEV-2026-140','DEV-2026-141']) n
where not exists (select 1 from public.devis d where d.numero = n)
on conflict do nothing;

notify pgrst, 'reload schema';
