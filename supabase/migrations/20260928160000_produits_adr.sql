-- Matière dangereuse (ADR) sur la fiche article.
--
-- Le tarif ISOMARK du 15/07/2026 (page 2) : « Transport offert à partir de
-- 1000,00 € HT (Hors ADR) — en deçà, frais de transport : 51,00 € » pour le
-- H2. Règle du chargé d'affaires (28/09/2026) : un envoi H2 qui contient un
-- produit ADR se paie à la GRILLE AU POIDS (1-25 kg 51 €, 26-100 kg 87 €,
-- 101-700 kg 178 €, 701+ 235 €), sans franco.
--
-- NULL = non renseigné, traité comme non ADR : on ne devine pas qu'un article
-- est dangereux. La colle Eclipse (méthacrylate + durcisseur) l'est.

alter table public.produits add column if not exists adr boolean;

update public.produits set adr = true where reference in ('ECLIPSE25', 'ECLIPSE');
