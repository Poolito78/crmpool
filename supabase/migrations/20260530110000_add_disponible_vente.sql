-- Disponibilité à la vente (visible dans liste stock)
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS disponible_vente boolean NOT NULL DEFAULT true;
