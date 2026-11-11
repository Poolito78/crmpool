-- Système ISOFLOOR HYDREPOX (11/11/2026) : nouveau nom de TITASOL HYDRO, porté
-- par l'article HYDREPOX10, ex-TITASOL10 (kit A 8,3 kg + B 1,7 kg). La ligne de la table porte
-- la fiche récap (mail, PDF du devis, fiche article).
-- 2 couches en direct sur béton intérieur, comme Flowseal EPW : 1re diluée à
-- 10 % d'eau, 2e non diluée. Consommation = calcul ISOSIGN sur le rendement
-- théorique de la fiche (2,7 m²/kg pour 120 µm sec, produit non dilué) :
-- 1 / 2,7 = 0,37 kg/m² par couche ; 0,49 kg/m² à 160 µm sec.
DO $$
DECLARE
  sid uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM systemes WHERE nom = 'ISOFLOOR HYDREPOX') THEN
    RETURN;
  END IF;

  INSERT INTO systemes (user_id, nom, famille, variante, usage, support, description, source_fiche, source_drive)
  VALUES (
    '74b6e2a3-5fc7-42f5-b100-0c7f17bbfa20',
    'ISOFLOOR HYDREPOX',
    'Peinture / protection de sol époxy en phase aqueuse',
    '2 couches',
    'Revêtement de sols béton intérieurs, neufs ou en rénovation - époxy bicomposant hydrodiluable, sans odeur (anciennement TITASOL HYDRO)',
    'Béton intérieur nettoyé, dégraissé, séché et aspiré, application en direct ; anciennes peintures adhérentes poncées',
    'Époxy bicomposant hydrodiluable (kit 10 kg : A 8,3 kg + B 1,7 kg), satiné brillant, 120 à 160 µm sec par couche. 1re couche diluée à 10 % d''eau, 2e non diluée, recouvrement 12 à 48 h. ≈ 0,37 kg/m² par couche à 120 µm sec (rendement théorique 2,7 m²/kg).',
    'FP_ISOFLOOR HYDREPOX.pdf',
    'OneDrive - ISOSIGN\Documents\ISOFLOOR\02 MARKETING\Fiches Produit\FP_ISOFLOOR HYDREPOX.pdf'
  )
  RETURNING id INTO sid;

  INSERT INTO systeme_composants (systeme_id, ordre, produit_id, libelle, role, consommation, obligatoire, condition, phrase_source) VALUES
    (sid, 1, '1c0d5a84-5e12-483c-a751-6c86c586bade', 'ISOFLOOR HYDREPOX', '1ère couche', 0.37, true,
     'diluée à 10 % d''eau ; 0,37 kg/m² à 120 µm sec, 0,49 kg/m² à 160 µm',
     'Conseil : appliquer une 1ère couche diluée à 10 % ; rendement pour 120 µm sec : 2,7 m²/kg'),
    (sid, 2, '1c0d5a84-5e12-483c-a751-6c86c586bade', 'ISOFLOOR HYDREPOX', '2ème couche', 0.37, true,
     'non diluée, 12 h minimum et 48 h maximum après la 1re couche',
     'puis, après séchage, appliquer une 2ème couche non diluée ; recouvrement par lui-même minimum 12 h, maximum 48 h');
END $$;
