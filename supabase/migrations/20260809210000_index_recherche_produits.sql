-- Recherche du catalogue : « ILIKE %texte% » ne peut utiliser aucun index
-- classique, qui n'aide que sur un préfixe. Sur 22 634 articles, chaque frappe
-- provoquait un balayage complet de la table — 94 ms mesurées, auxquelles
-- s'ajoutaient le compte exact et l'aller-retour réseau.
--
-- pg_trgm découpe chaque texte en groupes de trois caractères et les indexe :
-- une recherche « au milieu du mot » devient alors indexable. Mesuré après
-- application : 94 ms -> 26 ms, avec un parcours d'index au lieu du balayage.
--
-- Déjà appliquée en production le 9 août 2026.
create extension if not exists pg_trgm;

create index if not exists idx_produits_reference_trgm
  on public.produits using gin (reference gin_trgm_ops);
create index if not exists idx_produits_description_trgm
  on public.produits using gin (description gin_trgm_ops);
create index if not exists idx_produits_categorie_trgm
  on public.produits using gin (categorie gin_trgm_ops);

-- Tri par défaut de la page Produits, et second critère de départage.
create index if not exists idx_produits_reference on public.produits (reference);

analyze public.produits;
