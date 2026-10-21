-- Index des jumeaux Odoo : l'expression que cherchent les triggers.
--
-- ⚠️ « Enregistrement du produit refusé : canceling statement due to
-- statement timeout » (SNLR5, 21/10/2026). Chaque changement de prix d'un
-- article qui porte une référence Odoo déclenche `synchroniser_jumeaux_odoo`
-- (et une modification de fiche technique `synchroniser_jumeaux_fiches`),
-- qui cherchent les jumeaux par `upper(btrim(reference_odoo)) = cle`.
-- L'index `idx_produits_reference_odoo` porte la colonne BRUTE : l'expression
-- ne s'en sert pas, la base parcourait les 22 800 articles — mesuré à
-- 10,2 s, au-delà des 8 s du `statement_timeout`. Le prix saisi sur la fiche
-- était refusé, une fois sur deux selon la charge.
--
-- L'index porte exactement l'expression des triggers : la recherche devient
-- un accès par index. Aucune donnée n'est modifiée.
-- Pas d'index partiel : le planificateur ne déduirait pas sa condition de
-- `upper(btrim(reference_odoo)) = cle`, et ne s'en servirait pas.
CREATE INDEX IF NOT EXISTS idx_produits_reference_odoo_cle
  ON public.produits (upper(btrim(reference_odoo)));
