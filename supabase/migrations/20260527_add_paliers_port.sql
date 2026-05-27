-- Frais de port dégressifs par fournisseur (lien produit-fournisseur)
-- Stockés en JSONB : [{ "montantMin": 100, "coutTransport": 8 }, { "montantMin": 300, "coutTransport": 0 }, ...]
ALTER TABLE produit_fournisseurs ADD COLUMN IF NOT EXISTS paliers_port jsonb;
