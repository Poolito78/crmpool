-- Fiche récap d'un système (04/11/2026) : la synthèse ISOFLOOR d'un système
-- (couches, schémas, chiffres, liens vers les fiches), distincte de la fiche
-- système du fabricant. Proposée dans le mail d'envoi du devis et listée dans
-- le PDF du devis à côté de la fiche système.
ALTER TABLE systemes ADD COLUMN IF NOT EXISTS recap_url text;
ALTER TABLE systemes ADD COLUMN IF NOT EXISTS recap_label text;
