
CREATE TABLE public.commandes_client (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  devis_id UUID REFERENCES public.devis(id) ON DELETE SET NULL,
  client_id UUID NOT NULL,
  numero TEXT NOT NULL DEFAULT '',
  date_creation TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  statut TEXT NOT NULL DEFAULT 'accuse_envoye',
  lignes JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_ht NUMERIC NOT NULL DEFAULT 0,
  total_tva NUMERIC NOT NULL DEFAULT 0,
  total_ttc NUMERIC NOT NULL DEFAULT 0,
  frais_port_ht NUMERIC NOT NULL DEFAULT 0,
  reference_affaire TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.commandes_client ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own commandes_client" ON public.commandes_client FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own commandes_client" ON public.commandes_client FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own commandes_client" ON public.commandes_client FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own commandes_client" ON public.commandes_client FOR DELETE TO authenticated USING (auth.uid() = user_id);
