-- Transport choisi sur le devis, fournisseur par fournisseur (24 oct. 2026)
--
-- `choix_transport` : { "<fournisseur_id>": "messagerie" | "affretement:2", … }
--                     Le transport retenu parmi ceux que les grilles de la
--                     fiche fournisseur chiffrent pour la destination
--                     (`optionsTransport`, portReel.ts) : son prix devient le
--                     coût du port, et la marge après port suit. NULL / clé
--                     absente = calcul automatique.
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS choix_transport jsonb;
