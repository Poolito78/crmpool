-- Mails types d'envoi (Paramètres → Mails) : objet et corps du mail proposé
-- à l'envoi d'un devis, d'une commande fournisseur, d'une facture, d'un AR de
-- commande. Un jeu par utilisateur (chacun sa signature) ; une ligne absente =
-- le texte d'origine de l'application (`MAILS_DEFAUT`, mailsTypes.ts).
CREATE TABLE IF NOT EXISTS public.mails_types (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  objet text NOT NULL,
  corps text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, type)
);

ALTER TABLE public.mails_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own mails_types" ON public.mails_types;
CREATE POLICY "Users manage their own mails_types"
  ON public.mails_types FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
