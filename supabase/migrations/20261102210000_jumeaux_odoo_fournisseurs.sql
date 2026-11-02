-- Les jumeaux Odoo (même référence Odoo : PROTOP100022 / PROTOP1000223)
-- partagent aussi leurs FOURNISSEURS (`produit_fournisseurs`) : PROTOP100022
-- était chez TREMCO CPG, son jumeau créé dans MonCRM n'avait personne.
--
--   * Un lien fournisseur AJOUTÉ ou MODIFIÉ sur l'un passe aux autres ;
--     RETIRÉ sur l'un, il est retiré des autres.
--   * Au RATTACHEMENT (référence Odoo posée ou changée), chacun reçoit les
--     fournisseurs qui lui manquent — rien n'est écrasé.
--   * Un fournisseur recopié n'est prioritaire que si l'article n'en a pas déjà un.
--
-- `produit_fournisseurs` est dans le temps réel : l'écran reçoit les liens
-- recopiés sans relecture. Pas de boucle : un jumeau déjà à jour n'est pas
-- réécrit (ON CONFLICT … WHERE IS DISTINCT FROM).

CREATE OR REPLACE FUNCTION public.jumeaux_de(pid uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE AS $$
  SELECT j.id FROM public.produits p
    JOIN public.produits j ON upper(btrim(j.reference_odoo)) = upper(btrim(p.reference_odoo)) AND j.id <> p.id
   WHERE p.id = pid AND nullif(btrim(p.reference_odoo), '') IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.synchroniser_jumeaux_fournisseurs()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.produit_fournisseurs x
     WHERE x.fournisseur_id = OLD.fournisseur_id
       AND x.produit_id IN (SELECT public.jumeaux_de(OLD.produit_id));
    RETURN OLD;
  END IF;

  INSERT INTO public.produit_fournisseurs AS x
    (user_id, produit_id, fournisseur_id, prix_achat, reference_fournisseur, delai_livraison,
     conditionnement_min, est_prioritaire, paliers_port)
  SELECT NEW.user_id, j, NEW.fournisseur_id, NEW.prix_achat, NEW.reference_fournisseur, NEW.delai_livraison,
         NEW.conditionnement_min,
         coalesce(NEW.est_prioritaire, false) AND NOT EXISTS (
           SELECT 1 FROM public.produit_fournisseurs y
            WHERE y.produit_id = j AND y.est_prioritaire AND y.fournisseur_id <> NEW.fournisseur_id),
         NEW.paliers_port
    FROM public.jumeaux_de(NEW.produit_id) j
  ON CONFLICT (produit_id, fournisseur_id) DO UPDATE SET
    prix_achat = EXCLUDED.prix_achat,
    reference_fournisseur = EXCLUDED.reference_fournisseur,
    delai_livraison = EXCLUDED.delai_livraison,
    conditionnement_min = EXCLUDED.conditionnement_min,
    est_prioritaire = EXCLUDED.est_prioritaire,
    paliers_port = EXCLUDED.paliers_port
  WHERE (x.prix_achat, x.reference_fournisseur, x.delai_livraison, x.conditionnement_min, x.est_prioritaire, x.paliers_port)
        IS DISTINCT FROM
        (EXCLUDED.prix_achat, EXCLUDED.reference_fournisseur, EXCLUDED.delai_livraison, EXCLUDED.conditionnement_min, EXCLUDED.est_prioritaire, EXCLUDED.paliers_port);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jumeaux_fournisseurs ON public.produit_fournisseurs;
CREATE TRIGGER trg_jumeaux_fournisseurs
  AFTER INSERT OR UPDATE OR DELETE ON public.produit_fournisseurs
  FOR EACH ROW EXECUTE FUNCTION public.synchroniser_jumeaux_fournisseurs();

-- Rattachement : chaque membre du groupe reçoit les fournisseurs qui lui manquent.
CREATE OR REPLACE FUNCTION public.completer_fournisseurs_jumeaux(cle text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.produit_fournisseurs
    (user_id, produit_id, fournisseur_id, prix_achat, reference_fournisseur, delai_livraison,
     conditionnement_min, est_prioritaire, paliers_port)
  SELECT DISTINCT ON (m.id, l.fournisseur_id)
         l.user_id, m.id, l.fournisseur_id, l.prix_achat, l.reference_fournisseur, l.delai_livraison,
         l.conditionnement_min,
         coalesce(l.est_prioritaire, false) AND NOT EXISTS (
           SELECT 1 FROM public.produit_fournisseurs y WHERE y.produit_id = m.id AND y.est_prioritaire),
         l.paliers_port
    FROM public.produit_fournisseurs l
    JOIN public.produits s ON s.id = l.produit_id AND upper(btrim(s.reference_odoo)) = cle
    JOIN public.produits m ON upper(btrim(m.reference_odoo)) = cle AND m.id <> s.id
   WHERE NOT EXISTS (SELECT 1 FROM public.produit_fournisseurs x WHERE x.produit_id = m.id AND x.fournisseur_id = l.fournisseur_id)
   ORDER BY m.id, l.fournisseur_id, l.est_prioritaire DESC NULLS LAST, l.created_at DESC
  ON CONFLICT (produit_id, fournisseur_id) DO NOTHING
$$;

CREATE OR REPLACE FUNCTION public.rattacher_fournisseurs_jumeaux()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cle text := upper(nullif(btrim(NEW.reference_odoo), ''));
BEGIN
  IF cle IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND upper(nullif(btrim(OLD.reference_odoo), '')) IS NOT DISTINCT FROM cle THEN RETURN NEW; END IF;
  PERFORM public.completer_fournisseurs_jumeaux(cle);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jumeaux_rattacher_fournisseurs ON public.produits;
CREATE TRIGGER trg_jumeaux_rattacher_fournisseurs
  AFTER INSERT OR UPDATE OF reference_odoo ON public.produits
  FOR EACH ROW EXECUTE FUNCTION public.rattacher_fournisseurs_jumeaux();

-- Rattrapage des jumeaux existants (6 liens manquants sur 4 articles au 02/11).
SELECT public.completer_fournisseurs_jumeaux(c.cle)
  FROM (SELECT DISTINCT upper(btrim(reference_odoo)) AS cle FROM public.produits
         WHERE nullif(btrim(reference_odoo), '') IS NOT NULL
         GROUP BY upper(btrim(reference_odoo)) HAVING count(*) > 1) c;
