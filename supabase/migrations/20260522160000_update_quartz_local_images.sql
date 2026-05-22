-- Met à jour les imageUrl QuartzColor vers les images locales (évite les problèmes CORS)
UPDATE public.produits
SET variantes = (
  SELECT jsonb_agg(
    CASE
      WHEN (dim->'options')::text ILIKE '%Beige 101%'
      THEN jsonb_set(dim, '{options}', (
        SELECT jsonb_agg(
          CASE opt->>'label'
            WHEN 'Beige 101'       THEN jsonb_set(opt, '{imageUrl}', '"/quartz/Beige_101.jpg"')
            WHEN 'Biscuit 102'     THEN jsonb_set(opt, '{imageUrl}', '"/quartz/Biscuit_102.jpg"')
            WHEN 'Black 901'       THEN jsonb_set(opt, '{imageUrl}', '"/quartz/Black_901.jpg"')
            WHEN 'Dark Grey 703'   THEN jsonb_set(opt, '{imageUrl}', '"/quartz/Dark_Grey_703.jpg"')
            WHEN 'Grass Green 601' THEN jsonb_set(opt, '{imageUrl}', '"/quartz/Grass_Green_601.jpg"')
            WHEN 'Light Grey 701'  THEN jsonb_set(opt, '{imageUrl}', '"/quartz/Light_Grey_701.jpg"')
            WHEN 'Mid Blue 501'    THEN jsonb_set(opt, '{imageUrl}', '"/quartz/Mid_Blue_501.jpg"')
            WHEN 'Mid Grey 702'    THEN jsonb_set(opt, '{imageUrl}', '"/quartz/Mid_Grey_702.jpg"')
            WHEN 'Blue 502'        THEN jsonb_set(opt, '{imageUrl}', '"/quartz/Blue_502.jpg"')
            WHEN 'Cream 103'       THEN jsonb_set(opt, '{imageUrl}', '"/quartz/Cream_103.jpg"')
            WHEN 'Green 602'       THEN jsonb_set(opt, '{imageUrl}', '"/quartz/Green_602.jpg"')
            WHEN 'Grey 704'        THEN jsonb_set(opt, '{imageUrl}', '"/quartz/Grey_704.jpg"')
            WHEN 'Red 301'         THEN jsonb_set(opt, '{imageUrl}', '"/quartz/Red_301.jpg"')
            WHEN 'Yellow 104'      THEN jsonb_set(opt, '{imageUrl}', '"/quartz/Yellow_104.jpg"')
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
