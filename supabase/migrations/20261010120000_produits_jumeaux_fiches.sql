-- Deux articles du CRM qui portent la MÊME référence Odoo sont le même article
-- chez Odoo (FLOWFAST208 / FLOWFAST208COVEMIX, FLOWFAST107 / FLOWFASTPRIMER107.20…).
-- Leurs FICHES TECHNIQUES (liens des mails et des devis) se partagent : chaque
-- jumeau reçoit celles qui lui manquent, dans les deux sens. Un lien n'est
-- jamais retiré — la synchronisation ne fait qu'AJOUTER. La première fiche d'un
-- jumeau reste la sienne (fiche_url) ; celles qui arrivent vont à la suite.
-- Les photos ne sont pas touchées : une photo supprimée sur un jumeau effacerait
-- le fichier de l'autre.
CREATE OR REPLACE FUNCTION public.fiches_de_produit(p public.produits)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE WHEN coalesce(p.fiche_url, '') <> ''
               THEN jsonb_build_array(jsonb_build_object('url', p.fiche_url, 'label', coalesce(p.fiche_link_label, '')))
               ELSE '[]'::jsonb END)
         || (CASE WHEN jsonb_typeof(p.fiches_supplementaires) = 'array' THEN p.fiches_supplementaires ELSE '[]'::jsonb END)
$$;

CREATE OR REPLACE FUNCTION public.synchroniser_jumeaux_fiches()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cle text := upper(nullif(btrim(NEW.reference_odoo), ''));
  j public.produits;
  miennes jsonb := public.fiches_de_produit(NEW);
  siennes jsonb;
  manquantes jsonb;
  fusion jsonb;
BEGIN
  IF cle IS NULL OR jsonb_array_length(miennes) = 0 THEN RETURN NEW; END IF;

  FOR j IN SELECT * FROM public.produits
            WHERE upper(btrim(reference_odoo)) = cle AND id <> NEW.id LOOP
    siennes := public.fiches_de_produit(j);
    SELECT coalesce(jsonb_agg(f), '[]'::jsonb) INTO manquantes
      FROM jsonb_array_elements(miennes) f
     WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(siennes) s WHERE s->>'url' = f->>'url');
    IF jsonb_array_length(manquantes) = 0 THEN CONTINUE; END IF;

    fusion := siennes || manquantes;
    UPDATE public.produits
       SET fiche_url = fusion->0->>'url',
           fiche_link_label = nullif(fusion->0->>'label', ''),
           fiches_supplementaires = CASE WHEN jsonb_array_length(fusion) > 1 THEN fusion - 0
                                         ELSE fiches_supplementaires END
     WHERE id = j.id;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jumeaux_fiches ON public.produits;
CREATE TRIGGER trg_jumeaux_fiches
  AFTER INSERT OR UPDATE OF fiche_url, fiche_link_label, fiches_supplementaires, reference_odoo
  ON public.produits
  FOR EACH ROW EXECUTE FUNCTION public.synchroniser_jumeaux_fiches();

-- Rattrapage : réécrire la référence Odoo des articles qui ont un jumeau
-- déclenche la synchronisation (la valeur ne change pas).
UPDATE public.produits p SET reference_odoo = p.reference_odoo
 WHERE nullif(btrim(p.reference_odoo), '') IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.produits q
                WHERE upper(btrim(q.reference_odoo)) = upper(btrim(p.reference_odoo)) AND q.id <> p.id);
