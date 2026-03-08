
-- Clients table
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nom TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  telephone TEXT NOT NULL DEFAULT '',
  adresse TEXT NOT NULL DEFAULT '',
  ville TEXT NOT NULL DEFAULT '',
  code_postal TEXT NOT NULL DEFAULT '',
  societe TEXT,
  notes TEXT,
  est_revendeur BOOLEAN DEFAULT false,
  remises_par_categorie JSONB DEFAULT '{}',
  adresses_livraison JSONB DEFAULT '[]',
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fournisseurs table
CREATE TABLE public.fournisseurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nom TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  telephone TEXT NOT NULL DEFAULT '',
  adresse TEXT NOT NULL DEFAULT '',
  ville TEXT NOT NULL DEFAULT '',
  code_postal TEXT NOT NULL DEFAULT '',
  societe TEXT NOT NULL DEFAULT '',
  notes TEXT,
  franco_port NUMERIC NOT NULL DEFAULT 0,
  cout_transport NUMERIC NOT NULL DEFAULT 0,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Produits table
CREATE TABLE public.produits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  description_detaillee TEXT,
  prix_achat NUMERIC NOT NULL DEFAULT 0,
  coefficient NUMERIC NOT NULL DEFAULT 1,
  prix_ht NUMERIC NOT NULL DEFAULT 0,
  coeff_revendeur NUMERIC NOT NULL DEFAULT 1,
  remise_revendeur NUMERIC NOT NULL DEFAULT 0,
  prix_revendeur NUMERIC NOT NULL DEFAULT 0,
  tva NUMERIC NOT NULL DEFAULT 20,
  unite TEXT NOT NULL DEFAULT 'pièce',
  poids NUMERIC,
  consommation NUMERIC,
  stock NUMERIC NOT NULL DEFAULT 0,
  stock_min NUMERIC NOT NULL DEFAULT 0,
  fournisseur_id UUID REFERENCES public.fournisseurs(id) ON DELETE SET NULL,
  categorie TEXT,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Devis table
CREATE TABLE public.devis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  numero TEXT NOT NULL DEFAULT '',
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  adresse_livraison_id TEXT,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_validite TIMESTAMPTZ,
  statut TEXT NOT NULL DEFAULT 'brouillon',
  lignes JSONB NOT NULL DEFAULT '[]',
  reference_affaire TEXT,
  notes TEXT,
  conditions TEXT,
  frais_port_ht NUMERIC DEFAULT 0,
  frais_port_tva NUMERIC DEFAULT 20,
  mode_calcul TEXT DEFAULT 'standard',
  surface_globale_m2 NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fournisseurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devis ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own data
CREATE POLICY "Users can view own clients" ON public.clients FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own clients" ON public.clients FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own clients" ON public.clients FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can view own fournisseurs" ON public.fournisseurs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own fournisseurs" ON public.fournisseurs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own fournisseurs" ON public.fournisseurs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own fournisseurs" ON public.fournisseurs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can view own produits" ON public.produits FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own produits" ON public.produits FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own produits" ON public.produits FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own produits" ON public.produits FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can view own devis" ON public.devis FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own devis" ON public.devis FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own devis" ON public.devis FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own devis" ON public.devis FOR DELETE TO authenticated USING (auth.uid() = user_id);
