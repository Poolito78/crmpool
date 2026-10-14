-- Règle du 14/10/2026 : le prix public d'un article ISOMARK / ISOFLOOR est
-- celui de la FICHE (`prix_ht`), plus jamais `prix_tarif` (`prixGamme`).
-- Les pavés à coller portaient un public Odoo faux (96,96 € au lieu de
-- 67,86 €, règle du 28/09) : on recopie le tarif ISOMARK du 15/07/2026 dans
-- la fiche, daté d'aujourd'hui — le prix le plus récent l'emporte sur Odoo.
UPDATE public.produits
SET prix_ht = prix_tarif,
    prix_vente_maj = now()
WHERE source_tarif ILIKE 'ISOMARK 15-07-2026%'
  AND reference LIKE 'PAVPREF%'
  AND prix_tarif IS NOT NULL
  AND abs(prix_tarif - prix_ht) > 0.01;
