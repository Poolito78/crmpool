-- Produits de configuration pour les surcharges énergie
-- prixHT = taux de vente (%), prixAchat = taux d'achat (%), unite = '%'
-- Ces produits n'apparaissent pas dans les lignes de devis — ils servent uniquement
-- à configurer les taux depuis la page Produits.

INSERT INTO produits (id, user_id, reference, description, prix_achat, coefficient, prix_ht, coeff_revendeur, remise_revendeur, prix_revendeur, tva, unite, stock, stock_min, categorie, date_creation)
SELECT
  gen_random_uuid(), user_id,
  'SURCHARGE_ENERGIE_MMA', 'Surcharge énergie MMA',
  14.8, 1, 15, 1, 0, 15, 20, '%', 0, 0, 'surcharge', now()
FROM (SELECT DISTINCT user_id FROM produits LIMIT 1) u
ON CONFLICT (reference) DO NOTHING;

INSERT INTO produits (id, user_id, reference, description, prix_achat, coefficient, prix_ht, coeff_revendeur, remise_revendeur, prix_revendeur, tva, unite, stock, stock_min, categorie, date_creation)
SELECT
  gen_random_uuid(), user_id,
  'SURCHARGE_ENERGIE_HORS_MMA', 'Surcharge énergie hors MMA',
  4.8, 1, 5, 1, 0, 5, 20, '%', 0, 0, 'surcharge', now()
FROM (SELECT DISTINCT user_id FROM produits LIMIT 1) u
ON CONFLICT (reference) DO NOTHING;
