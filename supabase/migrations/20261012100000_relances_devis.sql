-- Relances de devis (12 oct. 2026)
--
-- `relances`     : l'historique des relances d'un devis envoyé —
--                  [{ "date": "2026-10-12", "mode": "email" | "tel", "note": "…" }].
--                  Le statut reste « envoyé » : « Relancé » n'est qu'un
--                  libellé, pour ne rien retirer des devis en cours.
-- `date_relance` : la prochaine relance prévue. NULL = 7 jours après la
--                  dernière relance (ou l'envoi) — calcul de `relanceDevis.ts`.
-- `usage`        : un mail type de `devis_message_templates` sert à
--                  l'archivage (NULL, historique) ou à la relance ('relance').

ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS relances jsonb;
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS date_relance date;
ALTER TABLE public.devis_message_templates ADD COLUMN IF NOT EXISTS usage text;
