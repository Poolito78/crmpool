-- Ajoute les imageUrl aux options de la dimension "Couleurs mélangées" (QuartzColor)
UPDATE public.produits
SET variantes = (
  SELECT jsonb_agg(
    CASE
      WHEN dim->>'nom' IN ('Couleurs mélangées', 'Teinte RAL', 'Couleur')
        AND (dim->'options')::text ILIKE '%Beige 101%'
      THEN jsonb_set(dim, '{options}', (
        SELECT jsonb_agg(
          CASE opt->>'label'
            WHEN 'Beige 101'       THEN opt || '{"imageUrl":"/quartz/Beige_101.svg"}'::jsonb
            WHEN 'Biscuit 102'     THEN opt || '{"imageUrl":"/quartz/Biscuit_102.svg"}'::jsonb
            WHEN 'Black 901'       THEN opt || '{"imageUrl":"/quartz/Black_901.svg"}'::jsonb
            WHEN 'Dark Grey 703'   THEN opt || '{"imageUrl":"/quartz/Dark_Grey_703.svg"}'::jsonb
            WHEN 'Grass Green 601' THEN opt || '{"imageUrl":"/quartz/Grass_Green_601.svg"}'::jsonb
            WHEN 'Light Grey 701'  THEN opt || '{"imageUrl":"/quartz/Light_Grey_701.svg"}'::jsonb
            WHEN 'Mid Blue 501'    THEN opt || '{"imageUrl":"/quartz/Mid_Blue_501.svg"}'::jsonb
            WHEN 'Mid Grey 702'    THEN opt || '{"imageUrl":"/quartz/Mid_Grey_702.svg"}'::jsonb
            WHEN 'Blue 502'        THEN opt || '{"imageUrl":"/quartz/Blue_502.svg"}'::jsonb
            WHEN 'Cream 103'       THEN opt || '{"imageUrl":"/quartz/Cream_103.svg"}'::jsonb
            WHEN 'Green 602'       THEN opt || '{"imageUrl":"/quartz/Green_602.svg"}'::jsonb
            WHEN 'Grey 704'        THEN opt || '{"imageUrl":"/quartz/Grey_704.svg"}'::jsonb
            WHEN 'Red 301'         THEN opt || '{"imageUrl":"/quartz/Red_301.svg"}'::jsonb
            WHEN 'Yellow 104'      THEN opt || '{"imageUrl":"/quartz/Yellow_104.svg"}'::jsonb
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
