-- Documents attaches a une CATEGORIE d'articles, et non a un article.
--
-- LE PROBLEME : les 29 prefabriques thermoplastiques partagent la meme fiche
-- produit, le meme masque d'homologation, les memes photos de pose. Ces
-- documents se renseignaient article par article — donc jamais, parce que
-- personne ne recopie une adresse SharePoint vingt-neuf fois, et parce qu'un
-- changement de fiche obligerait a repasser sur les vingt-neuf.
--
-- LA CATEGORIE EST UN CHEMIN, ET C'EST CE QUI PORTE L'HERITAGE.
-- `produits.categorie` est un texte de la forme « ISOMARK / H2 / PREFA
-- THERMO ». Un document pose sur « ISOMARK / H2 » s'affiche donc aussi sur
-- les articles de « ISOMARK / H2 / PREFA THERMO ». Sans cet heritage la
-- fonction serait inutilisable ici : 29 articles thermoplastiques sont ranges
-- dans « ISOMARK / H2 », et 2 seulement dans « ISOMARK / H2 / PREFA THERMO ».
-- Le calcul se fait cote application (`categorieDocuments.ts`), pas ici : la
-- table ne retient que la categorie EXACTE sur laquelle on a attache.
--
-- PAS DE TABLE DES CATEGORIES, et c'est deliberе : il n'en existe pas dans ce
-- schema, la categorie n'est qu'un texte libre sur l'article. Une cle
-- etrangere obligerait a inventer ce referentiel et a le tenir a jour ; un
-- texte se contente de suivre. Le prix a payer est qu'une categorie renommee
-- laisse ses documents derriere elle — visible immediatement (le bloc se vide),
-- et rattrapable en reattachant.
--
-- QUE DES LIENS, AUCUN FICHIER. Le forfait Supabase est le gratuit : 1 Go de
-- stockage, dont ~103 Mo deja pris. Un PDF d'homologation pese 2 a 5 Mo et ne
-- se compresse pas comme une photo. Ces documents vivent donc la ou ils sont
-- deja publies (SharePoint, site fournisseur) et on n'en garde que l'adresse.

create table if not exists public.categorie_documents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  -- La categorie EXACTE d'attache, telle qu'elle est ecrite sur les articles.
  categorie  text not null,
  -- Ce que le lecteur voit : « Masque d'homologation B14 », pas l'URL.
  libelle    text not null,
  url        text not null,
  -- Sert l'icone et le regroupement a l'ecran, rien d'autre.
  genre      text not null default 'autre'
             check (genre in ('fiche', 'homologation', 'photo', 'autre')),
  ordre      integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_categorie_documents_categorie
  on public.categorie_documents(categorie, ordre);

alter table public.categorie_documents enable row level security;

-- Un document de categorie engage la societe, pas un commercial : meme regle
-- que `systemes` et `devis_fournisseur`, tous les authentifies lisent et
-- ecrivent.
drop policy if exists categorie_documents_lecture on public.categorie_documents;
create policy categorie_documents_lecture on public.categorie_documents
  for select to authenticated using (true);
drop policy if exists categorie_documents_ecriture on public.categorie_documents;
create policy categorie_documents_ecriture on public.categorie_documents
  for all to authenticated using (true) with check (true);
