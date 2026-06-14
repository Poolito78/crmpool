-- ============================================================================
-- Multi-utilisateur : catalogue partagé + périmètre commercial (admin = tout)
--
-- Avant : toutes les tables étaient en RLS « own-only » (auth.uid() = user_id),
-- ce qui (1) cachait les produits de l'admin aux invités et (2) empêchait l'admin
-- de voir les devis/clients des invités.
--
-- Après :
--  - Référentiel partagé (produits, produit_fournisseurs, fournisseurs,
--    entrepots) : lecture/écriture par tout utilisateur authentifié.
--  - Données commerciales (clients, devis, commandes_client, factures_client,
--    commandes_fournisseur, factures_fournisseur) : chacun voit/édite les siennes,
--    l'admin (get_my_veille_role() = 'admin') voit/édite tout.
--
-- Idempotent : on supprime toutes les policies existantes de chaque table avant
-- de recréer. À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

-- Supprime toutes les policies d'une liste de tables
DO $$
DECLARE
  t text;
  p record;
  tables text[] := ARRAY[
    'produits','produit_fournisseurs','fournisseurs','entrepots',
    'clients','devis','commandes_client','factures_client',
    'commandes_fournisseur','factures_fournisseur'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
        EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- ---------- Référentiel partagé : tout authentifié lit et écrit ----------
DO $$
DECLARE
  t text;
  shared text[] := ARRAY['produits','produit_fournisseurs','fournisseurs','entrepots'];
BEGIN
  FOREACH t IN ARRAY shared LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY "shared read write" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;

-- ---------- Données commerciales : propriétaire OU admin ----------
DO $$
DECLARE
  t text;
  owned text[] := ARRAY[
    'clients','devis','commandes_client','factures_client',
    'commandes_fournisseur','factures_fournisseur'
  ];
BEGIN
  FOREACH t IN ARRAY owned LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY "owner or admin" ON public.%I FOR ALL TO authenticated '
        'USING (auth.uid() = user_id OR get_my_veille_role() = ''admin'') '
        'WITH CHECK (auth.uid() = user_id OR get_my_veille_role() = ''admin'')', t);
    END IF;
  END LOOP;
END $$;
