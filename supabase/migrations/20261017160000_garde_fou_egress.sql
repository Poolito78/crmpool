-- ════════════════════════════════════════════════════════════════════════
-- Garde-fou du quota Supabase (règle du 17/10/2026 : « bloquer avant la
-- limite pour ne jamais avoir de restriction »).
--
-- Plan gratuit : 5 Go d'egress par cycle (du 14 au 14). Septembre a fini à
-- 5,93 Go. La base ne voit pas l'egress réel : l'application compte ce
-- qu'elle reçoit (taille décompressée, donc au-dessus du réel) et le note
-- ici. Au-delà du SEUIL du cycle, le MODE ÉCONOMIE s'enclenche seul :
--   - l'application coupe le temps réel (on actualise la page à la main) ;
--   - les tâches de nuit (stock Odoo, grilles) ne partent plus.
-- Le CRM reste utilisable. Le mode se lève seul au cycle suivant, ou à la
-- main (Paramètres → Quotas).
--
-- Une tâche planifiée relit chaque lundi le chiffre RÉEL sur la page d'usage
-- de Supabase et peut forcer le mode (`mode_economie = 'force'`).
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.parametres_app (
  cle        TEXT PRIMARY KEY,
  valeur     TEXT,
  maj_le     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.parametres_app ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "parametres_app lecture" ON public.parametres_app;
CREATE POLICY "parametres_app lecture" ON public.parametres_app FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "parametres_app admin" ON public.parametres_app;
CREATE POLICY "parametres_app admin" ON public.parametres_app FOR ALL TO authenticated
  USING (get_my_veille_role() = 'admin') WITH CHECK (get_my_veille_role() = 'admin');

-- 3,5 Go mesurés par l'application : marge pour ce qu'elle ne voit pas
-- (fonctions Edge, stockage, temps réel) sur un plafond de 5 Go.
INSERT INTO public.parametres_app (cle, valeur) VALUES
  ('seuil_egress_octets', '3500000000'),
  ('mode_economie', 'auto'),          -- 'auto' | 'force' | 'off'
  ('egress_reel_go', NULL),           -- relevé hebdomadaire de la page d'usage
  ('jour_debut_cycle', '14')
ON CONFLICT (cle) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.conso_egress (
  jour     DATE   NOT NULL DEFAULT current_date,
  user_id  UUID   NOT NULL DEFAULT auth.uid(),
  octets   BIGINT NOT NULL DEFAULT 0,
  requetes INT    NOT NULL DEFAULT 0,
  PRIMARY KEY (jour, user_id)
);
ALTER TABLE public.conso_egress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conso_egress admin lecture" ON public.conso_egress;
CREATE POLICY "conso_egress admin lecture" ON public.conso_egress FOR SELECT TO authenticated
  USING (get_my_veille_role() = 'admin' OR auth.uid() = user_id);

-- Début du cycle de facturation en cours (le 14 par défaut).
CREATE OR REPLACE FUNCTION public.debut_cycle_quota()
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH j AS (SELECT coalesce((SELECT valeur::int FROM public.parametres_app WHERE cle = 'jour_debut_cycle'), 14) AS d)
  SELECT CASE WHEN extract(day FROM current_date) >= j.d
              THEN make_date(extract(year FROM current_date)::int, extract(month FROM current_date)::int, j.d)
              ELSE (make_date(extract(year FROM current_date)::int, extract(month FROM current_date)::int, j.d) - interval '1 month')::date
         END
  FROM j;
$$;

-- État du quota, lu par l'application et par les tâches de nuit.
CREATE OR REPLACE FUNCTION public.etat_quota()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH p AS (
    SELECT
      coalesce((SELECT valeur FROM public.parametres_app WHERE cle = 'mode_economie'), 'auto') AS mode,
      coalesce((SELECT valeur::bigint FROM public.parametres_app WHERE cle = 'seuil_egress_octets'), 3500000000) AS seuil,
      (SELECT valeur FROM public.parametres_app WHERE cle = 'egress_reel_go') AS reel
  ), c AS (
    SELECT coalesce(sum(octets), 0)::bigint AS mesure FROM public.conso_egress WHERE jour >= public.debut_cycle_quota()
  )
  SELECT jsonb_build_object(
    'mode', p.mode,
    'seuil', p.seuil,
    'mesure', c.mesure,
    'reel_go', p.reel,
    'debut_cycle', public.debut_cycle_quota(),
    'economie', p.mode = 'force' OR (p.mode = 'auto' AND c.mesure >= p.seuil)
  ) FROM p, c;
$$;
GRANT EXECUTE ON FUNCTION public.etat_quota() TO authenticated;

CREATE OR REPLACE FUNCTION public.mode_economie()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (public.etat_quota() ->> 'economie')::boolean;
$$;

-- L'application note ce qu'elle a reçu ; la réponse dit s'il faut économiser.
CREATE OR REPLACE FUNCTION public.noter_egress(p_octets bigint, p_requetes int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié.'; END IF;
  IF p_octets > 0 THEN
    -- Borne : un appel ne déclare jamais plus de 500 Mo (un compteur affolé
    -- ne doit pas mettre tout le monde en économie).
    INSERT INTO public.conso_egress (jour, user_id, octets, requetes)
    VALUES (current_date, auth.uid(), least(p_octets, 500000000), greatest(p_requetes, 0))
    ON CONFLICT (jour, user_id) DO UPDATE
      SET octets = conso_egress.octets + excluded.octets,
          requetes = conso_egress.requetes + excluded.requetes;
  END IF;
  RETURN public.etat_quota();
END $$;
GRANT EXECUTE ON FUNCTION public.noter_egress(bigint, int) TO authenticated;

-- Les tâches de nuit ne partent plus en mode économie.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stock-odoo-nuit') THEN
    PERFORM cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'stock-odoo-nuit'),
      command := 'select public.lancer_stock_odoo() where not public.mode_economie()');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'synchro-grilles-nuit') THEN
    PERFORM cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'synchro-grilles-nuit'),
      command := 'select public.lancer_synchro_grilles() where not public.mode_economie()');
  END IF;
END $$;
