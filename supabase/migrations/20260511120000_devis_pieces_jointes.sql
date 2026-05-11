-- Table notes et pièces jointes des devis
CREATE TABLE IF NOT EXISTS public.devis_pieces_jointes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  devis_id     TEXT        NOT NULL,
  type         TEXT        NOT NULL CHECK (type IN ('note', 'fichier')),
  contenu      TEXT,                        -- texte de la note
  fichier_nom  TEXT,                        -- nom original du fichier
  fichier_url  TEXT,                        -- URL signée / publique Supabase Storage
  fichier_taille BIGINT,                    -- octets
  fichier_mime TEXT,                        -- MIME type
  date         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS devis_pj_user_devis_idx ON public.devis_pieces_jointes (user_id, devis_id);
CREATE INDEX IF NOT EXISTS devis_pj_date_idx       ON public.devis_pieces_jointes (date DESC);

ALTER TABLE public.devis_pieces_jointes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own devis_pieces_jointes"
  ON public.devis_pieces_jointes FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Bucket Supabase Storage pour les fichiers joints aux devis
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'devis-pj',
  'devis-pj',
  false,
  52428800,   -- 50 Mo max par fichier
  NULL        -- tous types acceptés
)
ON CONFLICT (id) DO NOTHING;

-- Policies Storage
CREATE POLICY "Users upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'devis-pj'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users read own files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'devis-pj'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'devis-pj'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
