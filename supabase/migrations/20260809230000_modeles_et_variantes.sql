-- Modèles et variantes, comme dans Odoo. Déjà appliquée en production
-- le 9 août 2026 ; conservée ici pour pouvoir reconstruire la base.
--
-- L'import a versé 22 507 articles à plat : J11C2, J11C2DOUILLE80,
-- J11C2SANSDOUILLE et J11C2DROUGE y figuraient au même rang que le reste,
-- alors qu'Odoo n'en propose qu'un — le modèle « J11 » — et ne montre les
-- déclinaisons qu'une fois celui-ci choisi.
--
-- L'information était déjà là sans le savoir : à l'import, chaque variante a
-- reçu le NOM DE SON MODÈLE comme désignation. Les articles qui partagent une
-- même désignation sont donc les déclinaisons d'un même modèle.

alter table public.produits
  add column if not exists modele_cle   text,
  add column if not exists est_modele   boolean not null default true,
  add column if not exists nb_variantes integer not null default 1;

update public.produits
   set modele_cle = nullif(btrim(description), '')
 where reference_odoo is not null;

-- Représentant du modèle : la référence la plus courte — J11C2 plutôt que
-- J11C2SANSDOUILLE —, départagée par ordre alphabétique pour être stable.
with rang as (
  select id,
         row_number() over (partition by modele_cle order by length(reference), reference) as n
  from public.produits
  where reference_odoo is not null and modele_cle is not null
)
update public.produits p set est_modele = (rang.n = 1)
  from rang where rang.id = p.id;

-- Compté une fois et rangé sur la ligne : PostgREST ne sait pas agréger, il
-- aurait fallu une requête par ligne affichée.
with compte as (
  select modele_cle, count(*) as n from public.produits
  where modele_cle is not null group by modele_cle
)
update public.produits p set nb_variantes = compte.n
  from compte where compte.modele_cle = p.modele_cle;

create index if not exists idx_produits_modele_cle on public.produits (modele_cle);
create index if not exists idx_produits_est_modele on public.produits (est_modele);

analyze public.produits;
