
-- Table commandes fournisseur
CREATE TABLE public.commandes_fournisseur (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  devis_id UUID REFERENCES public.devis(id) ON DELETE SET NULL,
  fournisseur_id UUID NOT NULL REFERENCES public.fournisseurs(id) ON DELETE CASCADE,
  numero TEXT NOT NULL DEFAULT '',
  date_creation TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  statut TEXT NOT NULL DEFAULT 'en_attente',
  lignes JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_ht NUMERIC NOT NULL DEFAULT 0,
  frais_transport NUMERIC NOT NULL DEFAULT 0,
  total_ttc NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.commandes_fournisseur ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own commandes" ON public.commandes_fournisseur FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own commandes" ON public.commandes_fournisseur FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own commandes" ON public.commandes_fournisseur FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own commandes" ON public.commandes_fournisseur FOR DELETE TO authenticated USING (auth.uid() = user_id);
