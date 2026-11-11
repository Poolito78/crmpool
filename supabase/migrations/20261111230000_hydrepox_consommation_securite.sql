-- ISOFLOOR HYDREPOX (11/11/2026, règle ISOSIGN) : la fiche produit donne
-- 0,37 kg/m² en 2 couches ; on chiffre 0,50 kg/m² en 2 couches par sécurité,
-- soit 0,25 kg/m² par couche (la fiche récap dit la même chose).
-- Retour arrière : consommation 0.37 sur les deux composants.
UPDATE systeme_composants c SET
  consommation = 0.25,
  condition = CASE c.ordre
    WHEN 1 THEN 'diluée à 10 % d''eau ; 0,25 kg/m² (0,50 kg/m² en 2 couches par sécurité, fiche : 0,37 kg/m² en 2 couches)'
    ELSE 'non diluée, 12 h minimum et 48 h maximum après la 1re couche ; 0,25 kg/m²'
  END,
  phrase_source = CASE c.ordre
    WHEN 1 THEN 'Conseil : appliquer une 1ère couche diluée à 10 % ; consommation 0,37 kg/m² en 2 couches, 0,50 retenu par sécurité (ISOSIGN, 11/11/2026)'
    ELSE c.phrase_source
  END
FROM systemes s
WHERE s.id = c.systeme_id AND s.nom = 'ISOFLOOR HYDREPOX';

UPDATE systemes SET
  description = 'Époxy bicomposant hydrodiluable (kit 10 kg : A 8,3 kg + B 1,7 kg), satiné brillant, 120 à 160 µm sec par couche. 1re couche diluée à 10 % d''eau, 2e non diluée, recouvrement 12 à 48 h. Fiche : 0,37 kg/m² en 2 couches ; chiffré à 0,50 kg/m² (0,25 par couche) par sécurité, ≈ 20 m² par kit.',
  updated_at = now()
WHERE nom = 'ISOFLOOR HYDREPOX';
