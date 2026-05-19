-- Variantes produit (ex: RAL, granulométrie) avec options et ajustement de prix
ALTER TABLE public.produits
  ADD COLUMN IF NOT EXISTS variantes JSONB DEFAULT NULL;
