-- Désignation de la DÉCLINAISON, telle qu'Odoo la vend.
--
-- `produits.description` porte la désignation du MODÈLE : elle vaut « IS KC1 »
-- pour les douze déclinaisons de KC1, et ne dit donc pas laquelle on vend.
-- Odoo, lui, nomme chacune : « KC1 800 600 C1 BRUT (MARCO POLO) ». C'est cette
-- ligne-là qu'on affiche et qu'on cherche quand elle existe.
--
-- Nullable et sans valeur par défaut : les articles hors catalogue Odoo n'en
-- ont pas, et `designationProduit()` retombe alors sur `description`.
alter table public.produits
  add column if not exists description_variante text;

comment on column public.produits.description_variante is
  'Designation de la declinaison chez Odoo (Variant Sale Description). Null hors catalogue Odoo : retomber sur description.';
