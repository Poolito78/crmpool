-- Paves synthetiques a coller ISOMARK : tarif applicateur, silice, systeme.
--
-- Source : Tarif ISOMARK au 15/07/2026, page 18 « PAVES ET BORDURES » (H2).
--
--   Paves synthetiques a coller, tarif applicateur au m2 :
--     10x10 (73501) · 15x15 (73502) · 15x20 (73503)
--     < 30 m2 : 47,50 €   31 a 100 m2 : 46,00 €   101 a 300 m2 : 42,40 €
--     > 300 m2 : nous consulter
--   Colle Eclipse (72301) : seau 25 kg, 99,50 € (3,98 €/kg), dosage tarif 4 kg/m2
--   Silice 0,4/0,9 (74216) : sac 25 kg, 19,50 €, « 1/2 sac pour 1 seau Eclipse »
--
-- LES PRIX ODOO SONT INCOHERENTS, LE TARIF FAIT FOI. Les fiches importees
-- d'Odoo portent un prix public divise DEUX fois par 0,7 : PAVPREF152030 a
-- 96,96 € public, soit 67,87 € remise H2 deduite, pour 47,50 € au tarif. Les
-- tranches > 300 m2 sont a 1,41 € (prix factice d'import). La colle ECLIPSE25
-- est a 202,84 € public, soit 141,99 € applicateur pour 99,50 € au tarif.
--
-- On ne touche PAS a prix_ht, que la synchro Odoo reecrit. Le tarif se range
-- dans prix_tarif, que l'analyse de document lit AVANT prix_ht, et auquel elle
-- applique la remise de gamme (H2 : 30 %). prix_tarif porte donc le PUBLIC :
-- tarif applicateur / 0,7, arrondi au centime tel que ×0,7 retombe sur le
-- tarif (67,86 × 0,7 = 47,50). Quand prix_tarif differe du contrat Odoo, c'est
-- lui qui tarife (voir prixDetail, AnalyseDocumentDialog).
--
-- La tranche > 300 m2 n'a pas de prix : elle n'est pas tarifee ici, et le
-- systeme ne la chiffre pas (nous consulter).
--
-- Le format 10x20 est chez Odoo (PAVPREF1020xx) mais absent du tarif : on ne
-- lui invente pas de prix, et le systeme ne le propose pas.

alter table public.systeme_composants
  add column if not exists unite text,
  add column if not exists surface_min_m2 numeric,
  add column if not exists surface_max_m2 numeric;

comment on column public.systeme_composants.unite is
  'Unite de consommation quand ce n''est pas le kg : ''m2'' = vendu a la surface (paves).';
comment on column public.systeme_composants.surface_min_m2 is
  'Tranche de surface : borne basse EXCLUE (m2). Le composant ne s''applique qu''au-dessus.';
comment on column public.systeme_composants.surface_max_m2 is
  'Tranche de surface : borne haute INCLUSE (m2).';

-- ── Tarif de reference sur les articles Odoo ─────────────────────────────────

update public.produits p
set prix_tarif = t.public, code_tarif = t.code, source_tarif = 'ISOMARK 15-07-2026'
from (values
  ('PAVPREF101030',  '73501', 67.86),
  ('PAVPREF101031',  '73501', 65.71),
  ('PAVPREF1010101', '73501', 60.57),
  ('PAVPREF151530',  '73502', 67.86),
  ('PAVPREF151531',  '73502', 65.71),
  ('PAVPREF1515101', '73502', 60.57),
  ('PAVPREF152030',  '73503', 67.86),
  ('PAVPREF152031',  '73503', 65.71),
  ('PAVPREF1520101', '73503', 60.57),
  ('ECLIPSE25',      '72301', 142.14)
) as t(reference, code, public)
where p.reference = t.reference;

-- ── La silice 0,4/0,9 : absente du CRM ───────────────────────────────────────
-- Aucun article local (QUARTZHN31 est un 0,2/0,6, FLOWTEX1800 une silice
-- Flowcrete). Cree ici, sans reference Odoo : l'export la rapprochera, ou la
-- proposera « a rattacher ». Prix d'achat inconnu : laisse a 0, a renseigner.

insert into public.produits
  (user_id, reference, description, categorie, catalogue, origine, unite, poids,
   prix_ht, prix_revendeur, remise_revendeur, prix_tarif, code_tarif, source_tarif, tva)
select
  (select user_id from public.produits where reference = 'ECLIPSE25' limit 1),
  'SILICE0409', 'SILICE 0,4/0,9 - EPAISSISSANT COLLE ECLIPSE (SAC 25KG)',
  'ISOMARK / H2', 'ISOMARK', 'crm', 'Units', 25,
  27.86, 19.50, 30, 27.86, '74216', 'ISOMARK 15-07-2026', 20
where not exists (select 1 from public.produits where reference = 'SILICE0409');

-- ── Le systeme « Paves a coller », un par format du tarif ────────────────────

do $$
declare
  sid uuid;
  f record;
  proprietaire uuid := (select user_id from public.systemes order by created_at limit 1);
  eclipse uuid := (select id from public.produits where reference = 'ECLIPSE25' limit 1);
  silice uuid := (select id from public.produits where reference = 'SILICE0409' limit 1);
begin
  for f in select * from (values
    ('10x10', '1010'),
    ('15x15', '1515'),
    ('15x20', '1520')
  ) as v(format, code)
  loop
    if exists (select 1 from public.systemes where nom = 'Pavés à coller' and variante = f.format) then
      continue;
    end if;

    insert into public.systemes
      (user_id, nom, famille, variante, usage, support, description, source_fiche)
    values (
      proprietaire, 'Pavés à coller', 'Pavés et bordures ISOMARK (H2)', f.format,
      'Aménagement urbain : pavés synthétiques rustiques ou coupe droite, collés',
      'Enrobé ou béton propre et sec',
      'Pavés synthétiques ' || f.format || ' collés à la colle Eclipse. Teintes standard : sable, rouge brun, gris — '
        || 'toute autre teinte est à valider avec ISOMARK (BAT).',
      'Tarif_Isomark_au_15_07_2026.pdf — page 18'
    )
    returning id into sid;

    insert into public.systeme_composants
      (systeme_id, ordre, produit_id, libelle, role, consommation, unite,
       surface_min_m2, surface_max_m2, ratio_base, obligatoire, conditionnement_kg, condition, phrase_source)
    values
      (sid, 1, (select id from public.produits where reference = 'PAVPREF' || f.code || '30' limit 1),
       'Pavés ' || f.format || ' (< 30 m²)', 'pavés', 1, 'm2', null, 30, null, true, null, null,
       'Qté < 30 m² : 47,50 €/m²'),
      (sid, 2, (select id from public.produits where reference = 'PAVPREF' || f.code || '31' limit 1),
       'Pavés ' || f.format || ' (31 à 100 m²)', 'pavés', 1, 'm2', 30, 100, null, true, null, null,
       'De 31 à 100 m² : 46,00 €/m²'),
      (sid, 3, (select id from public.produits where reference = 'PAVPREF' || f.code || '101' limit 1),
       'Pavés ' || f.format || ' (101 à 300 m²)', 'pavés', 1, 'm2', 100, 300, null, true, null, null,
       'De 101 à 300 m² : 42,40 €/m²'),
      (sid, 4, null,
       'Pavés ' || f.format || ' (> 300 m²) — prix sur consultation ISOMARK', 'pavés', 1, 'm2', 300, null, null, true, null,
       'au-delà de 300 m² le tarif dit « nous consulter » : prix à saisir',
       'Qté > 300 m² : nous consulter'),
      (sid, 5, eclipse,
       'Colle Eclipse (seau 25 kg)', 'base', 5, null, null, null, null, true, 25,
       'colle par défaut à 5 kg/m² (règle maison) — le tarif annonce 4 kg/m²',
       'Colle Eclipse 72301 — dosage 4000 g/m², seau 25 kg'),
      (sid, 6, silice,
       'Silice 0,4/0,9 (sac 25 kg)', 'silice', null, null, null, null, 0.5, false, 25,
       'joints, bordures et séparateurs : ½ sac pour 1 seau Eclipse — cochée d''office si la demande la nomme',
       'Silice 0,4/0,9 épaississant colle Eclipse — 1/2 sac pour 1 seau Eclipse');
  end loop;
end $$;
