-- Jumeaux Odoo : le prix REVENDEUR et le coefficient suivent le prix public.
--
-- Le trigger du 08/10 recopiait `prix_ht` sur le jumeau sans toucher à son
-- `prix_revendeur` ni à son `coefficient`. QUARTZ0103 et QUARTZ0.1-0.3 (même
-- code Odoo QUARTZ0.1-0.3) : public remis à 32,66 € sur l'un, l'autre gardait
-- 14,93 € revendeur et un coefficient de 1,78 — et sa fiche, ouverte puis
-- enregistrée, recalculait le public depuis ce coefficient (21,33 €) et le
-- renvoyait au jumeau. DEV-2026-155 a chiffré le quartz sur ce public-là.
--
-- Le revendeur du jumeau se recalcule sur SA remise (public × (1 − remise)),
-- règle de la fiche article ; le coefficient = revendeur ÷ achat.
CREATE OR REPLACE FUNCTION public.synchroniser_jumeaux_odoo()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cle text := upper(nullif(btrim(NEW.reference_odoo), ''));
BEGIN
  IF cle IS NULL THEN RETURN NEW; END IF;

  IF NEW.prix_achat_maj IS NOT NULL AND coalesce(NEW.prix_achat, 0) > 0
     AND (TG_OP = 'INSERT' OR NEW.prix_achat IS DISTINCT FROM OLD.prix_achat
          OR NEW.prix_achat_maj IS DISTINCT FROM OLD.prix_achat_maj) THEN
    UPDATE public.produits j
       SET prix_achat = NEW.prix_achat, prix_achat_maj = NEW.prix_achat_maj,
           coefficient = CASE WHEN coalesce(j.prix_revendeur, 0) > 0
                              THEN round(j.prix_revendeur / NEW.prix_achat, 4) ELSE j.coefficient END,
           coeff_revendeur = CASE WHEN coalesce(j.prix_revendeur, 0) > 0
                                  THEN round(j.prix_revendeur / NEW.prix_achat, 4) ELSE j.coeff_revendeur END
     WHERE upper(btrim(j.reference_odoo)) = cle AND j.id <> NEW.id
       AND j.prix_achat IS DISTINCT FROM NEW.prix_achat
       AND (j.prix_achat_maj IS NULL OR j.prix_achat_maj < NEW.prix_achat_maj)
       AND (coalesce(j.prix_achat, 0) = 0
            OR greatest(j.prix_achat, NEW.prix_achat) <= 2 * least(j.prix_achat, NEW.prix_achat));
  END IF;

  IF NEW.prix_vente_maj IS NOT NULL AND coalesce(NEW.prix_ht, 0) > 0
     AND (TG_OP = 'INSERT' OR NEW.prix_ht IS DISTINCT FROM OLD.prix_ht
          OR NEW.prix_vente_maj IS DISTINCT FROM OLD.prix_vente_maj) THEN
    UPDATE public.produits j
       SET prix_ht = NEW.prix_ht, prix_vente_maj = NEW.prix_vente_maj,
           prix_revendeur = round(NEW.prix_ht * (1 - least(coalesce(j.remise_revendeur, 0), 99.99) / 100), 2),
           coefficient = CASE WHEN coalesce(j.prix_achat, 0) > 0
                              THEN round(round(NEW.prix_ht * (1 - least(coalesce(j.remise_revendeur, 0), 99.99) / 100), 2) / j.prix_achat, 4)
                              ELSE j.coefficient END,
           coeff_revendeur = CASE WHEN coalesce(j.prix_achat, 0) > 0
                                  THEN round(round(NEW.prix_ht * (1 - least(coalesce(j.remise_revendeur, 0), 99.99) / 100), 2) / j.prix_achat, 4)
                                  ELSE j.coeff_revendeur END
     WHERE upper(btrim(j.reference_odoo)) = cle AND j.id <> NEW.id
       AND j.prix_ht IS DISTINCT FROM NEW.prix_ht
       AND (j.prix_vente_maj IS NULL OR j.prix_vente_maj < NEW.prix_vente_maj)
       AND (coalesce(j.prix_ht, 0) = 0
            OR greatest(j.prix_ht, NEW.prix_ht) <= 2 * least(j.prix_ht, NEW.prix_ht));
  END IF;

  RETURN NEW;
END $$;

-- Rattrapage ciblé : QUARTZ0103 reprend le revendeur de son public (32,66 €
-- à 30 % → 22,86 €, comme QUARTZ0.1-0.3). Les autres jumeaux incohérents
-- (GRANITGRIS5/8, FLOWFAST31920…) ne sont pas touchés : rien ne dit lequel
-- de leurs deux prix est le bon.
UPDATE public.produits
   SET prix_revendeur = round(prix_ht * (1 - remise_revendeur / 100), 2),
       coefficient = round(round(prix_ht * (1 - remise_revendeur / 100), 2) / prix_achat, 4),
       coeff_revendeur = round(round(prix_ht * (1 - remise_revendeur / 100), 2) / prix_achat, 4)
 WHERE reference = 'QUARTZ0103' AND prix_ht = 32.66 AND remise_revendeur = 30 AND prix_achat > 0;
