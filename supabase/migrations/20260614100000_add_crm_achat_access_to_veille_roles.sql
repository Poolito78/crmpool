-- Droit d'accès au périmètre "Achat" de crmpool (fournisseurs, commandes fourn.,
-- factures fourn., prix d'achat, marges). Par défaut désactivé : seuls les
-- admins (role = 'admin') et les utilisateurs explicitement cochés y ont accès.
ALTER TABLE veille_roles ADD COLUMN IF NOT EXISTS crm_achat_access boolean DEFAULT false;

-- NB RLS : pour que le panneau admin de crmpool puisse lister tous les utilisateurs
-- et modifier crm_access / crm_achat_access, il faut une policy autorisant les admins.
-- Exemple (à adapter si des policies admin existent déjà côté app Veille) :
--
--   CREATE POLICY "admins manage veille_roles"
--     ON veille_roles FOR ALL
--     USING (get_my_veille_role() = 'admin')
--     WITH CHECK (get_my_veille_role() = 'admin');
