-- Système « Flowfast 319 Route » aligné sur la fiche système Flowfast 319 Road
-- (version du 10/10/2026) et sa fiche récap (16/11/2026).
--
-- Avant : le liant était l'article FLOWFAST319R11, le KIT complet de 45,3 kg
-- (résine 20 kg + 4 × SNL 319 Road 5,825 kg + 4 × pigment 0,5 kg), sans
-- consommation : aucune base de calcul, toutes les quantités valaient 0 ; et la
-- charge SNL, comptée à part à 1,16 × le liant, l'aurait été deux fois.
-- Le pigment n'avait pas de dose, le catalyseur était figé à 3 %.
--
-- Après : base = résine seule FLOWFAST319 (seau de 20 kg), comme dans le devis
-- modèle « SYS - FLowfast 319 Road ». Consommation : la fiche donne 0,7 à 1,2 kg/m²
-- de mélange, 0,9 en référence ; ISOSIGN chiffre 1 kg/m² sur enrobé par sûreté
-- (16/11/2026), soit 0,44 kg/m² de résine (1 ÷ (1 + 1,16 + 0,10 + 0,03)).
-- Charge 1,16 × la résine, pigment 10 % (2 kg par seau de 20 kg), catalyseur
-- selon la température de l'air (tableau de la fiche).
--
-- Retour arrière : liant produit_id = '5565b698-aaec-4262-92c7-68dd82098006'
-- (FLOWFAST319R11), libellé 'Flowfast 319 Route (résine)', consommation NULL,
-- ratio_base 1.0 ; primaire consommation 0.4 ; pigment pourcentage NULL ; catalyseur pourcentage 3.0,
-- dosage_temperature NULL.

UPDATE systeme_composants SET
  produit_id = 'f243717e-a56b-4395-818f-4a034772d859',
  libelle = 'Flowfast 319 Unpigmented (résine)',
  consommation = 0.44, ratio_base = NULL, pourcentage = NULL,
  condition = 'seau métallique de 20 kg ; 0,44 kg/m² de résine = 1 kg/m² de mélange sur enrobé, compté par sûreté (fiche : 0,7 à 1,2 kg/m², 0,9 en référence)',
  phrase_source = 'Consommation 0,7 / 0,9 / 1,2 kg/m² ; 1 kg/m² retenu par ISOSIGN sur enrobé (16/11/2026)'
WHERE systeme_id = 'acf3f02a-2f04-45f5-86e5-e0066b36738a' AND role = 'liant';

UPDATE systeme_composants SET
  ratio_base = 1.16, consommation = NULL, pourcentage = NULL,
  condition = 'SNL 319R, 1,16 fois le poids de résine (11,65 kg pour 10 kg)',
  phrase_source = 'Elle doit être mélangée à la charge SNL 319R avec un ratio de 1 / 1,16'
WHERE systeme_id = 'acf3f02a-2f04-45f5-86e5-e0066b36738a' AND role = 'charge';

UPDATE systeme_composants SET
  pourcentage = 10, consommation = NULL, ratio_base = NULL,
  condition = '10 % du poids de résine (2 kg par seau de 20 kg) ; la résine doit être pigmentée',
  phrase_source = 'Pigment 0,5 kg / 1 kg / 2 kg pour 5 / 10 / 20 kg de Flowfast 319 Unp.'
WHERE systeme_id = 'acf3f02a-2f04-45f5-86e5-e0066b36738a' AND role = 'pigment';

UPDATE systeme_composants SET
  pourcentage = NULL,
  dosage_temperature = '[{"de":-5,"a":0,"pourcentage":5},{"de":0,"a":10,"pourcentage":4},{"de":10,"a":20,"pourcentage":3},{"de":20,"a":30,"pourcentage":1.5},{"de":30,"a":60,"pourcentage":1}]'::jsonb,
  condition = 'Catalyst C2 ou sachets BP50 150 g, selon la température de l''AIR : 5 % de -5 à 0 °C, 4 % de 0 à 10 °C, 3 % de 10 à 20 °C, 1,5 % de 20 à 30 °C, 1 % (100 g / 10 kg minimum) au-delà de 30 °C',
  phrase_source = 'Dosage Catalyst Kit Flowfast 319 Road — pourcentage en poids de résine'
WHERE systeme_id = 'acf3f02a-2f04-45f5-86e5-e0066b36738a' AND role = 'catalyseur';

-- Primaire Flowfast 107 / 108 (option) : 0,35 kg/m² (valeur ISOSIGN, 16/11/2026 ; était 0,4).
UPDATE systeme_composants SET
  consommation = 0.35,
  condition = 'uniquement en cas d''humidité résiduelle jugée trop importante ; 0,35 kg/m²'
WHERE systeme_id = 'acf3f02a-2f04-45f5-86e5-e0066b36738a' AND role = 'primaire';

UPDATE systemes SET
  description = 'Liant MMA Flowfast 319 Unpigmented (seau métallique 20 kg), mélangé à la charge SNL 319R (ratio 1 / 1,16), pigmenté à 10 % et catalysé selon la température de l''air. Totalement auto-nivelant, aspect satiné. 0,7 à 1,2 kg/m² de mélange, 0,9 en référence ; chiffré à 1 kg/m² sur enrobé par sûreté (kit de 45,9 kg ≈ 46 m²).',
  source_fiche = 'FS_Flowfast 319 Road fiche système.pdf',
  updated_at = now()
WHERE id = 'acf3f02a-2f04-45f5-86e5-e0066b36738a';
