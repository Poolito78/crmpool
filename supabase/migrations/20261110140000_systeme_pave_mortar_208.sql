-- Système « Pavé gel Flowfast 208 » aligné sur la fiche récap Flowfast 208 Mortar
-- (10/11/2026, valeurs ISOSIGN) : ratio résine / charge 1 : 1,25 en poids,
-- 4,5 kg/m² de mortier pour 2 mm.
--
-- Avant : aucune consommation sur le liant — la base du calcul manquait et
-- toutes les quantités valaient 0 ; ratio 1 / 1,5 décrit comme « 50/50 ».
-- Renommé « Pavé Mortar Flowfast 208 », le nom que portent les devis
-- (DEV-2026-032, 047, 103, 104) : le mail coche alors d'office ses fiches.
--
-- Retour arrière : nom 'Pavé gel Flowfast 208' ; liant consommation NULL,
-- ratio_base 1, pourcentage 50 ; charge ratio_base 1.5, pourcentage 50 ;
-- pigment pourcentage 1 ; catalyseur dosage_temperature NULL.

UPDATE systemes SET
  nom = 'Pavé Mortar Flowfast 208',
  description = 'Mortier MMA thixotrope : Flowfast 208 Cove Mix (seau 20 kg) chargé de quartz ou de granite au ratio 1 : 1,25 en poids, 4,5 kg/m² pour 2 mm (2,0 kg de résine + 2,5 kg de charge), pigment ≈ 0,5 %, Catalyst C2 selon la température du support. Posé dans une trame.',
  source_fiche = 'Mise en œuvre pavé gel 208.pdf',
  source_drive = 'OneDrive - ISOSIGN\Documents\ISOFLOOR\02 MARKETING\Fiches système\PAVE GEL\Mise en œuvre pavé gel 208.pdf',
  updated_at = now()
WHERE id = 'd6b40a47-5d76-4152-9834-52602c35ff36';

-- Liant : base du calcul, 2,0 kg/m² pour 2 mm.
UPDATE systeme_composants SET
  consommation = 2.0, ratio_base = NULL, pourcentage = NULL,
  condition = 'seau métallique de 20 kg ; 2,0 kg/m² pour 2 mm (4,5 kg/m² de mortier au ratio 1 : 1,25)',
  phrase_source = 'Ratio de mélange 1 : 1,25 ; consommation 4,5 kg/m² pour 2 mm (valeurs ISOSIGN, 10/11/2026)'
WHERE id = '0e4dc274-fded-4efc-83ef-10d25c36893b';

-- Charge : 1,25 fois la résine (2,5 kg/m² pour 2 mm).
UPDATE systeme_composants SET
  ratio_base = 1.25, pourcentage = NULL, consommation = NULL,
  condition = 'quartz ou granite, 1,25 fois le poids de résine (2,5 kg/m² pour 2 mm)',
  phrase_source = 'Ratio de mélange 1 : 1,25 (valeur ISOSIGN, 10/11/2026)'
WHERE id = 'e037c2d6-f6a2-4413-bc6d-498bade1f96b';

-- Pigment : ≈ 0,5 % du poids de résine, selon la teinte.
UPDATE systeme_composants SET
  pourcentage = 0.5,
  condition = '≈ 0,5 % du poids de résine, selon la teinte',
  phrase_source = 'à du pigment de la couleur souhaitée 0,5 %'
WHERE id = '8458343e-4196-4964-95b3-8d15a26998b9';

-- Catalyseur : % du poids de résine selon la température du support.
UPDATE systeme_composants SET
  dosage_temperature = '[{"de":-5,"a":0,"pourcentage":5},{"de":0,"a":10,"pourcentage":4},{"de":10,"a":20,"pourcentage":3},{"de":20,"a":30,"pourcentage":1.5},{"de":30,"a":60,"pourcentage":0.8}]'::jsonb,
  condition = 'BP50 / Catalyst C2 selon la température du support : 5 % de -5 à 0 °C, 4 % de 0 à 10 °C, 3 % de 10 à 20 °C, 1,5 % de 20 à 30 °C, 0,8 % au-delà de 30 °C',
  phrase_source = 'Catalyseur en BP 50 version de base — pourcentage du poids de résine selon la température du support'
WHERE id = '70a6f840-34a3-4e11-8e59-19c53a2e12ce';
