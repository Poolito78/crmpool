-- Create devis message templates table
CREATE TABLE IF NOT EXISTS devis_message_templates (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  nom text NOT NULL,
  contenu text NOT NULL,
  raison_archive text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE devis_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own templates" ON devis_message_templates
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_devis_message_templates_user ON devis_message_templates(user_id);
