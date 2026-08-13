-- Systemes de mise en oeuvre, tels que les decrivent les fiches techniques.
--
-- Un article seul ne suffit pas a chiffrer un marquage. La peinture ALPES
-- s'applique a 440 g/m2 sous l'homologation 1 RH 1216 S1, mais a 515 g/m2 sous
-- 1 H 1215 S3 — et jamais sans billes de verre, qui ont leur propre dosage. La
-- resine Flowfast 319 se melange a une charge dans un rapport de 1 pour 1,5, se
-- catalyse selon la temperature du support, et reclame un primaire sur beton.
--
-- La colonne produits.consommation sait dire « 2,5 kg/m2 » pour un enduit
-- couleur. Elle ne sait pas dire tout ce qui precede. D'ou ces deux tables :
-- un systeme, ses composants, et pour chacun ce qui determine sa quantite.

create table if not exists public.systemes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid(),
  nom          text not null,
  famille      text,
  -- L'homologation ou la finition qui distingue deux variantes du meme produit.
  variante     text,
  usage        text,
  -- 'enrobe', 'beton', 'tous' — conditionne primaire et preparation.
  support      text not null default 'tous',
  description  text,
  -- D'ou vient la fiche : on doit pouvoir remonter a la source d'un dosage.
  source_fiche text,
  source_drive text,
  actif        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.systeme_composants (
  id           uuid primary key default gen_random_uuid(),
  systeme_id   uuid not null references public.systemes(id) on delete cascade,
  ordre        integer not null default 0,
  -- Article MonCRM quand il existe. Certains composants n'en ont pas encore.
  produit_id   uuid references public.produits(id) on delete set null,
  libelle      text not null,
  -- base, charge, billes, pigment, catalyseur, primaire, silice, quartz, durcisseur
  role         text not null default 'base',

  -- Trois facons de determiner la quantite, exclusives entre elles :
  --   consommation  kg par m2 traite            (peinture, primaire, quartz)
  --   ratio_base    multiple du composant base  (charge = 1,5 x resine)
  --   pourcentage   part du composant base      (pigment a 0,5 %)
  consommation numeric,
  ratio_base   numeric,
  pourcentage  numeric,

  -- Le catalyseur ne se dose pas au m2 mais a la temperature du support.
  -- [{"de":20,"a":30,"pourcentage":1.5}, ...]
  dosage_temperature jsonb,

  obligatoire  boolean not null default true,
  condition    text,
  phrase_source text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_systeme_composants_systeme
  on public.systeme_composants(systeme_id);

alter table public.systemes            enable row level security;
alter table public.systeme_composants  enable row level security;

-- Les systemes sont un referentiel metier commun, pas des donnees par
-- utilisateur : tout le monde lit, tout le monde ecrit. Le cloisonnement par
-- commercial n'aurait pas de sens sur un dosage de fiche technique.
drop policy if exists systemes_lecture on public.systemes;
create policy systemes_lecture on public.systemes
  for select to authenticated using (true);
drop policy if exists systemes_ecriture on public.systemes;
create policy systemes_ecriture on public.systemes
  for all to authenticated using (true) with check (true);

drop policy if exists composants_lecture on public.systeme_composants;
create policy composants_lecture on public.systeme_composants
  for select to authenticated using (true);
drop policy if exists composants_ecriture on public.systeme_composants;
create policy composants_ecriture on public.systeme_composants
  for all to authenticated using (true) with check (true);
