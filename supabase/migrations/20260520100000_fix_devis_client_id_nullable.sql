-- Garantit que client_id est nullable pour les devis "système" (sans client)
ALTER TABLE public.devis ALTER COLUMN client_id DROP NOT NULL;
