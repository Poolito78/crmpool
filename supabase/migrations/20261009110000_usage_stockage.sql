-- Quotas d'utilisation (Paramètres → Quotas) : taille de la base et détail
-- des fichiers de tous les seaux. Réservé aux administrateurs (veille_roles).
CREATE OR REPLACE FUNCTION public.usage_stockage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  resultat jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.veille_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT jsonb_build_object(
    'base_octets', pg_database_size(current_database()),
    'tables', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('nom', t.relname, 'octets', t.taille) ORDER BY t.taille DESC)
      FROM (SELECT c.relname, pg_total_relation_size(c.oid) AS taille
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'
            ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 15) t
    ), '[]'::jsonb),
    'seaux', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('seau', s.bucket_id, 'fichiers', s.n, 'octets', s.o) ORDER BY s.o DESC)
      FROM (SELECT bucket_id, count(*) AS n, COALESCE(sum((metadata->>'size')::bigint), 0) AS o
            FROM storage.objects GROUP BY bucket_id) s
    ), '[]'::jsonb),
    'fichiers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('seau', f.bucket_id, 'nom', f.name, 'octets', (f.metadata->>'size')::bigint, 'date', f.created_at))
      FROM (SELECT bucket_id, name, metadata, created_at FROM storage.objects
            ORDER BY (metadata->>'size')::bigint DESC NULLS LAST LIMIT 100) f
    ), '[]'::jsonb)
  ) INTO resultat;
  RETURN resultat;
END;
$$;

REVOKE ALL ON FUNCTION public.usage_stockage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.usage_stockage() TO authenticated;
