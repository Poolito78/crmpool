-- Images des mails types (logo, signature) : [{ id, nom, dataUrl, largeur }].
-- Rangées en data URL, réduites à 600 px à l'ajout : une signature pèse
-- quelques dizaines de Ko, et l'image doit partir DANS le .eml (pièce en
-- ligne, `cid:`) — un lien externe serait bloqué par Outlook.
ALTER TABLE public.mails_types ADD COLUMN IF NOT EXISTS images jsonb;
