-- Renomme la dimension "Couleurs mélangées" en "Teinte RAL" pour tous les produits
UPDATE public.produits
SET variantes = (
  SELECT jsonb_agg(
    CASE
      WHEN dim->>'nom' = 'Couleurs mélangées'
      THEN jsonb_set(dim, '{nom}', '"Teinte RAL"')
      ELSE dim
    END
  )
  FROM jsonb_array_elements(variantes) AS dim
)
WHERE variantes::text ILIKE '%Couleurs mélangées%';
