-- Catalogue gardé dans le navigateur : ne relire que ce qui a changé.
--
-- L'application relisait les 22 700 articles à chaque démarrage (23 tranches,
-- 900 ms en moyenne chacune sur l'instance Micro, jusqu'à 10 s quand le CPU
-- est bridé). Elle garde désormais le catalogue en IndexedDB et ne demande
-- que les lignes modifiées (`updated_at`) ou effacées (`produits_effaces`)
-- depuis sa dernière lecture. Voir `src/lib/cacheCatalogue.ts`.
--
-- ⚠️ Le tour de stock de nuit (`odoo-stock-sync`) réécrit `stock_odoo_maj` sur
-- CHAQUE article, même quand rien n'a bougé. Ce seul horodatage ne compte pas
-- comme une modification : sans cette exception, le premier démarrage du
-- matin relirait tout le catalogue.
--
-- ⚠️ `produits_effaces`, PAS `produits_supprimes` : ce nom-là est déjà pris
-- par la liste noire par référence (migration 20261008120000). Une première
-- version de cette migration s'y est trompée — appliquée, son trigger aurait
-- fait échouer toute suppression d'article ; elle a été retirée aussitôt.

alter table public.produits
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_produits_updated_at on public.produits (updated_at, id);

create or replace function public.produits_horodater()
returns trigger
language plpgsql
as $$
declare
  maj_stock timestamptz := new.stock_odoo_maj;
begin
  -- On compare la ligne sans les deux horodatages, puis on les rétablit.
  new.stock_odoo_maj := old.stock_odoo_maj;
  new.updated_at := old.updated_at;
  if new is distinct from old then
    new.updated_at := now();
  end if;
  new.stock_odoo_maj := maj_stock;
  return new;
end;
$$;

drop trigger if exists trg_produits_horodater on public.produits;
create trigger trg_produits_horodater
  before update on public.produits
  for each row execute function public.produits_horodater();

-- Les effacements : une ligne supprimée ne peut plus porter de date.
create table if not exists public.produits_effaces (
  id uuid primary key,
  efface_le timestamptz not null default now()
);
create index if not exists idx_produits_effaces_le on public.produits_effaces (efface_le);

alter table public.produits_effaces enable row level security;
drop policy if exists "lecture authentifiee" on public.produits_effaces;
create policy "lecture authentifiee" on public.produits_effaces
  for select to authenticated using (true);

create or replace function public.produits_noter_effacement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.produits_effaces (id) values (old.id)
  on conflict (id) do update set efface_le = now();
  return old;
end;
$$;

drop trigger if exists trg_produits_noter_effacement on public.produits;
create trigger trg_produits_noter_effacement
  after delete on public.produits
  for each row execute function public.produits_noter_effacement();

notify pgrst, 'reload schema';
