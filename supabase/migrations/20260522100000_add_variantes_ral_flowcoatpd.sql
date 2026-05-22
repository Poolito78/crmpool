-- Ajoute la dimension RAL au produit FLOWCOATPD
UPDATE public.produits
SET variantes = COALESCE(variantes, '[]'::jsonb) || jsonb_build_array(
  jsonb_build_object(
    'id',      '3a7cd35f-dc94-4ed1-8062-b3606680dabf',
    'label',   'Teinte RAL',
    'options', jsonb_build_array(
      jsonb_build_object('label', 'Gris 2012 · RAL 7040', 'prixDiff', 0),
      jsonb_build_object('label', 'Gris 2011 · RAL 7021', 'prixDiff', 0),
      jsonb_build_object('label', 'Gris 256 · RAL 7042',  'prixDiff', 0),
      jsonb_build_object('label', 'Gris 232 · RAL 7035',  'prixDiff', 0)
    )
  )
)
WHERE reference = 'FLOWCOATPD';
