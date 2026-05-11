-- ============================================================
-- CATALOGUE ISOFLOOR 2026 - Import produits dans CRM Pool
-- ============================================================
-- USAGE : Remplacer 'YOUR_USER_ID' par votre UUID utilisateur
--         (visible dans Supabase > Authentication > Users)
-- Exemple : SELECT auth.uid() dans l'éditeur SQL Supabase
-- ============================================================

DO $$
DECLARE
  v_user_id UUID := 'YOUR_USER_ID'::UUID; -- << REMPLACER ICI
BEGIN

-- ============================================================
-- CATEGORIE : EPOXY - Liants de Base et Primaires
-- ============================================================

INSERT INTO public.produits (user_id, reference, description, description_detaillee, prix_achat, coefficient, prix_ht, tva, unite, poids, categorie) VALUES
(v_user_id, 'PROTOP1000-15KG', 'PROTOP 1000 - Kit A+B 15 kg',
 'Résine époxy bicomposant non solvantée. Liant universel pour tous les systèmes de revêtements de sol, sauf les revêtements autolissants et peintures de finition. A: 10,7 kg / B: 4,3 kg',
 165.84, 1, 165.84, 20, 'kit', 15, 'EPOXY - Liants et Primaires'),

(v_user_id, 'FLOWPRIME-LW-25KG', 'Flowprime LW - Kit A+B 25 kg',
 'Primaire époxydique à 2 composants sans solvant pour supports en béton. Ferme parfaitement les pores du béton, assure une très forte adhérence. A: 20 kg / B: 5 kg',
 237.86, 1, 237.86, 20, 'kit', 25, 'EPOXY - Liants et Primaires'),

(v_user_id, 'HYDRASEAL-DPM-12KG', 'HYDRASEAL DPM - Kit A+B 12 kg',
 'Résine époxy sans solvant et fluide, appliquée comme membrane pare-vapeur sous les systèmes de revêtements de sol. A: 8,5 kg / B: 3,5 kg',
 171.36, 1, 171.36, 20, 'kit', 12, 'EPOXY - Liants et Primaires'),

(v_user_id, 'PERAN-TCW-LE-12KG', 'Peran TCW LE - Kit A+B 12,75 kg',
 'Résine époxy légèrement thixotropée à 2 composants, faible teneur en COV, résistante au contact précoce avec l''eau (24h à +20°C). Sans alcool benzylique. A: 9 kg / B: 3,75 kg',
 160.78, 1, 160.78, 20, 'kit', 12.75, 'EPOXY - Liants et Primaires'),

(v_user_id, 'PERAN-STC-12KG', 'Peran STC - Kit A+B 12 kg',
 'Résine époxy bicomposant transparente et non solvantée. Très bonne résistance aux UV, bonne résistance chimique. Utilisable comme primaire, liant universel ou couche de finition. A: 8 kg / B: 4 kg',
 NULL, 1, NULL, 20, 'kit', 12, 'EPOXY - Liants et Primaires'),

(v_user_id, 'PERAN-STC-24KG', 'Peran STC - Kit A+B 24 kg',
 'Résine époxy bicomposant transparente et non solvantée. Très bonne résistance aux UV, bonne résistance chimique. Utilisable comme primaire, liant universel ou couche de finition. A: 16 kg / B: 8 kg',
 291.80, 1, 291.80, 20, 'kit', 24, 'EPOXY - Liants et Primaires'),

(v_user_id, 'PERAN-STC-LE-12KG', 'Peran STC LE - Kit A+B 12,75 kg',
 'Résine époxy bicomposant à faible émission. Très bonne résistance aux UV, résistance au contact précoce avec l''eau. A: 9 kg / B: 3,75 kg',
 205.79, 1, 205.79, 20, 'kit', 12.75, 'EPOXY - Liants et Primaires'),

(v_user_id, 'PERAN-STC-LE-STR-12KG', 'Peran STC LE Structure - Kit A+B 12 kg',
 'Résine transparente à faible émission base époxy, 2 composants. Très bonne résistance aux UV, résistance élevée aux produits chimiques. Utilisé comme liant et couche de finition/scellement avec système Peran STB. A: 8,25 kg / B: 3,75 kg',
 180.56, 1, 180.56, 20, 'kit', 12, 'EPOXY - Liants et Primaires'),

(v_user_id, 'PERAN-ESD-PRIMER-10KG', 'Peran ESD Primer W - Kit A+B 10 kg',
 'Primaire conducteur à base de résine époxy en phase aqueuse, bi-composants. Assure la continuité électrique sous les revêtements ESD et l''évacuation des charges aux points de mise à la terre. A: 1,72 kg / B: 8,28 kg',
 151.45, 1, 151.45, 20, 'kit', 10, 'EPOXY - Liants et Primaires'),

(v_user_id, 'FLOWFRESH-ESD-SL-27KG', 'Flowfresh ESD SL - Kit A+B+C+D 26,97 kg',
 'Revêtement de sol conducteur autonivelant hybride 4 composants à base de polyuréthane ciment. Conforme EN IEC 61340-4-1, EN IEC 61340-4-5, DIN EN 1081. Indoor Air Comfort Gold. A: 2x2,5 kg / B: 2x2,6 kg / C: 16,73 kg / D: 0,04 kg',
 173.41, 1, 173.41, 20, 'kit', 26.97, 'EPOXY - Liants et Primaires'),

(v_user_id, 'FLOWBUILD-COVE-F-10KG', 'Flowbuild Cove F - Kit A+B 10 kg',
 'Mortier époxy thixotrope à deux composants. Utilisé pour réalisation de plinthes à gorges, remplissage de trous et cavités, ou mortier pour finition lisse. A: 9,6 kg / B: 0,4 kg',
 58.59, 1, 58.59, 20, 'kit', 10, 'EPOXY - Liants et Primaires'),

(v_user_id, 'FLOWBUILD-COVE-F-25KG', 'Flowbuild Cove F - Kit A+B 25 kg',
 'Mortier époxy thixotrope à deux composants, grand conditionnement. Utilisé pour réalisation de plinthes à gorges, remplissage de trous et cavités. A: 24,1 kg / B: 0,9 kg',
 115.87, 1, 115.87, 20, 'kit', 25, 'EPOXY - Liants et Primaires'),

(v_user_id, 'ACCEL-EPOXY-2.5KG', 'Accélérateur Epoxy - Kit A+B 2,5 kg',
 'Produit liquide ambré destiné à accélérer les résines époxy non solvantées. En combinaison avec Protop 1000, Peran STC et Peran TCW pour réduire les temps de recouvrement.',
 58.40, 1, 58.40, 20, 'kit', 2.5, 'EPOXY - Liants et Primaires');

-- ============================================================
-- CATEGORIE : EPOXY - Systèmes Filmogènes et Autolissants
-- ============================================================

INSERT INTO public.produits (user_id, reference, description, description_detaillee, prix_achat, coefficient, prix_ht, tva, unite, poids, categorie) VALUES
(v_user_id, 'PERAN-SL20-14KG', 'Peran SL 20 - Kit A+B 14,2 kg',
 'Résine époxy autolissante pigmentée à 2 composants. Systèmes de sols industriels avec bonne résistance mécanique et chimique. A: 11,5 kg / B: 2,7 kg',
 210.12, 1, 210.12, 20, 'kit', 14.2, 'EPOXY - Systèmes Filmogènes'),

(v_user_id, 'PERAN-SL20-25KG', 'Peran SL 20 - Kit A+B 25,24 kg',
 'Résine époxy autolissante pigmentée à 2 composants, grand conditionnement. A: 20,44 kg / B: 4,8 kg',
 NULL, 1, NULL, 20, 'kit', 25.24, 'EPOXY - Systèmes Filmogènes'),

(v_user_id, 'FLOWCOAT-SK-14KG', 'FLOWCOAT SK - Kit A+B 14 kg',
 'Revêtement haute performance en résine époxy pour sols de hangars d''aviation. Résistant aux produits chimiques et fluides hydrauliques SKYDROL. A: 11,3 kg / B: 3,2 kg - Gris standard',
 151.25, 1, 151.25, 20, 'kit', 14, 'EPOXY - Systèmes Filmogènes'),

(v_user_id, 'FLOWCOAT-PD-25KG', 'FLOWCOAT Parc Deck PD - Kit A+B 25 kg',
 'Revêtement filmogène époxy bi-composant coloré, sans solvants, hautes performances. Application en parking et zones de circulations industrielles ou tertiaires. Très bon pouvoir couvrant. A: 20,2 kg / B: 4,8 kg',
 138.92, 1, 138.92, 20, 'kit', 25, 'EPOXY - Systèmes Filmogènes'),

(v_user_id, 'FLOWCOAT-SF41-14KG', 'FLOWCOAT SF 41 - Kit A+B 14 kg (couleurs standards)',
 'Revêtement filmogène époxy non solvanté à hautes résistances mécaniques et chimiques. Zones de production/stockage, local charge batteries, locaux agroalimentaires, ateliers, parkings. A: 11,3 kg / B: 2,7 kg',
 295.92, 1, 295.92, 20, 'kit', 14, 'EPOXY - Systèmes Filmogènes'),

(v_user_id, 'FLOWCOAT-SF41-25KG', 'FLOWCOAT SF 41 - Kit A+B 25 kg (couleurs standards)',
 'Revêtement filmogène époxy non solvanté à hautes résistances mécaniques et chimiques, grand conditionnement. A: 20,2 kg / B: 4,8 kg',
 141.36, 1, 141.36, 20, 'kit', 25, 'EPOXY - Systèmes Filmogènes'),

(v_user_id, 'FLOWCOAT-SF41-LE-24KG', 'FLOWCOAT SF 41 LE - Kit A+B 24,3 kg',
 'Revêtement filmogène époxy teinté bi-composant à faibles teneurs en COV (Low Emission) sans solvant. Hautes résistances mécaniques et chimiques, résistance UV améliorée. A: 19,8 kg / B: 4,5 kg',
 207.77, 1, 207.77, 20, 'kit', 24.3, 'EPOXY - Systèmes Filmogènes'),

(v_user_id, 'FLOWCOAT-SF41-LE-BLANK-23KG', 'FLOWCOAT SF 41 LE BLANK - Kit A+B 23 kg',
 'Revêtement filmogène époxy bi-composant blank (non teinté) à faibles teneurs en COV, sans solvant. Hautes résistances mécaniques et chimiques, résistance UV améliorée. A: 18,5 kg / B: 4,5 kg',
 334.31, 1, 334.31, 20, 'kit', 23, 'EPOXY - Systèmes Filmogènes'),

(v_user_id, 'FLOWCOAT-SF41-BLANK-14KG', 'FLOWCOAT SF 41 Blank - Kit A+B 14 kg',
 'Revêtement filmogène époxy teinté bi-composant blank. Sèche rapidement, facile d''application, très bonne résistance à l''abrasion, économique. A: 11,3 kg / B: 2,7 kg',
 233.97, 1, 233.97, 20, 'kit', 14, 'EPOXY - Systèmes Filmogènes');

-- ============================================================
-- CATEGORIE : EPOXY - Finitions et Top Coats
-- ============================================================

INSERT INTO public.produits (user_id, reference, description, description_detaillee, prix_achat, coefficient, prix_ht, tva, unite, poids, categorie) VALUES
(v_user_id, 'FLOWSEAL-EPW-MAT-10KG', 'FLOWSEAL EPW Mat - Kit A+B 10,1 kg',
 'Revêtement époxy en phase aqueuse coloré MAT. Bonnes propriétés mécaniques et chimiques. Sans solvants, pratiquement sans odeur. Finition sans joints, facile à nettoyer. A: 3,1 kg / B: 7 kg',
 127.08, 1, 127.08, 20, 'kit', 10.1, 'EPOXY - Finitions'),

(v_user_id, 'FLOWSEAL-EPW-BRILL-9KG', 'FLOWSEAL EPW Brillant - Kit A+B 9,1 kg',
 'Revêtement époxy en phase aqueuse coloré BRILLANT. Bonnes propriétés mécaniques et chimiques. Sans solvants, pratiquement sans odeur. A: 2,1 kg / B: 7 kg',
 106.63, 1, 106.63, 20, 'kit', 9.1, 'EPOXY - Finitions'),

(v_user_id, 'TOILE-VERRE-50G-250M2', 'Toile de verre 50 g/m² - Rouleau 250 m²',
 'Toile de verre 50 g/m² en rouleau de 250 m². Utilisée en renfort dans les systèmes de revêtements de sol en résine.',
 918.05, 1, 918.05, 20, 'rouleau', NULL, 'EPOXY - Finitions'),

(v_user_id, 'FLOWCOAT-EPN-12KG', 'FLOWCOAT EPN - Kit A+B 12,5 kg',
 'Résine époxy Novolac bi-composant non solvantée. Finition ou stratification pour protection contre fortes agressions chimiques. Résistant à 98% à l''acide sulfurique concentré et aux solvants chlorés. Couleurs : Rouge, Beige, Noir, Gris foncé. A: 9,53 kg / B: 2,93 kg',
 252.34, 1, 252.34, 20, 'kit', 12.5, 'EPOXY - Finitions');

-- ============================================================
-- CATEGORIE : MMA - Gamme Flowfast Résines
-- ============================================================

INSERT INTO public.produits (user_id, reference, description, description_detaillee, prix_achat, coefficient, prix_ht, tva, unite, poids, categorie) VALUES
(v_user_id, 'FF-F1-MORTAR-20KG', 'Flowfast F1 Mortar - Kit A+B 20 kg',
 'Mortier de réparation MMA à 2 composants. Prise rapide, résiste à un trafic intense, haute résistance mécanique, grande durabilité. Disponible en version Cold Grade pour T° inférieures à zéro. A: 17,8 kg / B: 2,2 kg',
 223.16, 1, 223.16, 20, 'kit', 20, 'MMA - Résines Flowfast'),

(v_user_id, 'FF-107-PRIMER-20KG', 'Flowfast 107 Ceramic Primer - Seau 20 kg',
 'Primaire MMA Ceramic pour substrats béton, carrelage et métal.',
 163.70, 1, 163.70, 20, 'seau', 20, 'MMA - Résines Flowfast'),

(v_user_id, 'FF-203-HOT-BINDER-20KG', 'Flowfast 203 Hot Binder - Seau 20 kg',
 'Couche de masse MMA résistante à l''eau chaude. Application pour systèmes quartz/chips en zones soumises à l''eau chaude.',
 178.95, 1, 178.95, 20, 'seau', 20, 'MMA - Résines Flowfast'),

(v_user_id, 'FF-205-STD-BINDER-20KG', 'Flowfast 205 Standard Binder - Seau 20 kg',
 'Couche de masse MMA standard pour système quartz/chips.',
 79.22, 1, 79.22, 20, 'seau', 20, 'MMA - Résines Flowfast'),

(v_user_id, 'FF-208-COVE-MIX-20KG', 'Flowfast 208 Cove Mix - Seau 20 kg',
 'Gel MMA pour confection de plinthes, application verticale. Dureté Mohs = 8.',
 200.40, 1, 200.40, 20, 'seau', 20, 'MMA - Résines Flowfast'),

(v_user_id, 'FF-215-FLEX-BINDER-20KG', 'Flowfast 215 Flexible Binder - Seau 20 kg',
 'PUMA - Couche de masse souple pour système quartz/chips.',
 200.40, 1, 200.40, 20, 'seau', 20, 'MMA - Résines Flowfast'),

(v_user_id, 'FF-216-FLEX-BINDER-R-20KG', 'Flowfast 216 Flexible Binder R - Seau 20 kg',
 'PUMA - Couche de masse souple thixotropée pour système quartz/chips.',
 219.74, 1, 219.74, 20, 'seau', 20, 'MMA - Résines Flowfast'),

(v_user_id, 'FF-319-UNPIGMENTED-20KG', 'Flowfast 319 Unpigmented - Seau 20 kg',
 'MMA - Finition teintable. À mélanger avec pigment poudre micronisé au choix.',
 236.85, 1, 236.85, 20, 'seau', 20, 'MMA - Résines Flowfast'),

(v_user_id, 'FF-319-CLEAR-20KG', 'Flowfast 319 CLEAR - Seau 20 kg',
 'MMA - Finition transparente (CLEAR).',
 207.60, 1, 207.60, 20, 'seau', 20, 'MMA - Résines Flowfast'),

(v_user_id, 'FF-405-CLEANER-20KG', 'Flowfast 405 Cleaner - Seau 20 kg',
 'MMA - Diluant/nettoyant MMA.',
 218.64, 1, 218.64, 20, 'seau', 20, 'MMA - Résines Flowfast');

-- ============================================================
-- CATEGORIE : MMA - Charges Minérales et Catalyseurs
-- ============================================================

INSERT INTO public.produits (user_id, reference, description, description_detaillee, prix_achat, coefficient, prix_ht, tva, unite, poids, categorie) VALUES
(v_user_id, 'QUARTZ-TF15-25KG', 'Quartz TF15 (0,1/0,35) - Seau 25 kg',
 'Charge silice granulométrie 0,1/0,35 mm. À mélanger avec liant Flowfast, Deckshield ou Flowshield.',
 16.00, 1, 16.00, 20, 'seau', 25, 'MMA - Charges Minérales'),

(v_user_id, 'QUARTZ-TF35-25KG', 'Quartz TF35 (0,3/0,8) - Seau 25 kg',
 'Charge silice granulométrie 0,3/0,8 mm. Charge minérale antidérapante.',
 16.00, 1, 16.00, 20, 'seau', 25, 'MMA - Charges Minérales'),

(v_user_id, 'QUARTZ-TG2-25KG', 'Quartz TG2 (0,6/1,2) - Seau 25 kg',
 'Charge silice granulométrie 0,6/1,2 mm. Charge minérale antidérapante.',
 16.00, 1, 16.00, 20, 'seau', 25, 'MMA - Charges Minérales'),

(v_user_id, 'HDK-N20-10KG', 'HDK N20 - Seau 10 kg',
 'Agent thixotrope pour résines MMA.',
 15.75, 1, 15.75, 20, 'seau', 10, 'MMA - Charges Minérales'),

(v_user_id, 'COATHYLENE-0.4KG', 'Coathylène - 0,4 kg',
 'Agent thixotrope pour résines MMA.',
 21.46, 1, 21.46, 20, 'pièce', 0.4, 'MMA - Charges Minérales'),

(v_user_id, 'ISGB1-10KG', 'ISGB1 - Charge étagée 10 kg',
 'Charge étagée à mortier Epoxy ou MMA.',
 264.65, 1, 264.65, 20, 'seau', 10, 'MMA - Charges Minérales'),

(v_user_id, 'SNL-FILLER-0.2KG', 'SNL Filler autolissant MMA - 0,2 kg',
 'Charge minérale à employer avec les systèmes de revêtements de sol en résine Flowfast.',
 29.40, 1, 29.40, 20, 'pièce', 0.2, 'MMA - Charges Minérales');

-- ============================================================
-- CATEGORIE : MMA - Kits Systèmes Flowfast 215 Sprink Rock
-- ============================================================

INSERT INTO public.produits (user_id, reference, description, description_detaillee, prix_achat, coefficient, prix_ht, tva, unite, poids, categorie) VALUES
(v_user_id, 'FF-215-KIT-35KG', 'FLOWFAST 215 Kit - A+B 35 kg',
 'Polyuréthane/Méthacrylate saupoudré. A: 10 kg (215) + B: 25 kg (SNL). Consommation: Ø<4 = 3,2 kg/m² / Ø>4 = 3,8 kg/m² / Ø>5 = 4,5 kg/m²',
 126.78, 1, 126.78, 20, 'kit', 35, 'MMA - Systèmes Flowfast'),

(v_user_id, 'FF-CATALYST-2KG', 'Catalyst MMA - 2 kg',
 'Durcisseur/Catalyseur MMA adaptable aux conditions de température et besoins chantier.',
 72.00, 1, 72.00, 20, 'pièce', 2, 'MMA - Systèmes Flowfast'),

(v_user_id, 'FF-PIGMENT-0.5KG', 'Pigment poudre micronisé - 0,5 kg',
 'Pigment poudre micronisé pour résines 215 (dosage 5% soit 0,5 kg/kit).',
 18.00, 1, 18.00, 20, 'pièce', 0.5, 'MMA - Systèmes Flowfast'),

(v_user_id, 'FF-PIGMENT-1KG', 'Pigment poudre micronisé - 1 kg',
 'Pigment poudre micronisé pour résines 319 (dosage 10% du poids de résine).',
 36.00, 1, 36.00, 20, 'pièce', 1, 'MMA - Systèmes Flowfast'),

(v_user_id, 'FF-PIGMENT-25KG', 'Pigment poudre micronisé - 25 kg',
 'Pigment poudre micronisé, grand conditionnement. 28,00€/kg.',
 700.00, 1, 700.00, 20, 'seau', 25, 'MMA - Systèmes Flowfast');

-- ============================================================
-- CATEGORIE : MMA - Kits Route Flowfast 319
-- ============================================================

INSERT INTO public.produits (user_id, reference, description, description_detaillee, prix_achat, coefficient, prix_ht, tva, unite, poids, categorie) VALUES
(v_user_id, 'FF-319-ROAD-KIT-43KG', 'Flowfast 319 Road Kit - 43,3 kg',
 'Kit MMA teintable route (formule anti-glissante, granulométrie 0,4-0,9). A: 20 kg + 2B: 2x11,65 kg. Rendement jusqu''à 600 m²/j. Conso 0,6 à 1,2 kg/m².',
 207.60, 1, 207.60, 20, 'kit', 43.3, 'MMA - Systèmes Route'),

(v_user_id, 'FF-319-ROAD-AD-45KG', 'Flowfast 319 Road AD - Kit 45,3 kg',
 'Kit MMA teintable route formule anti-dérapante (granulométrie 0,7-1,3). SRT = 0,68. 2 kits de 22,65 kg (A + 2B + 2C). Conso ~900 g/m².',
 340.72, 1, 340.72, 20, 'kit', 45.3, 'MMA - Systèmes Route'),

(v_user_id, 'FF-CATALYST-ROUTE', 'Catalyseur Route MMA - Seau',
 'Catalyseur adaptable aux conditions de température du chantier. (+0,24€/kg à 20°C)',
 30.55, 1, 30.55, 20, 'seau', NULL, 'MMA - Systèmes Route'),

(v_user_id, 'SNL-319-ROAD-11KG', 'SNL 319 Road - 11,65 kg',
 'Charge formule anti-glissante (granulométrie 0,4-0,9) pour Flowfast 319 Road.',
 77.00, 1, 77.00, 20, 'seau', 11.65, 'MMA - Systèmes Route');

-- ============================================================
-- CATEGORIE : POLYURETHANE - Systèmes Deckshield
-- ============================================================

INSERT INTO public.produits (user_id, reference, description, description_detaillee, prix_achat, coefficient, prix_ht, tva, unite, poids, categorie) VALUES
(v_user_id, 'DECKSHIELD-SF-30KG', 'Deckshield SF - Kit A+B+C 30 kg',
 'Masse polyuréthane flexible 3 composants. Couche de masse, couche d''égalisation ou primaire. Application sur béton ou asphalte, saupoudrable. Antidérapant, tenue au feu, tenue à la fissuration. A: 18,3 kg / B: 4,1 kg / C: 7,6 kg',
 149.28, 1, 149.28, 20, 'kit', 30, 'PU - Systèmes Deckshield'),

(v_user_id, 'DECKSHIELD-FINISH-20KG', 'Deckshield Finish - Kit A+B 20 kg',
 'Finition polyuréthane flexible bi-composant colorée pour systèmes Deckshield.',
 166.72, 1, 166.72, 20, 'kit', 20, 'PU - Systèmes Deckshield'),

(v_user_id, 'DECKSHIELD-UV-TC-10KG', 'Deckshield UV Top Coat - Kit A+B 10 kg',
 'Couche de finition polyuréthane bi-composant stable aux UV. A: 6,85 kg / B: 3,15 kg',
 308.00, 1, 308.00, 20, 'kit', 10, 'PU - Systèmes Deckshield'),

(v_user_id, 'DECKSHIELD-PU-MBR-20KG', 'Deckshield PU Membrane - Kit A+B 19,6 kg',
 'Membrane d''étanchéité autolissante à 2 composants à base de polyuréthane aromatique sans solvant. Élongation ~400% pour pontage de fissures. Composant des systèmes Deckshield ED. A: 14 kg / B: 5,6 kg',
 NULL, 1, NULL, 20, 'kit', 19.6, 'PU - Systèmes Deckshield');

-- ============================================================
-- CATEGORIE : POLYASPARTIQUE
-- ============================================================

INSERT INTO public.produits (user_id, reference, description, description_detaillee, prix_achat, coefficient, prix_ht, tva, unite, poids, categorie) VALUES
(v_user_id, 'FLOWCOAT-PA331-10KG', 'FLOWCOAT PA331 - Kit A+B 10 kg',
 'Résine aliphatique polyaspartique teintée à 2 composants, sans solvants. Flexible et polyvalente, protège les revêtements et offre une finition hautement brillante. Excellente résistance UV et aux intempéries, temps de recouvrement très court. A: 7,5 kg / B: 2,5 kg',
 219.96, 1, 219.96, 20, 'kit', 10, 'Polyaspartique');

-- ============================================================
-- CATEGORIE : Moquette de Pierre
-- ============================================================

INSERT INTO public.produits (user_id, reference, description, description_detaillee, prix_achat, coefficient, prix_ht, tva, unite, poids, categorie) VALUES
(v_user_id, 'PERAN-STC-LE-STR-12KG-MDP', 'Peran STC LE Structure - Kit A+B 12 kg (Moquette de pierre)',
 'Résine transparente époxy faible émission pour moquette de pierre intérieur. Très bonne résistance aux UV, bonne résistance au jaunissement. Usage intérieur uniquement. A: 8,25 kg / B: 3,75 kg',
 221.44, 1, 221.44, 20, 'kit', 12, 'Moquette de Pierre'),

(v_user_id, 'FLOWBIND-2700-10KG', 'Flowbind 2700 - Kit A+B 10 kg',
 'Résine Polyuréthane Aliphatique à 2 composants. Liant pour revêtements de moquette ou tapis de pierre. Application intérieur et extérieur, bonne résistance au jaunissement. A: 4,8 kg / B: 5,2 kg',
 221.44, 1, 221.44, 20, 'kit', 10, 'Moquette de Pierre'),

(v_user_id, 'FLOWBIND-2700-25KG', 'Flowbind 2700 - Kit A+B 25 kg',
 'Résine Polyuréthane Aliphatique à 2 composants, grand conditionnement. Liant pour revêtements de moquette ou tapis de pierre. A: 12 kg / B: 13 kg',
 539.60, 1, 539.60, 20, 'kit', 25, 'Moquette de Pierre');

-- ============================================================
-- CATEGORIE : Granulats - Quartz
-- ============================================================

INSERT INTO public.produits (user_id, reference, description, description_detaillee, prix_achat, coefficient, prix_ht, tva, unite, poids, categorie) VALUES
(v_user_id, 'QUARTZ-0.1-0.3-25KG', 'Quartz 0,1-0,3 mm - Sac 25 kg',
 'Quartz granulométrie 0,1-0,3 mm. Délai 3 jours.',
 16.00, 1, 16.00, 20, 'sac', 25, 'Granulats - Quartz'),

(v_user_id, 'QUARTZ-0.3-0.8-25KG', 'Quartz 0,3-0,8 mm - Sac 25 kg',
 'Quartz granulométrie 0,3-0,8 mm. Délai 3 jours.',
 16.00, 1, 16.00, 20, 'sac', 25, 'Granulats - Quartz'),

(v_user_id, 'QUARTZ-0.6-1.2-25KG', 'Quartz 0,6-1,2 mm - Sac 25 kg',
 'Quartz granulométrie 0,6-1,2 mm. Délai 3 jours.',
 16.00, 1, 16.00, 20, 'sac', 25, 'Granulats - Quartz'),

(v_user_id, 'QUARTZ-1-2.5-25KG', 'Quartz 1-2,5 mm - Sac 25 kg',
 'Quartz granulométrie 1-2,5 mm. Délai 3 jours.',
 16.00, 1, 16.00, 20, 'sac', 25, 'Granulats - Quartz'),

(v_user_id, 'QUARTZ-BLANC-2-5-25KG', 'Quartz Blanc 2-5 mm - Sac 25 kg',
 'Quartz blanc granulométrie 2-5 mm. Délai 3 jours.',
 16.00, 1, 16.00, 20, 'sac', 25, 'Granulats - Quartz');

-- ============================================================
-- CATEGORIE : Granulats - Granite
-- ============================================================

INSERT INTO public.produits (user_id, reference, description, description_detaillee, prix_achat, coefficient, prix_ht, tva, unite, poids, categorie) VALUES
(v_user_id, 'GRANITE-GRIS-0.5-1-25KG', 'Granite Gris Moucheté 0,5-1 mm - Sac 25 kg',
 'Granit gris moucheté granulométrie 0,5-1 mm. Délai 3 jours.',
 19.50, 1, 19.50, 20, 'sac', 25, 'Granulats - Granite'),

(v_user_id, 'GRANITE-GRIS-1-2-25KG', 'Granite Gris Moucheté 1-2 mm - Sac 25 kg',
 'Granit gris moucheté granulométrie 1-2 mm. Délai 15 jours.',
 19.50, 1, 19.50, 20, 'sac', 25, 'Granulats - Granite'),

(v_user_id, 'GRANITE-GRIS-1-3-25KG', 'Granite Gris Moucheté 1-3 mm - Sac 25 kg',
 'Granit gris moucheté granulométrie 1-3 mm. Délai 15 jours.',
 19.50, 1, 19.50, 20, 'sac', 25, 'Granulats - Granite'),

(v_user_id, 'GRANITE-GRIS-2-5-25KG', 'Granite Gris Moucheté 2-5 mm - Sac 25 kg',
 'Granit gris moucheté granulométrie 2-5 mm. Délai 15 jours.',
 19.50, 1, 19.50, 20, 'sac', 25, 'Granulats - Granite'),

(v_user_id, 'GRANITE-GRIS-5-8-25KG', 'Granite Gris Moucheté 5-8 mm - Sac 25 kg',
 'Granit gris moucheté granulométrie 5-8 mm. Délai 15 jours.',
 19.50, 1, 19.50, 20, 'sac', 25, 'Granulats - Granite'),

(v_user_id, 'GRANITE-GRIS-8-11-25KG', 'Granite Gris Moucheté 8-11 mm - Sac 25 kg',
 'Granit gris moucheté granulométrie 8-11 mm. Délai 15 jours.',
 19.50, 1, 19.50, 20, 'sac', 25, 'Granulats - Granite'),

(v_user_id, 'GRANITE-ROUGE-1-2-25KG', 'Granite Rouge 1-2 mm - Sac 25 kg',
 'Granit rouge granulométrie 1-2 mm. Délai 3 jours.',
 19.50, 1, 19.50, 20, 'sac', 25, 'Granulats - Granite'),

(v_user_id, 'GRANITE-ROUGE-1-3-25KG', 'Granite Rouge 1-3 mm - Sac 25 kg',
 'Granit rouge granulométrie 1-3 mm. Délai 3 jours.',
 19.50, 1, 19.50, 20, 'sac', 25, 'Granulats - Granite'),

(v_user_id, 'GRANITE-ROUGE-2-5-25KG', 'Granite Rouge 2-5 mm - Sac 25 kg',
 'Granit rouge granulométrie 2-5 mm. Délai 15 jours.',
 19.50, 1, 19.50, 20, 'sac', 25, 'Granulats - Granite'),

(v_user_id, 'GRANITE-AMBRE-0.1-0.6-25KG', 'Granite Ambre VE36 0,1-0,6 mm - Sac 25 kg',
 'Granit ambre VE36 granulométrie 0,1-0,6 mm. Délai 15 jours.',
 32.50, 1, 32.50, 20, 'sac', 25, 'Granulats - Granite'),

(v_user_id, 'GRANITE-AMBRE-0.5-1-25KG', 'Granite Ambre VE36 0,5-1 mm - Sac 25 kg',
 'Granit ambre VE36 granulométrie 0,5-1 mm. Délai 3 jours.',
 19.50, 1, 19.50, 20, 'sac', 25, 'Granulats - Granite'),

(v_user_id, 'GRANITE-AMBRE-1-2-25KG', 'Granite Ambre VE36 1-2 mm - Sac 25 kg',
 'Granit ambre VE36 granulométrie 1-2 mm. Délai 15 jours.',
 19.50, 1, 19.50, 20, 'sac', 25, 'Granulats - Granite'),

(v_user_id, 'GRANITE-ROSÉ-0.5-1-25KG', 'Granite Rouge/Rosé 0,5-1 mm - Sac 25 kg',
 'Granit rouge/rosé granulométrie 0,5-1 mm. Délai 15 jours.',
 19.50, 1, 19.50, 20, 'sac', 25, 'Granulats - Granite'),

(v_user_id, 'GRANITE-JASPER-0.5-1-25KG', 'Granite Jasper 0,5-1 mm - Sac 25 kg',
 'Granit Jasper granulométrie 0,5-1 mm. Délai 3 jours.',
 19.50, 1, 19.50, 20, 'sac', 25, 'Granulats - Granite'),

(v_user_id, 'GRANITE-JASPER-1-2-25KG', 'Granite Jasper 1-2 mm - Sac 25 kg',
 'Granit Jasper granulométrie 1-2 mm. Délai 15 jours.',
 19.50, 1, 19.50, 20, 'sac', 25, 'Granulats - Granite'),

(v_user_id, 'GRANITE-LEUCITE-0.5-1-25KG', 'Granite Leucite VE54 0,5-1 mm - Sac 25 kg',
 'Granit Leucite VE54 granulométrie 0,5-1 mm. Délai 15 jours.',
 33.50, 1, 33.50, 20, 'sac', 25, 'Granulats - Granite'),

(v_user_id, 'GRANITE-LEUCITE-1-2-25KG', 'Granite Leucite VE54 1-2 mm - Sac 25 kg',
 'Granit Leucite VE54 granulométrie 1-2 mm. Délai 15 jours.',
 33.50, 1, 33.50, 20, 'sac', 25, 'Granulats - Granite');

-- ============================================================
-- CATEGORIE : Granulats - Basalte
-- ============================================================

INSERT INTO public.produits (user_id, reference, description, description_detaillee, prix_achat, coefficient, prix_ht, tva, unite, poids, categorie) VALUES
(v_user_id, 'BASALTE-GRIS-2-4-25KG', 'Basalte Gris Foncé 2-4 mm - Sac 25 kg',
 'Basalte gris foncé granulométrie 2-4 mm. Délai 15 jours.',
 29.75, 1, 29.75, 20, 'sac', 25, 'Granulats - Basalte'),

(v_user_id, 'BASALTE-NOIR-2-4-25KG', 'Basalte Noir 2-4 mm - Sac 25 kg',
 'Basalte noir granulométrie 2-4 mm. Délai 15 jours.',
 37.25, 1, 37.25, 20, 'sac', 25, 'Granulats - Basalte'),

(v_user_id, 'BASALTE-NOIR-2-6-25KG', 'Basalte Noir 2-6 mm - Sac 25 kg',
 'Basalte noir granulométrie 2-6 mm. Délai 15 jours.',
 39.25, 1, 39.25, 20, 'sac', 25, 'Granulats - Basalte'),

(v_user_id, 'BASALTE-NOIR-0.5-1-25KG', 'Basalte Noir 0,5-1 mm - Sac 25 kg',
 'Basalte noir granulométrie 0,5-1 mm. Délai 3 jours.',
 19.50, 1, 19.50, 20, 'sac', 25, 'Granulats - Basalte'),

(v_user_id, 'BASALTE-NOIR-1-2-25KG', 'Basalte Noir 1-2 mm - Sac 25 kg',
 'Basalte noir granulométrie 1-2 mm. Délai 15 jours.',
 19.50, 1, 19.50, 20, 'sac', 25, 'Granulats - Basalte');

-- ============================================================
-- CATEGORIE : Granulats - Gamme Select (PU Color)
-- ============================================================

INSERT INTO public.produits (user_id, reference, description, description_detaillee, prix_achat, coefficient, prix_ht, tva, unite, poids, categorie) VALUES
(v_user_id, 'GRANITE-SELECT-0.1-0.6-25KG', 'Quartz & Granit PU Color Select - 0,1-0,6 mm Sac 25 kg',
 'Gamme Select PU Color - granulométrie 0,1-0,6 mm. RAL au choix. Supplément +0,20€/kg pour mélange. Délai 15 jours.',
 33.50, 1, 33.50, 20, 'sac', 25, 'Granulats - Gamme Select'),

(v_user_id, 'GRANITE-SELECT-MAGIC-25KG', 'Quartz & Granit Select Magic - 0,1-0,6 mm Sac 25 kg',
 'Gamme Select Magic granulométrie 0,1-0,6 mm. Couleurs disponibles: Bleu Turquin, Noir, Rose Corail, Jaune, Blanc Sost, Gris Flanelle, Vert Pyrénée. Délai 15 jours.',
 43.00, 1, 43.00, 20, 'sac', 25, 'Granulats - Gamme Select');

-- ============================================================
-- CATEGORIE : Granulats - Granofloor Marbre Roulé
-- ============================================================

INSERT INTO public.produits (user_id, reference, description, description_detaillee, prix_achat, coefficient, prix_ht, tva, unite, poids, categorie) VALUES
(v_user_id, 'GRANOFLOOR-GRIS-0.5-1-25KG', 'Granofloor Gris 0,5-1 mm - Sac 25 kg',
 'Granulat marbre roulé gris, granulométrie 0,5-1 mm. Dureté Mohs = 8. Délai 5 jours.',
 35.00, 1, 35.00, 20, 'sac', 25, 'Granulats - Marbre Roulé'),

(v_user_id, 'GRANOFLOOR-ROSE-0.5-1-25KG', 'Granofloor Rose 0,5-1 mm - Sac 25 kg',
 'Granulat marbre roulé rose, granulométrie 0,5-1 mm. Dureté Mohs = 8.',
 19.00, 1, 19.00, 20, 'sac', 25, 'Granulats - Marbre Roulé');

-- ============================================================
-- CATEGORIE : Matériel d'Application
-- ============================================================

INSERT INTO public.produits (user_id, reference, description, description_detaillee, prix_achat, coefficient, prix_ht, tva, unite, poids, categorie) VALUES
(v_user_id, 'MAT-RATEAU-58-DENT4', 'Râteau 58 cm dents 4 mm',
 'Râteau 58 cm avec dents 4 mm pour application résine debout.',
 59.25, 1, 59.25, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-RATEAU-58-DENT6', 'Râteau 58 cm dents 6 mm',
 'Râteau 58 cm avec dents 6 mm pour application résine debout.',
 32.85, 1, 32.85, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-RATEAU-58-LAMES', 'Râteau 58 cm pour lames dentées',
 'Râteau 58 cm pour lames dentées, application résine debout.',
 52.50, 1, 52.50, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-LAME-4.2-280MM', 'Lames dentées 280 mm - Dents 4,2/5,7/0,2 mm',
 'Lames dentées L 280 mm, dents H:4,2 / L:5,7 / S:0,2 mm pour application résine. Lot de 5.',
 30.00, 1, 30.00, 20, 'lot', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-LAME-5.2-280MM', 'Lames dentées 280 mm - Dents 5,2/6,2/0,2 mm',
 'Lames dentées L 280 mm, dents H:5,2 / L:6,2 / S:0,2 mm pour application résine. Lot de 5.',
 30.00, 1, 30.00, 20, 'lot', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-LAME-6.6-280MM', 'Lames dentées 280 mm - Dents 6,6/8,2/0,2 mm',
 'Lames dentées L 280 mm, dents H:6,6 / L:8,2 / S:0,2 mm pour application résine. Lot de 5.',
 30.00, 1, 30.00, 20, 'lot', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-RATEAU-61-CAOUT', 'Râteau 61 cm pour lame caoutchouc',
 'Râteau 61 cm pour lame caoutchouc (livré avec lame noire).',
 17.50, 1, 17.50, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-LAME-CAOUT-BLANCHE', 'Lame caoutchouc blanche pour râteau 61 cm',
 'Lame caoutchouc blanche de remplacement pour râteau 61 cm.',
 17.50, 1, 17.50, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-MANCHE-RATEAU-BOIS', 'Manche râteau en bois',
 'Manche râteau en bois pour application résine debout.',
 5.60, 1, 5.60, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-ADAPTATEUR-MANCHE', 'Adaptateur Manche - Râteau',
 'Adaptateur pour connexion manche au râteau, application résine debout.',
 6.51, 1, 6.51, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-SPATULE-5MM-400', 'Spatule crantée 400 - Dents 5 mm',
 'Spatule crantée 400 dents 5 mm pour application résine manuelle.',
 10.50, 1, 10.50, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-SPATULE-7MM-400', 'Spatule crantée 400 - Dents 7 mm',
 'Spatule crantée 400 dents 7 mm pour application résine manuelle.',
 10.50, 1, 10.50, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-RACLETTE-28-ALU', 'Raclette 28 cm alu pour lame dentée',
 'Raclette 28 cm aluminium pour lame dentée, application résine manuelle. Lot de 5.',
 35.00, 1, 35.00, 20, 'lot', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-SEMELLES-30MM', 'Semelles cloutées pro pointes 30 mm',
 'Semelles cloutées professionnelles pointes 30 mm avec sangles velcro pour application résine debout.',
 9.80, 1, 9.80, 20, 'paire', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-THERMOMETRE-LASER', 'Thermomètre laser',
 'Thermomètre laser pour mesure de la température du support avant application.',
 35.00, 1, 35.00, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-BALANCE-3KG', 'Balance numérique 3 kg',
 'Balance numérique 3 kg, précision 0,01 g.',
 29.40, 1, 29.40, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-BALANCE-50KG', 'Balance numérique 50 kg',
 'Balance numérique 50 kg, précision 2 g.',
 88.90, 1, 88.90, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-PERCHE-TELESCOPIQUE', 'Perche télescopique acier 2x100 cm',
 'Perche télescopique acier 2x100 cm pour application résine.',
 15.00, 1, 15.00, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-SEAU-27L', 'Seau plastique 27,3 L',
 'Seau plastique de mélange 27,3 litres avec anse métal (sans couvercle).',
 3.00, 1, 3.00, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-BAC-ROND-65L', 'Bac rond 65 L éco',
 'Bac rond 65 litres économique pour manipulation résine.',
 5.81, 1, 5.81, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-CHARIOT-30L', 'Chariot verseur galvanisé seau 30 L',
 'Chariot verseur galvanisé pour seau 30 litres, manipulation résine.',
 11.07, 1, 11.07, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-CHARIOT-65L', 'Chariot verseur galvanisé seau 65 L',
 'Chariot verseur galvanisé pour seau 65 litres, manipulation résine.',
 13.30, 1, 13.30, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-SUPPORT-MELANGEUR', 'Support mélangeur',
 'Support pour mélangeur résine.',
 580.00, 1, 580.00, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-MANCHON-PA-250', 'Manchon Polyamide texturé 250/12 mm',
 'Manchon Polyamide texturé 250/12 mm pour application enduit à froid liquide.',
 16.16, 1, 16.16, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-MANCHON-PA-500', 'Manchon Polyamide texturé 500/12 mm',
 'Manchon Polyamide texturé 500/12 mm pour application enduit à froid liquide.',
 12.60, 1, 12.60, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-MANCHON-PRIMAIRE-250', 'Manchon primaire 250/18 mm',
 'Manchon primaire 250/18 mm pour application primaire résine.',
 6.65, 1, 6.65, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-PATTES-LAPIN-110', 'Pattes de lapin polyamide 110/12 mm - lot 10',
 'Pattes de lapin polyamide texturé 110/12 mm, lot de 10 unités. Pour application enduit à froid liquide.',
 23.49, 1, 23.49, 20, 'lot', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-MONTURE-MARINE-250', 'Monture marine 250 mm',
 'Monture marine 250 mm pour application résine.',
 656.00, 1, 656.00, 20, 'pièce', NULL, 'Matériel d''Application'),

(v_user_id, 'MAT-MONTURE-MARINE-500', 'Monture marine 500 mm',
 'Monture marine 500 mm pour application résine.',
 696.00, 1, 696.00, 20, 'pièce', NULL, 'Matériel d''Application');

-- ============================================================
-- CATEGORIE : Pochoirs et Trames
-- ============================================================

INSERT INTO public.produits (user_id, reference, description, description_detaillee, prix_achat, coefficient, prix_ht, tva, unite, poids, categorie) VALUES
(v_user_id, 'POCHOIR-HD-2MM-SUP0.5', 'Pochoir HD 2 mm - >0,5 m²',
 'Pochoir HD 2 mm réutilisable pour mortier de résine. Tarif pour surfaces >0,5 m².',
 80.00, 1, 80.00, 20, 'm²', NULL, 'Pochoirs et Trames'),

(v_user_id, 'POCHOIR-HD-2MM-INF0.5', 'Pochoir HD 2 mm - <0,5 m²',
 'Pochoir HD 2 mm réutilisable pour mortier de résine. Tarif pour surfaces <0,5 m².',
 160.00, 1, 160.00, 20, 'm²', NULL, 'Pochoirs et Trames'),

(v_user_id, 'POCHOIR-BLACK-ADH-1MM', 'Pochoir Black Line Adhésif 1 mm',
 'Pochoir adhésif Black Line 1 mm pour mortier de résine. Utilisation 1 à 2 fois, fort adhésif.',
 45.00, 1, 45.00, 20, 'm²', NULL, 'Pochoirs et Trames'),

(v_user_id, 'POCHOIR-GRENAILLAGE', 'Pochoir Grenaillage',
 'Pochoir adhésif pour grenaillage.',
 45.00, 1, 45.00, 20, 'm²', NULL, 'Pochoirs et Trames'),

(v_user_id, 'TRAME-PAVE-HD-2MM-U', 'Trame Pavé HD 2 mm - unité 2 m²',
 'Trame pavé HD 2 mm réutilisable pour mortier de résine. Pavé droit, rustique, arrondi, tous formats. Carton 6 unités x 2 m².',
 37.23, 1, 37.23, 20, 'unité', NULL, 'Pochoirs et Trames'),

(v_user_id, 'TRAME-PAVE-BLACK-2MM', 'Trame Pavé Black Line 2 mm - unité',
 'Trame pavé adhésive Black Line 2 mm. Pavé rustique, arrondi, tous formats. Carton 10 unités.',
 21.70, 1, 21.70, 20, 'unité', NULL, 'Pochoirs et Trames'),

(v_user_id, 'TRAME-PAVE-BLACK-3MM', 'Trame Pavé Black Line 3 mm - unité',
 'Trame pavé adhésive Black Line 3 mm. Pavé rustique, arrondi, tous formats. Carton 10 unités.',
 26.00, 1, 26.00, 20, 'unité', NULL, 'Pochoirs et Trames'),

(v_user_id, 'GABARIT-POLYMERE-3MM', 'Gabarit polymère BAO 3 mm - ml',
 'Gabarit polymère 3 mm pour mortier de résine. 10 ml = 9 modules (1m + 2x414 ml + 2 angles). Carton 10 unités.',
 39.36, 1, 39.36, 20, 'ml', NULL, 'Pochoirs et Trames');

END $$;
