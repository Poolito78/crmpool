-- `produits` sort de la publication Realtime (23 oct. 2026)
--
-- La base (plan gratuit, CPU bridé) était saturée : la requête de lecture du
-- WAL par Realtime est la première des statistiques (2,5 M d'appels, ~22 000 s
-- cumulées, jusqu'à 16 s) et `produits` — lignes de 4 Ko, 858 000 mises à jour
-- par la synchro Odoo de nuit — en est la cause. Le catalogue lisait alors à
-- 0,9 s la tranche en moyenne, 7,7 s au pire, pour 8 s de statement_timeout.
--
-- Le catalogue se met à jour AU CHARGEMENT, par différence : `updated_at`
-- (trigger, 20261011120000) et `produits_effaces`. Plus de mise à jour en
-- direct d'un appareil à l'autre : on actualise la page.
--
-- ⚠️ À déployer APRÈS le client qui ne s'abonne plus à `produits` : s'abonner
-- à une table absente de la publication fait refuser tout le canal.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'produits'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.produits;
  END IF;
END $$;
