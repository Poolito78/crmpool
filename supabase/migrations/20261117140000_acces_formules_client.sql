-- Fiche client, onglet WEB : « Accès au détail des formules SNLR / SNLC ».
-- Coché, le client voit dans SON tarif en ligne la composition des charges
-- Flowfast 319 (SNL Filler, quartz, HDK N20) ; la fonction `tarif-catalogue`
-- ne renvoie ces formules qu'aux clients cochés : la page publique ne les
-- contient pas.
alter table public.clients add column if not exists acces_formules boolean not null default false;
