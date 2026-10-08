-- Liste noire du catalogue : un article supprimé ici ne doit plus être proposé
-- ni recréé par une lecture Odoo (analyse, recherche, import).
CREATE TABLE IF NOT EXISTS public.produits_supprimes (
  reference text PRIMARY KEY,          -- en MAJUSCULES : référence Odoo, sinon référence locale
  reference_odoo text,
  description text,
  supprime_le timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.produits_supprimes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Catalogue partagé : liste noire" ON public.produits_supprimes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
