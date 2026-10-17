-- ════════════════════════════════════════════════════════════════════════
-- Facturation conforme (réforme de la facture électronique, B2B France)
--
-- 1. Données exigées par la réforme : catégorie d'opération, option TVA sur
--    les débits, adresse de livraison, client et émetteur figés.
-- 2. Avoirs : type_document + facture d'origine.
-- 3. Numérotation : attribuée PAR LA BASE à l'émission, suite chronologique
--    continue, sans trou ni doublon, tous utilisateurs confondus (FAC-AAAA-nnn,
--    AV-AAAA-nnn). Un brouillon n'a pas de numéro.
-- 4. Une facture émise est FIGÉE : ni modification (hors statut de paiement,
--    date de paiement et notes), ni suppression. On corrige par un avoir.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.factures_client
  ADD COLUMN IF NOT EXISTS type_document              TEXT        NOT NULL DEFAULT 'facture',
  ADD COLUMN IF NOT EXISTS facture_origine_id         UUID        REFERENCES public.factures_client(id),
  ADD COLUMN IF NOT EXISTS categorie_operation        TEXT,
  ADD COLUMN IF NOT EXISTS tva_sur_debits             BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hors_e_invoicing           BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS livraison_a_la_facturation BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS adresse_livraison_figee    JSONB,
  ADD COLUMN IF NOT EXISTS emise_le                   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_fige                JSONB,
  ADD COLUMN IF NOT EXISTS emetteur_fige              JSONB;

DO $$ BEGIN
  ALTER TABLE public.factures_client
    ADD CONSTRAINT factures_client_type_document_chk CHECK (type_document IN ('facture', 'avoir'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.factures_client
    ADD CONSTRAINT factures_client_categorie_chk
    CHECK (categorie_operation IS NULL OR categorie_operation IN ('biens', 'services', 'mixte'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Un numéro définitif n'existe qu'une fois. Les brouillons ont numero = ''.
CREATE UNIQUE INDEX IF NOT EXISTS factures_client_numero_unique
  ON public.factures_client (numero) WHERE numero <> '';

CREATE INDEX IF NOT EXISTS factures_client_origine_idx ON public.factures_client (facture_origine_id);

-- ── Déclencheur : brouillon sans numéro, facture émise figée ─────────────
CREATE OR REPLACE FUNCTION public.figer_facture_client()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  emission boolean := coalesce(current_setting('crmpool.emission_facture', true), '') = '1';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.emise_le IS NOT NULL THEN
      RAISE EXCEPTION 'Facture % émise : elle ne se supprime pas, elle se corrige par un avoir.', OLD.numero
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  -- Seule la fonction d'émission pose emise_le, client_fige et emetteur_fige.
  IF NOT emission THEN
    IF TG_OP = 'INSERT' THEN
      NEW.emise_le := NULL; NEW.client_fige := NULL; NEW.emetteur_fige := NULL;
    ELSIF OLD.emise_le IS NULL THEN
      NEW.emise_le := NULL; NEW.client_fige := NULL; NEW.emetteur_fige := NULL;
    END IF;
  END IF;

  -- Un brouillon de facture ou d'avoir n'a pas de numéro définitif. On
  -- l'efface plutôt que de refuser : l'écriture du store n'attend pas la
  -- réponse, un refus perdrait la ligne en silence. Les proformas gardent
  -- leur série PRO-, qui n'est pas une série de factures.
  IF NEW.emise_le IS NULL AND NOT NEW.est_proforma THEN
    NEW.numero := '';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.emise_le IS NOT NULL THEN
    IF NEW.numero                     IS DISTINCT FROM OLD.numero
    OR NEW.client_id                  IS DISTINCT FROM OLD.client_id
    OR NEW.date_creation              IS DISTINCT FROM OLD.date_creation
    OR NEW.date_echeance              IS DISTINCT FROM OLD.date_echeance
    OR NEW.lignes                     IS DISTINCT FROM OLD.lignes
    OR NEW.total_ht                   IS DISTINCT FROM OLD.total_ht
    OR NEW.total_tva                  IS DISTINCT FROM OLD.total_tva
    OR NEW.total_ttc                  IS DISTINCT FROM OLD.total_ttc
    OR NEW.frais_port_ht              IS DISTINCT FROM OLD.frais_port_ht
    OR NEW.reference_affaire          IS DISTINCT FROM OLD.reference_affaire
    OR NEW.est_proforma               IS DISTINCT FROM OLD.est_proforma
    OR NEW.type_document              IS DISTINCT FROM OLD.type_document
    OR NEW.facture_origine_id         IS DISTINCT FROM OLD.facture_origine_id
    OR NEW.categorie_operation        IS DISTINCT FROM OLD.categorie_operation
    OR NEW.tva_sur_debits             IS DISTINCT FROM OLD.tva_sur_debits
    OR NEW.hors_e_invoicing           IS DISTINCT FROM OLD.hors_e_invoicing
    OR NEW.livraison_a_la_facturation IS DISTINCT FROM OLD.livraison_a_la_facturation
    OR NEW.adresse_livraison_figee    IS DISTINCT FROM OLD.adresse_livraison_figee
    OR NEW.emise_le                   IS DISTINCT FROM OLD.emise_le
    OR NEW.client_fige                IS DISTINCT FROM OLD.client_fige
    OR NEW.emetteur_fige              IS DISTINCT FROM OLD.emetteur_fige
    THEN
      RAISE EXCEPTION 'Facture % émise : seuls le statut de paiement, la date de paiement et les notes se modifient.', OLD.numero
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.statut IN ('brouillon', 'annulée') THEN
      RAISE EXCEPTION 'Facture % émise : elle ne revient pas en brouillon et ne s''annule pas — émettre un avoir.', OLD.numero
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS factures_client_figer ON public.factures_client;
CREATE TRIGGER factures_client_figer
  BEFORE INSERT OR UPDATE OR DELETE ON public.factures_client
  FOR EACH ROW EXECUTE FUNCTION public.figer_facture_client();

-- ── Émission : numéro définitif, date du jour, client et émetteur figés ──
CREATE OR REPLACE FUNCTION public.emettre_facture_client(
  p_id uuid, p_client jsonb, p_emetteur jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f       public.factures_client;
  o       public.factures_client;
  serie   text;
  suivant int;
  num     text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié.'; END IF;

  -- Une émission à la fois, toutes séries confondues : c'est ce qui garantit
  -- une suite sans trou ni doublon entre utilisateurs.
  PERFORM pg_advisory_xact_lock(hashtext('crmpool.emission_facture'));

  SELECT * INTO f FROM public.factures_client WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Facture introuvable (pas encore enregistrée ?). Réessayer dans un instant.';
  END IF;
  IF f.user_id <> auth.uid() THEN RAISE EXCEPTION 'Cette facture appartient à un autre utilisateur.'; END IF;
  IF f.emise_le IS NOT NULL THEN RAISE EXCEPTION 'Facture déjà émise (%).', f.numero; END IF;
  IF f.est_proforma THEN RAISE EXCEPTION 'Une proforma ne s''émet pas.'; END IF;
  IF f.categorie_operation IS NULL THEN RAISE EXCEPTION 'Catégorie d''opération à choisir.'; END IF;
  IF f.total_ht <= 0 THEN RAISE EXCEPTION 'Le total HT doit être positif.'; END IF;
  IF f.date_echeance IS NULL THEN RAISE EXCEPTION 'Date d''échéance absente.'; END IF;
  IF f.type_document = 'avoir' THEN
    SELECT * INTO o FROM public.factures_client WHERE id = f.facture_origine_id;
    IF NOT FOUND OR o.emise_le IS NULL THEN
      RAISE EXCEPTION 'L''avoir doit référencer une facture émise.';
    END IF;
  END IF;

  serie := CASE WHEN f.type_document = 'avoir' THEN 'AV' ELSE 'FAC' END
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
         emetteur_fige = p_emetteur
   WHERE id = p_id
  RETURNING * INTO f;
  PERFORM set_config('crmpool.emission_facture', '', true);

  RETURN to_jsonb(f);
END $$;

REVOKE ALL ON FUNCTION public.emettre_facture_client(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emettre_facture_client(uuid, jsonb, jsonb) TO authenticated;
