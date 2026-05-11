-- ── Factures client ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.factures_client (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero               TEXT        NOT NULL,
  client_id            UUID        NOT NULL REFERENCES public.clients(id),
  commande_client_id   UUID        REFERENCES public.commandes_client(id),
  devis_id             UUID        REFERENCES public.devis(id),
  date_creation        DATE        NOT NULL DEFAULT CURRENT_DATE,
  date_echeance        DATE,
  date_paiement        DATE,
  statut               TEXT        NOT NULL DEFAULT 'brouillon',
  lignes               JSONB       NOT NULL DEFAULT '[]',
  total_ht             NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_tva            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_ttc            NUMERIC(12,2) NOT NULL DEFAULT 0,
  frais_port_ht        NUMERIC(12,2) NOT NULL DEFAULT 0,
  reference_affaire    TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.factures_client ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users manage their factures_client" ON public.factures_client;
  CREATE POLICY "Users manage their factures_client" ON public.factures_client
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

CREATE INDEX IF NOT EXISTS factures_client_user_idx    ON public.factures_client (user_id);
CREATE INDEX IF NOT EXISTS factures_client_client_idx  ON public.factures_client (client_id);
CREATE INDEX IF NOT EXISTS factures_client_statut_idx  ON public.factures_client (statut);

-- ── Factures fournisseur ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.factures_fournisseur (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero                    TEXT        NOT NULL,
  numero_facture            TEXT        NOT NULL DEFAULT '',
  fournisseur_id            UUID        NOT NULL REFERENCES public.fournisseurs(id),
  commande_fournisseur_id   UUID        REFERENCES public.commandes_fournisseur(id),
  date_reception            DATE        NOT NULL DEFAULT CURRENT_DATE,
  date_echeance             DATE,
  date_paiement             DATE,
  statut                    TEXT        NOT NULL DEFAULT 'reçue',
  montant_ht                NUMERIC(12,2) NOT NULL DEFAULT 0,
  montant_tva               NUMERIC(12,2) NOT NULL DEFAULT 0,
  montant_ttc               NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.factures_fournisseur ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users manage their factures_fournisseur" ON public.factures_fournisseur;
  CREATE POLICY "Users manage their factures_fournisseur" ON public.factures_fournisseur
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

CREATE INDEX IF NOT EXISTS factures_fourn_user_idx    ON public.factures_fournisseur (user_id);
CREATE INDEX IF NOT EXISTS factures_fourn_fourn_idx   ON public.factures_fournisseur (fournisseur_id);
CREATE INDEX IF NOT EXISTS factures_fourn_statut_idx  ON public.factures_fournisseur (statut);
