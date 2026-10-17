-- ════════════════════════════════════════════════════════════════════════
-- Multi-société (règle du 17/10/2026)
--
-- ISOSIGN (marques ISOSIGN, ISOFLOOR, ISOMARK, STI), SIGNALISE (marque
-- 4FLOORS), FORFLOOR. Clients et catalogue communs ; devis, commandes et
-- factures rattachés à une société, qui donne logo, pied de page, émetteur
-- et séries de numéros. Odoo : ISOSIGN seulement.
--
-- Droits : l'admin voit tout ; un autre compte ne voit que les documents de
-- SA société (utilisateur_societes, ISOSIGN par défaut) — et seulement les
-- siens, comme avant.
--
-- ⚠️ À passer APRÈS 20261017120000_facturation_conforme.sql.
-- ⚠️ Les identités légales de SIGNALISE et FORFLOOR sont créées VIDES : on ne
--    les invente pas. Les saisir en Paramètres → Sociétés ; l'émission d'une
--    facture est refusée tant que SIREN, TVA et adresse manquent.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.societes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT        NOT NULL UNIQUE,
  raison_sociale  TEXT        NOT NULL,
  forme_juridique TEXT,
  capital         TEXT,
  adresse         TEXT,
  code_postal     TEXT,
  ville           TEXT,
  pays            TEXT        NOT NULL DEFAULT 'FR',
  siren           TEXT,
  siret           TEXT,
  rcs             TEXT,
  ape             TEXT,
  tva_intra       TEXT,
  email           TEXT,
  telephone       TEXT,
  fax             TEXT,
  site_web        TEXT,
  prefixe         TEXT        NOT NULL DEFAULT '',
  odoo            BOOLEAN     NOT NULL DEFAULT FALSE,
  marques         JSONB       NOT NULL DEFAULT '[]',
  marque_defaut   TEXT,
  actif           BOOLEAN     NOT NULL DEFAULT TRUE,
  ordre           INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Deux sociétés ne partagent pas une série de numéros.
CREATE UNIQUE INDEX IF NOT EXISTS societes_prefixe_unique ON public.societes (prefixe);

ALTER TABLE public.societes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "societes lecture" ON public.societes;
CREATE POLICY "societes lecture" ON public.societes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "societes admin" ON public.societes;
CREATE POLICY "societes admin" ON public.societes FOR ALL TO authenticated
  USING (get_my_veille_role() = 'admin') WITH CHECK (get_my_veille_role() = 'admin');

-- Identité ISOSIGN reprise de la ligne légale des documents. Le SIRET imprimé
-- (« 4949223130005 », 13 chiffres) est faux : laissé vide, à saisir.
INSERT INTO public.societes (code, raison_sociale, forme_juridique, capital, adresse, code_postal, ville,
  siren, rcs, ape, tva_intra, email, telephone, fax, site_web, prefixe, odoo, marques, marque_defaut, ordre)
VALUES ('ISOSIGN', 'ISOSIGN', 'SAS', '40 000 €', 'ZA du Monay', '71210', 'SAINT-EUSÈBE',
  '494922313', 'RCS Chalon-sur-Saône 494922313', '4669B', 'FR76494922313', 'isosign@isosign.fr',
  '03 85 77 07 25', '03 85 55 41 14', 'www.isosign.fr', '', TRUE,
  '[{"nom":"ISOFLOOR","email":"contact@isofloor.fr"},{"nom":"ISOSIGN","email":"isosign@isosign.fr","siteWeb":"www.isosign.fr"},{"nom":"ISOMARK"},{"nom":"STI"}]',
  'ISOFLOOR', 1)
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.societes (code, raison_sociale, prefixe, odoo, marques, marque_defaut, ordre)
VALUES ('SIGNALISE', 'SIGNALISE', 'SIG', FALSE, '[{"nom":"4FLOORS"}]', '4FLOORS', 2)
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.societes (code, raison_sociale, prefixe, odoo, marques, marque_defaut, ordre)
VALUES ('FORFLOOR', 'FORFLOOR', 'FOR', FALSE, '[{"nom":"FORFLOOR"}]', 'FORFLOOR', 3)
ON CONFLICT (code) DO NOTHING;

-- ── Rattachement des utilisateurs ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.utilisateur_societes (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES public.societes(id)
);
ALTER TABLE public.utilisateur_societes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "utilisateur_societes lecture" ON public.utilisateur_societes;
CREATE POLICY "utilisateur_societes lecture" ON public.utilisateur_societes FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR get_my_veille_role() = 'admin');
DROP POLICY IF EXISTS "utilisateur_societes admin" ON public.utilisateur_societes;
CREATE POLICY "utilisateur_societes admin" ON public.utilisateur_societes FOR ALL TO authenticated
  USING (get_my_veille_role() = 'admin') WITH CHECK (get_my_veille_role() = 'admin');

-- Société de l'utilisateur courant : son rattachement, sinon ISOSIGN.
CREATE OR REPLACE FUNCTION public.ma_societe()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT societe_id FROM public.utilisateur_societes WHERE user_id = auth.uid()),
    (SELECT id FROM public.societes WHERE code = 'ISOSIGN')
  );
$$;
GRANT EXECUTE ON FUNCTION public.ma_societe() TO authenticated;

-- ── Documents : société et marque ────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['devis', 'commandes_client', 'commandes_fournisseur', 'factures_client', 'factures_fournisseur'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS societe_id UUID REFERENCES public.societes(id)', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS marque TEXT', t);
    -- Tout l'existant est ISOSIGN.
    EXECUTE format('UPDATE public.%I SET societe_id = (SELECT id FROM public.societes WHERE code = ''ISOSIGN'') WHERE societe_id IS NULL', t);
    -- Un document écrit sans société prend celle de l'utilisateur.
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN societe_id SET DEFAULT public.ma_societe()', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN societe_id SET NOT NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (societe_id)', t || '_societe_idx', t);
    -- Droits : admin partout ; sinon ses documents, dans sa société.
    EXECUTE format('DROP POLICY IF EXISTS "owner or admin" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "proprietaire de sa societe ou admin" ON public.%I', t);
    EXECUTE format($p$CREATE POLICY "proprietaire de sa societe ou admin" ON public.%I FOR ALL TO authenticated
      USING (get_my_veille_role() = 'admin' OR (auth.uid() = user_id AND societe_id = public.ma_societe()))
      WITH CHECK (get_my_veille_role() = 'admin' OR (auth.uid() = user_id AND societe_id = public.ma_societe()))$p$, t);
  END LOOP;
END $$;

-- La société d'une facture émise est figée avec le reste.
CREATE OR REPLACE FUNCTION public.figer_societe_facture()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.emise_le IS NOT NULL AND (NEW.societe_id IS DISTINCT FROM OLD.societe_id OR NEW.marque IS DISTINCT FROM OLD.marque) THEN
    RAISE EXCEPTION 'Facture % émise : sa société et sa marque ne changent plus.', OLD.numero USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS factures_client_figer_societe ON public.factures_client;
CREATE TRIGGER factures_client_figer_societe BEFORE UPDATE ON public.factures_client
  FOR EACH ROW EXECUTE FUNCTION public.figer_societe_facture();

-- ── Émission : série et émetteur de la société de la facture ─────────────
DROP FUNCTION IF EXISTS public.emettre_facture_client(uuid, jsonb, jsonb);
CREATE OR REPLACE FUNCTION public.emettre_facture_client(p_id uuid, p_client jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f       public.factures_client;
  o       public.factures_client;
  s       public.societes;
  serie   text;
  suivant int;
  num     text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié.'; END IF;

  -- Une émission à la fois : suite sans trou ni doublon, tous utilisateurs.
  PERFORM pg_advisory_xact_lock(hashtext('crmpool.emission_facture'));

  SELECT * INTO f FROM public.factures_client WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Facture introuvable (pas encore enregistrée ?). Réessayer dans un instant.';
  END IF;
  IF f.user_id <> auth.uid() AND get_my_veille_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Cette facture appartient à un autre utilisateur.';
  END IF;
  IF f.emise_le IS NOT NULL THEN RAISE EXCEPTION 'Facture déjà émise (%).', f.numero; END IF;
  IF f.est_proforma THEN RAISE EXCEPTION 'Une proforma ne s''émet pas.'; END IF;
  IF f.categorie_operation IS NULL THEN RAISE EXCEPTION 'Catégorie d''opération à choisir.'; END IF;
  IF f.total_ht <= 0 THEN RAISE EXCEPTION 'Le total HT doit être positif.'; END IF;
  IF f.date_echeance IS NULL THEN RAISE EXCEPTION 'Date d''échéance absente.'; END IF;

  SELECT * INTO s FROM public.societes WHERE id = f.societe_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Société de la facture introuvable.'; END IF;
  IF coalesce(s.siren, '') !~ '^[0-9]{9}$' OR coalesce(s.tva_intra, '') = ''
     OR coalesce(s.adresse, '') = '' OR coalesce(s.ville, '') = '' THEN
    RAISE EXCEPTION 'Identité légale de % incomplète (SIREN, TVA, adresse) : Paramètres → Sociétés.', s.raison_sociale;
  END IF;

  IF f.type_document = 'avoir' THEN
    SELECT * INTO o FROM public.factures_client WHERE id = f.facture_origine_id;
    IF NOT FOUND OR o.emise_le IS NULL THEN
      RAISE EXCEPTION 'L''avoir doit référencer une facture émise.';
    END IF;
    IF o.societe_id IS DISTINCT FROM f.societe_id THEN
      RAISE EXCEPTION 'L''avoir doit être émis par la société de la facture qu''il corrige.';
    END IF;
  END IF;

  serie := CASE WHEN s.prefixe <> '' THEN s.prefixe || '-' ELSE '' END
        || CASE WHEN f.type_document = 'avoir' THEN 'AV' ELSE 'FAC' END
        || '-' || to_char(current_date, 'YYYY');
  SELECT coalesce(max(substring(numero FROM length(serie) + 2)::int), 0) + 1
    INTO suivant
    FROM public.factures_client
   WHERE numero ~ ('^' || serie || '-[0-9]+$');
  num := serie || '-' || lpad(suivant::text, greatest(3, length(suivant::text)), '0');

  PERFORM set_config('crmpool.emission_facture', '1', true);
  UPDATE public.factures_client
     SET numero        = num,
         date_creation = current_date,   -- la date de la facture est celle de son émission
         emise_le      = now(),
         statut        = CASE WHEN statut IN ('brouillon', 'annulée') THEN 'envoyée' ELSE statut END,
         client_fige   = p_client,
         emetteur_fige = to_jsonb(s) - 'marques' - 'created_at' - 'ordre' - 'actif' - 'odoo'
   WHERE id = p_id
  RETURNING * INTO f;
  PERFORM set_config('crmpool.emission_facture', '', true);

  RETURN to_jsonb(f);
END $$;

REVOKE ALL ON FUNCTION public.emettre_facture_client(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emettre_facture_client(uuid, jsonb) TO authenticated;

-- ── Logos des marques ────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('societes-logos', 'societes-logos', TRUE)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "societes-logos admin ecrit" ON storage.objects;
CREATE POLICY "societes-logos admin ecrit" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'societes-logos' AND get_my_veille_role() = 'admin')
  WITH CHECK (bucket_id = 'societes-logos' AND get_my_veille_role() = 'admin');
