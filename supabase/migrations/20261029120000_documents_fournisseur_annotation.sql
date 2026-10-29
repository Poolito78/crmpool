-- Annotation libre saisie à la main sur un document de la mini-GED fournisseurs
-- (« tarifs FLOWFAST 2027 », « relance prix catalyst »…). Distincte de `libelle`,
-- qui porte le nom du partenaire lu par l'analyse.
alter table public.documents_fournisseur add column if not exists annotation text;
