-- Flowfast 319 Route (Road) : pas de primaire sur enrobé (règle ISOSIGN,
-- 16/11/2026). Le primaire n'existe que dans les systèmes sur béton
-- (Flowfast 319 Concrete / 319C). La fiche récap ne le montre plus.
--
-- Retour arrière : réinsérer le composant ordre 1, produit FLOWFAST107
-- ('0ba104a7-5488-423a-8207-e331c652b5fa'), libellé 'Flowfast 107 ou 108 Primer',
-- rôle 'primaire', consommation 0.35, obligatoire false.
DELETE FROM systeme_composants
WHERE systeme_id = 'acf3f02a-2f04-45f5-86e5-e0066b36738a' AND role = 'primaire';

UPDATE systemes SET
  support = 'Enrobé ayant ressué au moins 1 mois, sans primaire. Sur béton : système Flowfast 319 Concrete.',
  updated_at = now()
WHERE id = 'acf3f02a-2f04-45f5-86e5-e0066b36738a';
