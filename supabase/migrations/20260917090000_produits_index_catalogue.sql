-- Page Produits : « Lecture en base impossible (canceling statement due to
-- statement timeout) ».
--
-- La page de 50 lignes se lit en 14 ms ; c'est le COMPTE qui l'accompagnait
-- qui tombait : count(*) sur les modeles parcourait toute la table, 6 s a
-- froid. Le front separe desormais la page du compte (useCatalogueServeur) ;
-- ces deux index rendent le compte et la recherche rapides eux aussi.

-- Vue « modeles » (7 844 lignes sur 22 724) : compte et tri par reference sur
-- un index partiel, sans relire la table.
create index if not exists idx_produits_modeles_reference
  on public.produits (reference, id)
  where est_modele;

-- La recherche porte aussi sur la designation Odoo de la declinaison, seule
-- colonne cherchee qui n'avait pas d'index trigramme : chaque recherche
-- parcourait donc la table entiere.
create index if not exists idx_produits_description_variante_trgm
  on public.produits using gin (description_variante gin_trgm_ops);
