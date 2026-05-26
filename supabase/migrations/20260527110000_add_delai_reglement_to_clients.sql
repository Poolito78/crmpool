-- Add delai_reglement column to clients table
-- Stores the payment terms preset (Comptant, 30J, 30J FDM, 45J, 45J FDM)
-- so the devis form can auto-fill conditions de règlement when client is selected

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS delai_reglement TEXT DEFAULT '45J FDM';
