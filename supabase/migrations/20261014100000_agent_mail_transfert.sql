-- Agent mail : « Transférer à MonCRM » depuis le mobile, sans Azure.
--
-- Le mail transféré arrive chez un service de réception (Postmark Inbound),
-- qui le poste à la fonction Edge `agent-mail-depot`. L'adresse porte une
-- CLÉ propre à chaque utilisateur, après le « + » :
--   <boîte Postmark>+<clé>@inbound.postmarkapp.com
-- La fonction retrouve l'utilisateur par cette clé (Postmark la rend dans
-- `MailboxHash`), range les pièces jointes dans le seau privé `mails-agent`
-- et inscrit le mail dans `mails_agent`. L'Agent mail les lit, PC ou mobile.

-- La clé de chaque utilisateur, et l'adresse de réception Postmark saisie
-- une fois (« xxxx@inbound.postmarkapp.com »).
CREATE TABLE IF NOT EXISTS public.agent_mail_cles (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cle            text NOT NULL UNIQUE,
  adresse_entree text NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_mail_cles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own agent_mail_cles" ON public.agent_mail_cles;
CREATE POLICY "Users manage their own agent_mail_cles"
  ON public.agent_mail_cles FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Les mails reçus. Écrits par la fonction (rôle service), lus et classés par
-- leur destinataire. Le texte est brut : le mail TRANSFÉRÉ (« De : … Objet :
-- … ») se démêle côté navigateur (`mailTransfere`, agentMail.ts).
CREATE TABLE IF NOT EXISTS public.mails_agent (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recu_le        timestamptz NOT NULL DEFAULT now(),
  de_nom         text,
  de_email       text,
  sujet          text,
  texte          text,
  -- [{ nom, chemin, type, taille }] — `chemin` dans le seau `mails-agent`
  pieces_jointes jsonb NOT NULL DEFAULT '[]'::jsonb,
  statut         text NOT NULL DEFAULT 'a_traiter' CHECK (statut IN ('a_traiter', 'traite', 'ecarte'))
);

CREATE INDEX IF NOT EXISTS mails_agent_user_statut_idx ON public.mails_agent (user_id, statut, recu_le DESC);

ALTER TABLE public.mails_agent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own mails_agent" ON public.mails_agent;
CREATE POLICY "Users manage their own mails_agent"
  ON public.mails_agent FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Pièces jointes : seau privé, un dossier par utilisateur (`<user_id>/<mail>/…`).
-- Vidées quand le mail est traité ou écarté (le forfait gratuit = 1 Go).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('mails-agent', 'mails-agent', false, 36700160, NULL)   -- 35 Mo, la limite Postmark
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users read own mails-agent files" ON storage.objects;
CREATE POLICY "Users read own mails-agent files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'mails-agent' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users delete own mails-agent files" ON storage.objects;
CREATE POLICY "Users delete own mails-agent files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'mails-agent' AND auth.uid()::text = (storage.foldername(name))[1]);
