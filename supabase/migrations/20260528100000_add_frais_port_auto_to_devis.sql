-- Persiste l'état de la case "Auto (selon poids)" pour les frais de port
-- Permet de distinguer "explicitement désactivé" de "jamais renseigné"
ALTER TABLE devis ADD COLUMN IF NOT EXISTS frais_port_auto boolean;
