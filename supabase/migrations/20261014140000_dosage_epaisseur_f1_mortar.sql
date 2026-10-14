-- Mortier dosé selon l'épaisseur (src/lib/dosageEpaisseur.ts).
-- `produits.dosage_epaisseur` : conso du mélange en kg/m² par mm, et paliers
-- d'épaisseur MINIMALE avec les granulats à ajouter PAR KIT.
ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS dosage_epaisseur jsonb;

-- Flowfast F1 Mortar (FLOWFASTF1, kit 20 kg = poudre 17,8 + liquide 2,2).
-- Fiche produit Tremco CPG 11/2021 : 2,12 kg/m² par mm, tableau des charges.
-- Les granulats n'ont pas d'article au catalogue : pas de produitId, la ligne
-- part libre, prix à saisir.
UPDATE public.produits SET
  dosage_epaisseur = '{
    "kgM2ParMm": 2.12,
    "source": "Fiche produit Flowfast F1 Mortar (Tremco CPG, 11/2021)",
    "paliers": [
      {"epaisseurMinMm": 6, "ajouts": []},
      {"epaisseurMinMm": 25, "ajouts": [
        {"libelle": "Sable de quartz 2-8 mm", "kgParKit": 8}]},
      {"epaisseurMinMm": 50, "ajouts": [
        {"libelle": "Sable de quartz 2-8 mm", "kgParKit": 3},
        {"libelle": "Agrégat de quartz 8-16 mm", "kgParKit": 12}]},
      {"epaisseurMinMm": 120, "ajouts": [
        {"libelle": "Sable de quartz 2-8 mm", "kgParKit": 4.8},
        {"libelle": "Agrégat de quartz 8-16 mm", "kgParKit": 6.4},
        {"libelle": "Agrégat de quartz 16-32 mm", "kgParKit": 8}]}
    ]
  }'::jsonb,
  -- Consommation du KIT (kg/m²) à l'épaisseur minimale de chaque palier :
  -- 2,12 × ép. × 20 / (20 + granulats du kit) — `consommationsParPalier`.
  consommations = '[
    {"valeur": 12.72,   "usage": "Épaisseur 6 mm — mortier seul"},
    {"valeur": 37.857,  "usage": "Épaisseur 25 mm — chargé : + 8 kg 2-8 mm par kit"},
    {"valeur": 60.571,  "usage": "Épaisseur 50 mm — chargé : + 3 kg 2-8 mm + 12 kg 8-16 mm par kit"},
    {"valeur": 129.796, "usage": "Épaisseur 120 mm — chargé : + 4,8 kg 2-8 mm + 6,4 kg 8-16 mm + 8 kg 16-32 mm par kit"}
  ]'::jsonb
WHERE reference = 'FLOWFASTF1';
