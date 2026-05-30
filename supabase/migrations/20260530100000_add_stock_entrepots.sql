-- ─── Entrepôts multiples ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entrepots (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  nom         text        NOT NULL,
  adresse     text,
  ville       text,
  code_postal text,
  notes       text,
  est_defaut  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE entrepots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_entrepots" ON entrepots;
CREATE POLICY "users_own_entrepots" ON entrepots FOR ALL USING (auth.uid() = user_id);

-- ─── Stock par entrepôt ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_entrepot (
  produit_id  uuid    REFERENCES produits(id)   ON DELETE CASCADE,
  entrepot_id uuid    REFERENCES entrepots(id)  ON DELETE CASCADE,
  stock       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (produit_id, entrepot_id)
);
ALTER TABLE stock_entrepot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_stock_entrepot" ON stock_entrepot;
CREATE POLICY "users_own_stock_entrepot" ON stock_entrepot FOR ALL USING (
  EXISTS (
    SELECT 1 FROM entrepots e
    WHERE e.id = entrepot_id AND e.user_id = auth.uid()
  )
);

-- ─── Fournisseur : stockiste + délai d'expédition ──────────────────────────
ALTER TABLE fournisseurs
  ADD COLUMN IF NOT EXISTS est_stockiste   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS delai_expedition integer DEFAULT 0;

-- ─── Produit : propriétaire de la marchandise ──────────────────────────────
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS proprietaire                text DEFAULT 'isosign',
  ADD COLUMN IF NOT EXISTS proprietaire_fournisseur_id uuid;
