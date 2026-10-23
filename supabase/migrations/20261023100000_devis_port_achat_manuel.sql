-- Coût du port saisi à la main (23 oct. 2026)
--
-- `port_achat_manuel` : le coût d'achat du transport que l'utilisateur a corrigé
--                       dans le récap du devis ou dans l'onglet Comparatif.
--                       NULL = coût calculé (barème du transporteur, ou tarif
--                       standard refacturé au coûtant). Un devis rouvert garde
--                       ainsi sa marge de port au lieu de la recalculer.

ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS port_achat_manuel numeric;
