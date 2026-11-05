-- Système Flowfast F1 Mortar (05/11/2026) : la ligne de la table porte sa fiche
-- récap (mail, PDF du devis, fiche article). Composition = celle du devis
-- modèle « SYS - Flowfast F1 Mortar » : à articles identiques, `fusionnerSystemes`
-- laisse le modèle seul au chiffrage. La consommation du mortier dépend de
-- l'épaisseur (Produit.dosageEpaisseur) : elle reste vide ici, et le dosage du
-- catalyseur, qui dépend de la température, n'est pas figé.
DO $$
DECLARE
  sid uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM systemes WHERE nom = 'Flowfast F1 Mortar') THEN
    RETURN;
  END IF;

  INSERT INTO systemes (user_id, nom, famille, variante, usage, support, description, source_fiche, source_drive)
  VALUES (
    '74b6e2a3-5fc7-42f5-b100-0c7f17bbfa20',
    'Flowfast F1 Mortar',
    'Mortier de réparation MMA',
    'Réparation 6 à 120 mm',
    'Réparation et reprofilage de supports béton à trafic intense (trous, joints épaufrés, dallages, massifs de machines) ; réparation d''enrobé sur zones proprement sciées',
    'Béton sec, sain et solide, sans poussière, graisse, huile ni laitance, primaire saupoudré sur support poreux ; enrobé coupé jusqu''à une base saine',
    'Mortier MMA bicomposant de classe R4 (kit 20 kg : poudre 17,8 kg + liquide 2,2 kg), 2,12 kg/m²/mm, 6 mm minimum, chargé de quartz pour les fortes épaisseurs.',
    'FP_Flowfast_f1_mortar_fr_20220110.pdf',
    'OneDrive - ISOSIGN\Documents\ISOFLOOR\02 MARKETING\Fiches Produit\FP_Flowfast_f1_mortar_fr_20220110.pdf'
  )
  RETURNING id INTO sid;

  INSERT INTO systeme_composants (systeme_id, ordre, produit_id, libelle, role, consommation, obligatoire, condition, phrase_source) VALUES
    (sid, 1, '0ba104a7-5488-423a-8207-e331c652b5fa', 'Flowfast 107 Primer', 'primaire', 0.5, false,
     'uniquement nécessaire sur supports béton',
     'Primaire Flowfast (0,30-0,50 kg/m²) avec saupoudrage [uniquement nécessaire sur supports bétons]'),
    (sid, 2, 'c6b6f9b3-0f76-47fc-8a6a-f7f56baeff6d', 'Quartz de saupoudrage du primaire', 'saupoudrage', 0.5, false,
     'sur primaire frais ; article du devis modèle (0,3-0,8), la brochure indique 0,7-1,2 mm',
     'Saupoudrage Quartz 0,7-1,2 mm (env. 0,50 kg/m²)'),
    (sid, 3, 'cb6f9a36-0a65-476c-b019-a86948325fbc', 'Catalyst C2', 'catalyseur', NULL, false,
     'pour le primaire, selon la température : 1 % à +30 °C, 2 % à +20 °C, 4 % à +10 °C, 6 % à 0 °C',
     'Recommandations pour l''ajout de catalyseur Catalyst C2 à Flowfast 107 Ceramic-Metal Primer'),
    (sid, 4, '0ddb970c-3a2c-4c05-9505-e54297d44584', 'Flowfast F1 Mortar', 'base', NULL, true,
     'consommation selon l''épaisseur : 2,12 kg/m²/mm, 6 mm minimum',
     'Consommation 2,12 kg/m2 par mm d''épaisseur.');
END $$;
