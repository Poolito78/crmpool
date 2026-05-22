-- Ajoute 9 teintes RAL supplémentaires à FLOWCOATPD
UPDATE public.produits
SET variantes = (
  SELECT jsonb_agg(
    CASE
      WHEN dim->>'id' = '3a7cd35f-dc94-4ed1-8062-b3606680dabf'
      THEN jsonb_set(dim, '{options}', (dim->'options') || jsonb_build_array(
        jsonb_build_object('label', 'RAL 1023', 'prixDiff', 0),
        jsonb_build_object('label', 'RAL 5017', 'prixDiff', 0),
        jsonb_build_object('label', 'RAL 5015', 'prixDiff', 0),
        jsonb_build_object('label', 'RAL 3001', 'prixDiff', 0),
        jsonb_build_object('label', 'RAL 3020', 'prixDiff', 0),
        jsonb_build_object('label', 'RAL 9005', 'prixDiff', 0),
        jsonb_build_object('label', 'RAL 9010', 'prixDiff', 0),
        jsonb_build_object('label', 'RAL 6001', 'prixDiff', 0),
        jsonb_build_object('label', 'RAL 1015', 'prixDiff', 0)
      ))
      ELSE dim
    END
  )
  FROM jsonb_array_elements(variantes) AS dim
)
WHERE reference = 'FLOWCOATPD';
