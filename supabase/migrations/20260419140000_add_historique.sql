CREATE TABLE IF NOT EXISTS public.historique (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  entite_type TEXT NOT NULL,
  entite_id TEXT NOT NULL,
  entite_numero TEXT,
  action TEXT NOT NULL,
  details JSONB,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS historique_user_id_idx ON historique(user_id);
CREATE INDEX IF NOT EXISTS historique_entite_type_idx ON historique(entite_type);
CREATE INDEX IF NOT EXISTS historique_date_idx ON historique(date DESC);

ALTER TABLE historique ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own historique"
  ON historique FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
