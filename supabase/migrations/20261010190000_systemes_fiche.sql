-- Fiche d'un système de mise en œuvre : le document (PDF) que le client reçoit
-- avec le devis quand le système est l'objet du devis.
ALTER TABLE public.systemes ADD COLUMN IF NOT EXISTS fiche_url text;
ALTER TABLE public.systemes ADD COLUMN IF NOT EXISTS fiche_label text;
ALTER TABLE public.systemes ADD COLUMN IF NOT EXISTS fiche_mention text;
