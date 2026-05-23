-- Veille concurrence : tables partagées entre tous les utilisateurs authentifiés
-- created_by / created_by_email permettent de tracer qui a fourni l'info

-- Table principale : fiches concurrents
CREATE TABLE IF NOT EXISTS concurrents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom              TEXT NOT NULL,
  site_web         TEXT,
  email            TEXT,
  telephone        TEXT,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Table : produits concurrents, avec lien optionnel à notre catégorie/produit
CREATE TABLE IF NOT EXISTS concurrent_produits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concurrent_id    UUID NOT NULL REFERENCES concurrents(id) ON DELETE CASCADE,
  nom              TEXT NOT NULL,
  reference        TEXT,
  categorie        TEXT,
  prix_ht          DECIMAL(12, 2),
  description      TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Table : notes et observations de veille
CREATE TABLE IF NOT EXISTS concurrent_notes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concurrent_id    UUID NOT NULL REFERENCES concurrents(id) ON DELETE CASCADE,
  titre            TEXT NOT NULL,
  contenu          TEXT,
  source           TEXT,
  date_note        DATE DEFAULT CURRENT_DATE,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- RLS : toutes les tables sont accessibles par tous les utilisateurs authentifiés
-- (base de connaissance partagée, non isolée par user_id)
ALTER TABLE concurrents ENABLE ROW LEVEL SECURITY;
ALTER TABLE concurrent_produits ENABLE ROW LEVEL SECURITY;
ALTER TABLE concurrent_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "concurrents_all_auth" ON concurrents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "concurrent_produits_all_auth" ON concurrent_produits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "concurrent_notes_all_auth" ON concurrent_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Index pour les jointures fréquentes
CREATE INDEX IF NOT EXISTS idx_concurrent_produits_concurrent_id ON concurrent_produits(concurrent_id);
CREATE INDEX IF NOT EXISTS idx_concurrent_notes_concurrent_id ON concurrent_notes(concurrent_id);
CREATE INDEX IF NOT EXISTS idx_concurrents_nom ON concurrents(nom);
