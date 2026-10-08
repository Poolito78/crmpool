-- Deux articles du CRM qui portent la MÊME référence Odoo (FLOWFAST319 et
-- FLOWFAST31920 → FLOWFAST31920) sont le même article chez Odoo : le prix
-- d'achat et le prix de vente le plus RÉCENT (date de maj) passe à l'autre.
--
-- Garde-fou : on ne synchronise pas quand les deux prix diffèrent de plus du
-- double — DENT466 (1,94 €) et DENT6 (19,40 €) sont un même code Odoo mais pas
-- le même conditionnement, les aligner fausserait une marge d'un facteur dix.
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
       SET prix_achat = NEW.prix_achat, prix_achat_maj = NEW.prix_achat_maj
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
       SET prix_ht = NEW.prix_ht, prix_vente_maj = NEW.prix_vente_maj
     WHERE upper(btrim(j.reference_odoo)) = cle AND j.id <> NEW.id
       AND j.prix_ht IS DISTINCT FROM NEW.prix_ht
       AND (j.prix_vente_maj IS NULL OR j.prix_vente_maj < NEW.prix_vente_maj)
       AND (coalesce(j.prix_ht, 0) = 0
            OR greatest(j.prix_ht, NEW.prix_ht) <= 2 * least(j.prix_ht, NEW.prix_ht));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jumeaux_odoo ON public.produits;
CREATE TRIGGER trg_jumeaux_odoo
  AFTER INSERT OR UPDATE OF prix_achat, prix_achat_maj, prix_ht, prix_vente_maj, reference_odoo
  ON public.produits
  FOR EACH ROW EXECUTE FUNCTION public.synchroniser_jumeaux_odoo();

-- Rattrapage : le plus récent de chaque paire donne son prix à l'autre.
UPDATE public.produits j
   SET prix_achat = s.prix_achat, prix_achat_maj = s.prix_achat_maj
  FROM public.produits s
 WHERE upper(btrim(j.reference_odoo)) = upper(btrim(s.reference_odoo))
   AND nullif(btrim(j.reference_odoo), '') IS NOT NULL AND j.id <> s.id
   AND s.prix_achat_maj IS NOT NULL AND coalesce(s.prix_achat, 0) > 0
   AND j.prix_achat IS DISTINCT FROM s.prix_achat
   AND (j.prix_achat_maj IS NULL OR j.prix_achat_maj < s.prix_achat_maj)
   AND (coalesce(j.prix_achat, 0) = 0
        OR greatest(j.prix_achat, s.prix_achat) <= 2 * least(j.prix_achat, s.prix_achat));

UPDATE public.produits j
   SET prix_ht = s.prix_ht, prix_vente_maj = s.prix_vente_maj
  FROM public.produits s
 WHERE upper(btrim(j.reference_odoo)) = upper(btrim(s.reference_odoo))
   AND nullif(btrim(j.reference_odoo), '') IS NOT NULL AND j.id <> s.id
   AND s.prix_vente_maj IS NOT NULL AND coalesce(s.prix_ht, 0) > 0
   AND j.prix_ht IS DISTINCT FROM s.prix_ht
   AND (j.prix_vente_maj IS NULL OR j.prix_vente_maj < s.prix_vente_maj)
   AND (coalesce(j.prix_ht, 0) = 0
        OR greatest(j.prix_ht, s.prix_ht) <= 2 * least(j.prix_ht, s.prix_ht));
