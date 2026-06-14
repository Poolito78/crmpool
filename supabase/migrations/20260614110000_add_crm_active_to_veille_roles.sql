-- Interrupteur maître d'accès à crmpool, distinct des droits de section.
-- crm_active = false  → écran « Accès refusé » complet.
-- crm_access (réutilisé) ne gère désormais QUE la page CRM (Pipeline/Actions/…).
-- crm_achat_access gère le périmètre Achat.

-- 1) Colonne nullable (les lignes existantes restent NULL le temps du backfill).
ALTER TABLE veille_roles ADD COLUMN IF NOT EXISTS crm_active boolean;

-- 2) Reprise de l'existant : préserver le comportement actuel au moment de la
--    bascule. Les comptes qui avaient accès (crm_access = true) restent actifs ET
--    gardent la page CRM ; ceux sans accès restent bloqués. Ajuster ensuite via le
--    panneau Admin (ex. activer un invité Ventes : crm_active = true, crm_access = false).
UPDATE veille_roles SET crm_active = COALESCE(crm_access, false) WHERE crm_active IS NULL;

-- 3) Par défaut, les nouveaux comptes sont actifs.
ALTER TABLE veille_roles ALTER COLUMN crm_active SET DEFAULT true;
