-- Ajoute les RAL standards (idem FLOWCOATPD) à la dimension Couleur de QuartzColor
-- RAL déjà présent : RAL 1001
-- Ajout : RAL 7040, 7021, 7042, 7035, 1023, 5017, 5015, 3001, 3020, 9005, 9010, 6001, 1015
UPDATE public.produits
SET variantes = (
  SELECT jsonb_agg(
    CASE
      WHEN (dim->'options')::text ILIKE '%Beige 101%'
      THEN jsonb_set(dim, '{options}', (dim->'options') || jsonb_build_array(
        jsonb_build_object('label', 'RAL 7040', 'prixDiff', 5),
        jsonb_build_object('label', 'RAL 7021', 'prixDiff', 5),
        jsonb_build_object('label', 'RAL 7042', 'prixDiff', 5),
        jsonb_build_object('label', 'RAL 7035', 'prixDiff', 5),
        jsonb_build_object('label', 'RAL 1023', 'prixDiff', 5),
        jsonb_build_object('label', 'RAL 5017', 'prixDiff', 5),
        jsonb_build_object('label', 'RAL 5015', 'prixDiff', 5),
        jsonb_build_object('label', 'RAL 3001', 'prixDiff', 5),
        jsonb_build_object('label', 'RAL 3020', 'prixDiff', 5),
        jsonb_build_object('label', 'RAL 9005', 'prixDiff', 5),
        jsonb_build_object('label', 'RAL 9010', 'prixDiff', 5),
        jsonb_build_object('label', 'RAL 6001', 'prixDiff', 5),
        jsonb_build_object('label', 'RAL 1015', 'prixDiff', 5)
      ))
      ELSE dim
    END
  )
  FROM jsonb_array_elements(variantes) AS dim
)
WHERE variantes::text ILIKE '%Beige 101%';
