-- Consommation au mètre linéaire (joints, bandes, solins…).
-- `produits.consommation_ml` : kg par ml, à côté de `consommation` (kg/m²) —
-- un même article peut porter les deux. `devis.unite_surface` dit ce que
-- mesure la surface globale du devis : 'm2' (absent = m²) ou 'ml' ; en 'ml',
-- la quantité d'une ligne se calcule avec la conso au ml de l'article.
ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS consommation_ml numeric;
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS unite_surface text;
