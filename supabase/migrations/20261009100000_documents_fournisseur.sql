-- Mini-GED fournisseurs : les PDF / courriels glissés dans l'Analyse se rangent
-- sur la fiche du fournisseur (devis, commande, BL, facture, autre).
CREATE TABLE IF NOT EXISTS public.documents_fournisseur (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  fournisseur_id TEXT        NOT NULL,
  genre          TEXT        NOT NULL CHECK (genre IN ('devis', 'commande', 'bon_livraison', 'facture', 'autre')),
  libelle        TEXT,
  numero         TEXT,
  date_document  DATE,
  montant_ht     NUMERIC,
  fichier_nom    TEXT        NOT NULL,
  fichier_path   TEXT        NOT NULL,
  fichier_taille BIGINT,
  fichier_mime   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documents_fournisseur_idx
  ON public.documents_fournisseur (user_id, fournisseur_id, created_at DESC);

ALTER TABLE public.documents_fournisseur ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own documents_fournisseur" ON public.documents_fournisseur;
CREATE POLICY "Users manage their own documents_fournisseur"
  ON public.documents_fournisseur FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ged-fournisseurs', 'ged-fournisseurs', false, 26214400, NULL)  -- 25 Mo
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "ged_fournisseurs_insert" ON storage.objects;
CREATE POLICY "ged_fournisseurs_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'ged-fournisseurs' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "ged_fournisseurs_select" ON storage.objects;
CREATE POLICY "ged_fournisseurs_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'ged-fournisseurs' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "ged_fournisseurs_delete" ON storage.objects;
CREATE POLICY "ged_fournisseurs_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'ged-fournisseurs' AND auth.uid()::text = (storage.foldername(name))[1]);
