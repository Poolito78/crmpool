-- Tarifs dégressifs par fournisseur sur un produit
-- Stockés en JSONB : [{ "qteMin": 10, "prixAchat": 8.50 }, ...]
ALTER TABLE produit_fournisseurs ADD COLUMN IF NOT EXISTS paliers_fournisseur jsonb;
