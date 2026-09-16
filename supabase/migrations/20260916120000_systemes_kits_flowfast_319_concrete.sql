-- Petits melanges (kits) et systeme Flowfast 319 Concrete.
--
-- La fiche Flowfast 319 Concrete ne se chiffre pas au kilo : la couche teintee
-- se prepare en KITS de 5 m2 — 2,5 kg de Flowfast 319 Unpigmented, 1,255 kg de
-- SNL Concrete, 0,2 kg de pigments — et une bande de 0,10 m ne se trace pas
-- avec un melange de 20 kg, qui prend avant d'etre pose. D'ou :
--
--   systemes.surface_kit_m2        surface couverte par un petit melange (5)
--   systemes.kit_surface_max_m2    au-dela, sur une surface pleine, on revient
--                                  au chiffrage au kilo (50). Une BANDE se
--                                  chiffre toujours en kits.
--   systeme_composants.au_kit      le composant entre dans le petit melange :
--                                  sa quantite s'arrondit au kit entier
--   systeme_composants.conditionnement_kg
--                                  le contenant quand aucun article du
--                                  catalogue ne le dit (SNL Concrete 1,255 kg)
--
-- Source : OneDrive - ISOSIGN\Documents\ISOFLOOR\02 MARKETING\Fiches systeme\
--          Flowfast 319 Concrete\FS_Flowfast-319-Concrete_fr.pdf
--          (et FLOWFAST_319_Concrete_calcuL.xlsx, meme dossier)

alter table public.systemes
  add column if not exists surface_kit_m2 numeric,
  add column if not exists kit_surface_max_m2 numeric;

alter table public.systeme_composants
  add column if not exists au_kit boolean not null default false,
  add column if not exists conditionnement_kg numeric;

do $$
declare
  sid uuid;
begin
  if exists (select 1 from public.systemes where nom = 'Flowfast 319 Concrete') then
    return;
  end if;

  -- Une migration n'a pas de session : le systeme prend le proprietaire des
  -- fiches deja importees (auth.uid() y vaudrait null).
  insert into public.systemes
    (user_id, nom, famille, variante, usage, support, description, source_fiche, source_drive,
     surface_kit_m2, kit_surface_max_m2)
  values (
    (select user_id from public.systemes order by created_at limit 1),
    'Flowfast 319 Concrete', 'Flowfast', 'Aspect beton (≈ 1,95 kg/m²)',
    'Revetement decoratif fin, marquage en bande',
    'Béton ou chape ciment : compression ≥ 25 N/mm², traction ≥ 1,5 N/mm², propre, sans laitance. HR max 92 % (97 % avec Flowfast 108 Damp Primer).',
    'Résine MMA Flowfast 319 chargée SNL Concrete, teintée dans la masse, finition Flowfast 319 Clear.',
    'FS_Flowfast-319-Concrete_fr.pdf',
    'OneDrive - ISOSIGN\Documents\ISOFLOOR\02 MARKETING\Fiches système\Flowfast 319 Concrete\FS_Flowfast-319-Concrete_fr.pdf',
    5, 50
  )
  returning id into sid;

  insert into public.systeme_composants
    (systeme_id, ordre, produit_id, libelle, role, consommation, obligatoire,
     au_kit, conditionnement_kg, condition, phrase_source)
  values
    (sid, 1, (select id from public.produits where reference = 'FLOWFASTPRIMER107.20' limit 1),
     'Primaire Flowfast 107', 'primaire', 0.5, true, false, 20, null,
     'Primaire Flowfast 107 @ 0,5 kg/m²'),
    (sid, 2, (select id from public.produits where reference = 'QUARTZ0.1-0.3' limit 1),
     'Quartz naturel 0,1-0,3 mm', 'saupoudrage', 0.5, true, false, 25, null,
     'Saupoudrage Quartz naturel 0,1 – 0,3 mm @ 0,5 kg/m²'),
    (sid, 3, (select id from public.produits where reference = 'FLOWFAST31920' limit 1),
     'Flowfast 319 Unpigmented', 'couche teintée - liant', 0.5, true, true, 20,
     'kit de 5 m² : 2,5 kg',
     'Flowfast 319 Unpigmented 0,500 kg/m² — 2,5 kg pour 5 m²'),
    (sid, 4, null,
     'SNL Concrete (1,255 kg)', 'couche teintée - charge', 0.251, true, true, 1.255,
     'un sac par kit de 5 m² — aucun article au catalogue',
     'SNL Concrete 0,251 kg/m² — conditionnement 1,255 kg pour 5 m²'),
    (sid, 5, null,
     'Pigments standards (0,2 kg)', 'couche teintée - pigment', 0.04, true, true, 0.2,
     'un sachet par kit de 5 m² — aucun article au catalogue',
     'Pigments standards 0,040 kg/m² — 0,2 kg pour 5 m²'),
    (sid, 6, (select id from public.produits where reference = 'PIGMENT05' limit 1),
     'Pigment de teinte complémentaire (jaune)', 'couche teintée - pigment jaune', 0.1, false, true, 0.5,
     'teinte jaune : à ajuster selon la teinte visée',
     'Pigment de teinte complémentaire (ex. jaune) : 0,1 kg/m² — 0,5 kg / 5 m²'),
    (sid, 7, (select id from public.produits where reference = 'FLOWFAST31920.CLEAR' limit 1),
     'Finition Flowfast 319 Clear', 'finition', 0.15, true, false, 20, null,
     'Finition Flowfast 319 Clear @ 0,15 kg/m²');
end $$;
