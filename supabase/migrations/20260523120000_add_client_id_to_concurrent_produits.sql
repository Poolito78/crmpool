ALTER TABLE concurrent_produits
  ADD COLUMN IF NOT EXISTS client_id UUID;
