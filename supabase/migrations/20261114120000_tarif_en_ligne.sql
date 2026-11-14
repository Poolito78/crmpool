-- Tarif en ligne ISOFLOOR (/tarif) : chaque client coché « Accès à son tarif »
-- consulte ses propres prix et les télécharge en PDF.
--
-- ⚠️ Les identifiants ne sont PAS des comptes Supabase : `produits` et
-- `fournisseurs` sont lisibles et modifiables par tout compte authentifié
-- (policy « shared read write »). Un client du tarif n'a donc qu'un mot de
-- passe propre à `tarif_acces`, vérifié par la fonction `tarif-catalogue`,
-- qui seule lit la base (service role) et ne renvoie que des prix de vente.

alter table clients add column if not exists acces_tarif boolean not null default false;

create table if not exists tarif_acces (
  client_id          uuid primary key references clients(id) on delete cascade,
  identifiant        text not null unique,          -- e-mail en minuscules
  mdp_hash           text not null,                 -- pbkdf2$<itérations>$<sel b64>$<hash b64>
  cree_le            timestamptz not null default now(),
  derniere_connexion timestamptz
);
alter table tarif_acces enable row level security;
-- Lecture admin seulement ; aucune écriture hors service role (fonction).
drop policy if exists "admin lit tarif_acces" on tarif_acces;
create policy "admin lit tarif_acces" on tarif_acces
  for select to authenticated using (get_my_veille_role() = 'admin');

create table if not exists tarif_demandes (
  id          uuid primary key default gen_random_uuid(),
  entreprise  text not null,
  nom         text not null,
  email       text not null,
  telephone   text,
  siret       text,
  ville       text,
  message     text,
  statut      text not null default 'nouvelle' check (statut in ('nouvelle', 'acceptee', 'refusee')),
  client_id   uuid references clients(id) on delete set null,
  cree_le     timestamptz not null default now(),
  traitee_le  timestamptz
);
alter table tarif_demandes enable row level security;
-- Le formulaire public passe par la fonction (service role) : aucun accès anon.
drop policy if exists "admin gere tarif_demandes" on tarif_demandes;
create policy "admin gere tarif_demandes" on tarif_demandes
  for all to authenticated
  using (get_my_veille_role() = 'admin')
  with check (get_my_veille_role() = 'admin');
