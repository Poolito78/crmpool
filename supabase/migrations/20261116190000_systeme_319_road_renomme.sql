-- « Flowfast 319 Route » renommé « Flowfast 319 Road » (16/11/2026), le nom du
-- produit et de sa fiche récap. Les libellés des fiches suivent
-- (libelleFicheSysteme / libelleFicheRecap).
-- Une demande qui dit « 319 route » sans « road » n'est plus reconnue par les
-- mots du nom ; les devis modèles s'appellent déjà « FLowfast … 319 Road ».
-- Retour arrière : nom 'Flowfast 319 Route', libellés « … - Flowfast 319 Route ».
UPDATE systemes SET
  nom = 'Flowfast 319 Road',
  fiche_label = 'Fiche Système - Flowfast 319 Road',
  recap_label = 'Fiche récap - Flowfast 319 Road',
  updated_at = now()
WHERE id = 'acf3f02a-2f04-45f5-86e5-e0066b36738a';
