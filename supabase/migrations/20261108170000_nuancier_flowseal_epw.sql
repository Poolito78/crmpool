-- Flowseal EPW : les teintes du dépliant « Colour Tiers » qui manquaient aux fiches.
-- Le RAL 5015 (479 Sky Blue, Tier 2) était demandé (Top Signalisation, 06/11/2026)
-- et absent de la liste. On AJOUTE seulement : un libellé déjà enregistré sur un
-- devis doit continuer de désigner son option.
with ajouts(code, label, rang) as (
  values
    ('340', '340 (Pastel Yellow)', 1),
    ('004', '004 (RAL 9010, Pure White)', 2),
    ('209', '209 (RAL 7032, Pebble Grey)', 3),
    ('234', '234 (RAL 7037, Dusty Grey)', 4),
    ('235', '235 (RAL 7038, Agate Grey)', 5),
    ('287', '287 (RAL 7001, Silver Grey)', 6),
    ('2012', '2012 (RAL 7040, Window Grey)', 7),
    ('319', '319 (RAL 1023, Traffic Yellow)', 8),
    ('354', '354 (Arabian Yellow)', 9),
    ('479', '479 (RAL 5015, Sky Blue)', 10),
    ('605', '605 (RAL 3001, Signal Red)', 11),
    ('606', '606 (RAL 3020, Traffic Red)', 12),
    ('990', '990 (RAL 9005, Jet Black)', 13)
)
update produits p
set variantes = (
  select jsonb_agg(
    case when lower(d->>'nom') = 'teinte' then
      jsonb_set(d, '{options}', (d->'options') || coalesce((
        select jsonb_agg(jsonb_build_object('id', gen_random_uuid()::text, 'label', a.label, 'prixDiff', 0) order by a.rang)
        from ajouts a
        where not exists (
          select 1 from jsonb_array_elements(d->'options') o
          where split_part(o->>'label', ' ', 1) = a.code
        )
      ), '[]'::jsonb))
    else d end
    order by n
  )
  from jsonb_array_elements(p.variantes::jsonb) with ordinality as x(d, n)
)
where p.reference in ('FLOWSEALEPW', 'FLOWSEALEPWBRILLANT.9,1', 'FLOWSEALEPWMAT.10,1');
