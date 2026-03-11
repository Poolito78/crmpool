
CREATE TABLE public.produit_fournisseurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  fournisseur_id uuid NOT NULL REFERENCES public.fournisseurs(id) ON DELETE CASCADE,
  prix_achat numeric NOT NULL DEFAULT 0,
  reference_fournisseur text DEFAULT '',
  delai_livraison integer DEFAULT 0,
  conditionnement_min numeric DEFAULT 1,
  est_prioritaire boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(produit_id, fournisseur_id)
);

ALTER TABLE public.produit_fournisseurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own produit_fournisseurs" ON public.produit_fournisseurs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own produit_fournisseurs" ON public.produit_fournisseurs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own produit_fournisseurs" ON public.produit_fournisseurs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own produit_fournisseurs" ON public.produit_fournisseurs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
