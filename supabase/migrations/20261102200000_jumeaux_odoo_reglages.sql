-- Deux articles du CRM qui portent la MÊME référence Odoo sont le même article
-- chez Odoo (PROTOP100022 importé d'Odoo / PROTOP1000223 créé dans MonCRM).
-- Après les prix (20261008140000) et les fiches techniques (20261010120000),
-- leurs RÉGLAGES DE DEVIS se partagent aussi : options proposées (pigment…),
-- variantes (teintes RAL), consommations, dosage selon l'épaisseur.
--
--   * Un réglage MODIFIÉ sur l'un passe aux autres (y compris vidé : retirer
--     une option sur l'un la retire sur l'autre).
--   * Au RATTACHEMENT (référence Odoo posée ou changée, article créé), rien
--     n'est écrasé : chacun reçoit ce qui lui manque, dans les deux sens.
--
-- Pas de boucle : la mise à jour d'un jumeau redéclenche le trigger, mais ne
-- trouve plus rien de DIFFÉRENT à recopier.
CREATE OR REPLACE FUNCTION public.jumeau_vide(v jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT v IS NULL OR v = 'null'::jsonb OR v = '[]'::jsonb OR v = '{}'::jsonb
$$;

-- Changé, au sens des jumeaux : deux valeurs vides ne diffèrent pas.
CREATE OR REPLACE FUNCTION public.jumeau_change(a jsonb, b jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT NOT (public.jumeau_vide(a) AND public.jumeau_vide(b)) AND a IS DISTINCT FROM b
$$;

CREATE OR REPLACE FUNCTION public.synchroniser_jumeaux_reglages()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cle text := upper(nullif(btrim(NEW.reference_odoo), ''));
  rattachement boolean;
  s public.produits;
BEGIN
  IF cle IS NULL THEN RETURN NEW; END IF;
  rattachement := TG_OP = 'INSERT' OR upper(nullif(btrim(OLD.reference_odoo), '')) IS DISTINCT FROM cle;

  IF rattachement THEN
    -- 1. Ce qui manque à l'article rattaché vient d'un jumeau qui l'a (le plus récent).
    FOR s IN SELECT * FROM public.produits
              WHERE upper(btrim(reference_odoo)) = cle AND id <> NEW.id
              ORDER BY updated_at DESC NULLS LAST LOOP
      UPDATE public.produits n SET
        type_options     = CASE WHEN public.jumeau_vide(n.lignes_options) AND NOT public.jumeau_vide(s.lignes_options) THEN s.type_options ELSE n.type_options END,
        lignes_options   = CASE WHEN public.jumeau_vide(n.lignes_options) AND NOT public.jumeau_vide(s.lignes_options) THEN s.lignes_options ELSE n.lignes_options END,
        variantes        = CASE WHEN public.jumeau_vide(n.variantes) AND NOT public.jumeau_vide(s.variantes) THEN s.variantes ELSE n.variantes END,
        dosage_epaisseur = CASE WHEN public.jumeau_vide(n.dosage_epaisseur) AND NOT public.jumeau_vide(s.dosage_epaisseur) THEN s.dosage_epaisseur ELSE n.dosage_epaisseur END,
        consommations    = CASE WHEN public.jumeau_vide(n.consommations) AND NOT public.jumeau_vide(s.consommations) THEN s.consommations ELSE n.consommations END,
        consommation     = CASE WHEN coalesce(n.consommation, 0) = 0 AND coalesce(s.consommation, 0) > 0 THEN s.consommation ELSE n.consommation END,
        consommation_ml  = CASE WHEN coalesce(n.consommation_ml, 0) = 0 AND coalesce(s.consommation_ml, 0) > 0 THEN s.consommation_ml ELSE n.consommation_ml END
      WHERE n.id = NEW.id
        AND ((public.jumeau_vide(n.lignes_options) AND NOT public.jumeau_vide(s.lignes_options))
          OR (public.jumeau_vide(n.variantes) AND NOT public.jumeau_vide(s.variantes))
          OR (public.jumeau_vide(n.dosage_epaisseur) AND NOT public.jumeau_vide(s.dosage_epaisseur))
          OR (public.jumeau_vide(n.consommations) AND NOT public.jumeau_vide(s.consommations))
          OR (coalesce(n.consommation, 0) = 0 AND coalesce(s.consommation, 0) > 0)
          OR (coalesce(n.consommation_ml, 0) = 0 AND coalesce(s.consommation_ml, 0) > 0));
    END LOOP;
    -- 2. Ce que l'article rattaché a passe aux jumeaux à qui il manque.
    UPDATE public.produits j SET
      type_options     = CASE WHEN public.jumeau_vide(j.lignes_options) AND NOT public.jumeau_vide(NEW.lignes_options) THEN NEW.type_options ELSE j.type_options END,
      lignes_options   = CASE WHEN public.jumeau_vide(j.lignes_options) AND NOT public.jumeau_vide(NEW.lignes_options) THEN NEW.lignes_options ELSE j.lignes_options END,
      variantes        = CASE WHEN public.jumeau_vide(j.variantes) AND NOT public.jumeau_vide(NEW.variantes) THEN NEW.variantes ELSE j.variantes END,
      dosage_epaisseur = CASE WHEN public.jumeau_vide(j.dosage_epaisseur) AND NOT public.jumeau_vide(NEW.dosage_epaisseur) THEN NEW.dosage_epaisseur ELSE j.dosage_epaisseur END,
      consommations    = CASE WHEN public.jumeau_vide(j.consommations) AND NOT public.jumeau_vide(NEW.consommations) THEN NEW.consommations ELSE j.consommations END,
      consommation     = CASE WHEN coalesce(j.consommation, 0) = 0 AND coalesce(NEW.consommation, 0) > 0 THEN NEW.consommation ELSE j.consommation END,
      consommation_ml  = CASE WHEN coalesce(j.consommation_ml, 0) = 0 AND coalesce(NEW.consommation_ml, 0) > 0 THEN NEW.consommation_ml ELSE j.consommation_ml END
    WHERE upper(btrim(j.reference_odoo)) = cle AND j.id <> NEW.id
      AND ((public.jumeau_vide(j.lignes_options) AND NOT public.jumeau_vide(NEW.lignes_options))
        OR (public.jumeau_vide(j.variantes) AND NOT public.jumeau_vide(NEW.variantes))
        OR (public.jumeau_vide(j.dosage_epaisseur) AND NOT public.jumeau_vide(NEW.dosage_epaisseur))
        OR (public.jumeau_vide(j.consommations) AND NOT public.jumeau_vide(NEW.consommations))
        OR (coalesce(j.consommation, 0) = 0 AND coalesce(NEW.consommation, 0) > 0)
        OR (coalesce(j.consommation_ml, 0) = 0 AND coalesce(NEW.consommation_ml, 0) > 0));
    RETURN NEW;
  END IF;

  -- Réglage modifié : il passe tel quel aux jumeaux. Vide, 0, [] et null se
  -- valent : la fiche enregistre une conso absente en 0, et ce 0 ne doit pas
  -- effacer la conso du jumeau.
  UPDATE public.produits j SET
    type_options     = CASE WHEN chg_opt THEN NEW.type_options ELSE j.type_options END,
    lignes_options   = CASE WHEN chg_opt THEN NEW.lignes_options ELSE j.lignes_options END,
    variantes        = CASE WHEN chg_var THEN NEW.variantes ELSE j.variantes END,
    dosage_epaisseur = CASE WHEN chg_dos THEN NEW.dosage_epaisseur ELSE j.dosage_epaisseur END,
    consommations    = CASE WHEN chg_cos THEN NEW.consommations ELSE j.consommations END,
    consommation     = CASE WHEN chg_con THEN NEW.consommation ELSE j.consommation END,
    consommation_ml  = CASE WHEN chg_cml THEN NEW.consommation_ml ELSE j.consommation_ml END
  FROM (SELECT
      (coalesce(NEW.type_options, false) <> coalesce(OLD.type_options, false)
        OR public.jumeau_change(NEW.lignes_options, OLD.lignes_options)) AS chg_opt,
      public.jumeau_change(NEW.variantes, OLD.variantes) AS chg_var,
      public.jumeau_change(NEW.dosage_epaisseur, OLD.dosage_epaisseur) AS chg_dos,
      public.jumeau_change(NEW.consommations, OLD.consommations) AS chg_cos,
      coalesce(NEW.consommation, 0) <> coalesce(OLD.consommation, 0) AS chg_con,
      coalesce(NEW.consommation_ml, 0) <> coalesce(OLD.consommation_ml, 0) AS chg_cml) c
  WHERE upper(btrim(j.reference_odoo)) = cle AND j.id <> NEW.id
    AND ((chg_opt AND (j.type_options IS DISTINCT FROM NEW.type_options OR j.lignes_options IS DISTINCT FROM NEW.lignes_options))
      OR (chg_var AND j.variantes IS DISTINCT FROM NEW.variantes)
      OR (chg_dos AND j.dosage_epaisseur IS DISTINCT FROM NEW.dosage_epaisseur)
      OR (chg_cos AND j.consommations IS DISTINCT FROM NEW.consommations)
      OR (chg_con AND coalesce(j.consommation, 0) <> coalesce(NEW.consommation, 0))
      OR (chg_cml AND coalesce(j.consommation_ml, 0) <> coalesce(NEW.consommation_ml, 0)));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jumeaux_reglages ON public.produits;
CREATE TRIGGER trg_jumeaux_reglages
  AFTER INSERT OR UPDATE OF type_options, lignes_options, variantes, dosage_epaisseur,
    consommations, consommation, consommation_ml, reference_odoo
  ON public.produits
  FOR EACH ROW EXECUTE FUNCTION public.synchroniser_jumeaux_reglages();
