-- Flowfast 319 Concrete : la finition Flowfast 319 Clear devient optionnelle
-- (règle ISOSIGN, 16/11/2026), comme sur la fiche récap.
-- Retour arrière : obligatoire = true, condition NULL.
UPDATE systeme_composants SET
  obligatoire = false,
  condition = 'finition optionnelle : 0,15 à 0,4 kg/m² (0,4 maxi par couche)'
WHERE systeme_id = 'fa786360-071d-4828-bad4-9a39f6c2ce02' AND role = 'finition';
