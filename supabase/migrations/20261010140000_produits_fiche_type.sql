-- Mention d'une fiche technique : « fournisseur » (sa fiche d'origine) ou
-- « isofloor » (notre version). La première fiche porte son type dans
-- produits.fiche_type ; les suivantes dans leur objet (fiches_supplementaires.type).
ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS fiche_type text
  CHECK (fiche_type IN ('fournisseur', 'isofloor'));

-- La synchronisation des jumeaux Odoo transporte la mention avec le lien.
CREATE OR REPLACE FUNCTION public.fiches_de_produit(p public.produits)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE WHEN coalesce(p.fiche_url, '') <> ''
               THEN jsonb_build_array(
                      jsonb_strip_nulls(jsonb_build_object(
                        'url', p.fiche_url, 'label', coalesce(p.fiche_link_label, ''), 'type', p.fiche_type)))
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
           fiche_type = fusion->0->>'type',
           fiches_supplementaires = CASE WHEN jsonb_array_length(fusion) > 1 THEN fusion - 0
                                         ELSE fiches_supplementaires END
     WHERE id = j.id;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jumeaux_fiches ON public.produits;
CREATE TRIGGER trg_jumeaux_fiches
  AFTER INSERT OR UPDATE OF fiche_url, fiche_link_label, fiche_type, fiches_supplementaires, reference_odoo
  ON public.produits
  FOR EACH ROW EXECUTE FUNCTION public.synchroniser_jumeaux_fiches();
