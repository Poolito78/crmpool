-- Remplace les SVG générés par les vraies photos produit Flowcrete
UPDATE public.produits
SET variantes = (
  SELECT jsonb_agg(
    CASE
      WHEN (dim->'options')::text ILIKE '%Beige 101%'
      THEN jsonb_set(dim, '{options}', (
        SELECT jsonb_agg(
          CASE opt->>'label'
            WHEN 'Beige 101'       THEN jsonb_set(opt, '{imageUrl}', '"https://assets.cpg-europe.com/cms/ressources/4254_9bb5e4f6-a408-4d42-9260-3d40772eabfe/Flowfast BC Beige 101.jpg"')
            WHEN 'Biscuit 102'     THEN jsonb_set(opt, '{imageUrl}', '"https://assets.cpg-europe.com/cms/ressources/4254_3ef84411-9366-480c-968a-23b9280485a9/Flowfast BC Biscuit 102.jpg"')
            WHEN 'Black 901'       THEN jsonb_set(opt, '{imageUrl}', '"https://assets.cpg-europe.com/cms/ressources/4254_dceef25e-6be5-40d2-ba52-410a7cb931a7/Flowfast BC Black 901.jpg"')
            WHEN 'Dark Grey 703'   THEN jsonb_set(opt, '{imageUrl}', '"https://assets.cpg-europe.com/cms/ressources/4254_27f5f332-8205-4910-802a-69bf5da83c2e/Flowfast BC Dark Grey 703.jpg"')
            WHEN 'Grass Green 601' THEN jsonb_set(opt, '{imageUrl}', '"https://assets.cpg-europe.com/cms/ressources/4254_2f996f5a-66ac-4584-8759-7759d2642684/Flowfast BC Grass Green 601.jpg"')
            WHEN 'Light Grey 701'  THEN jsonb_set(opt, '{imageUrl}', '"https://assets.cpg-europe.com/cms/ressources/4254_100bc736-ade6-4a42-819a-381f1a37b4ac/Flowfast BC Light Grey 701.jpg"')
            WHEN 'Mid Blue 501'    THEN jsonb_set(opt, '{imageUrl}', '"https://assets.cpg-europe.com/cms/ressources/4254_b0b0be46-a8b9-4f62-b2b7-5be581ebd527/Flowfast BC Mid Blue 501.jpg"')
            WHEN 'Mid Grey 702'    THEN jsonb_set(opt, '{imageUrl}', '"https://assets.cpg-europe.com/cms/ressources/4254_02fd52d2-3435-4f10-aab9-7b2b573004af/Flowfast BC Mid Grey 702.jpg"')
            WHEN 'Blue 502'        THEN jsonb_set(opt, '{imageUrl}', '"https://assets.cpg-europe.com/cms/ressources/4254_fc42305a-1f3f-4e3e-8b32-2ce95134ced9/Flowfast BC Blue 502.jpg"')
            WHEN 'Cream 103'       THEN jsonb_set(opt, '{imageUrl}', '"https://assets.cpg-europe.com/cms/ressources/4254_3d4fe38c-fbf1-45be-aa58-f775efa0d51b/Flowfast BC Cream 103.jpg"')
            WHEN 'Green 602'       THEN jsonb_set(opt, '{imageUrl}', '"https://assets.cpg-europe.com/cms/ressources/4254_6ac4fac5-00e4-40b6-a07c-e52efb6be385/Flowfast BC Green 602.jpg"')
            WHEN 'Grey 704'        THEN jsonb_set(opt, '{imageUrl}', '"https://assets.cpg-europe.com/cms/ressources/4254_8269c917-75f3-487c-a33a-e213a3f3587e/Flowfast BC Grey 704.jpg"')
            WHEN 'Red 301'         THEN jsonb_set(opt, '{imageUrl}', '"https://assets.cpg-europe.com/cms/ressources/4254_8c0143c5-5c40-4c2a-ae44-30e360b627aa/Flowfast BC Red 301.jpg"')
            WHEN 'Yellow 104'      THEN jsonb_set(opt, '{imageUrl}', '"https://assets.cpg-europe.com/cms/ressources/4254_3f60e017-d2b3-4666-bb2d-37ec0be1fc5d/Flowfast BC Yellow 104.jpg"')
            ELSE opt
          END
        )
        FROM jsonb_array_elements(dim->'options') AS opt
      ))
      ELSE dim
    END
  )
  FROM jsonb_array_elements(variantes) AS dim
)
WHERE variantes::text ILIKE '%Beige 101%';
