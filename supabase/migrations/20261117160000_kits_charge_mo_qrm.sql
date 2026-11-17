-- Petits kits de charge Flowfast 319 : main d'œuvre selon la LOGIQUE DU
-- FABRICANT QRM (règle du 17/11/2026), et non plus prolongée depuis SNLR1 /
-- SNLC1 (migration 20261117150000).
--
-- Tarifs QRM 2026 (ACHATS\CONDITIONS TARIFAIRES CATALOGUES\QRM\2026) — prix
-- par sac, forfait 15 € par commande en sus, matières fournies par ISOSIGN :
--   SNLR : 2,91 kg 3,50 € · 5,83 kg 5,00 € · 11,65 kg 8,00 €
--          → les trois sont alignés : ≈ 2,00 € par sac + 0,514 €/kg.
--   SNLC : 2,51 kg 2,80 € · 5,02 kg 4,50 € · 10,04 kg 6,50 €
--          → pas alignés (dégressif) : on prolonge le segment des deux plus
--            petits sacs, 1,10 € par sac + 0,677 €/kg.
-- Aucun sac de moins de 2,5 kg n'est au tarif : ces montants sont À CONFIRMER
-- PAR LE FABRICANT QRM, et la note de chaque fiche le dit.
--
-- Prix recalculés comme SNLR2 : achat = charge au prorata + main d'œuvre ;
-- revendeur = achat × 1,8 ; public = revendeur ÷ 0,7 ; paliers 1/5/10 avec le
-- forfait de 15 € réparti sur la quantité.

with kits(reference, sac, kg, mo, regle) as (values
  ('SNLR-025', 'SNLR775',  0.291, 2.15, 'prolongé de SNLR2 3,50 € / SNLR5 5,00 € / SNLR11 8,00 € : 2,00 € par sac + 0,514 €/kg'),
  ('SNLR-05',  'SNLR775',  0.583, 2.30, 'prolongé de SNLR2 3,50 € / SNLR5 5,00 € / SNLR11 8,00 € : 2,00 € par sac + 0,514 €/kg'),
  ('SNLR-1',   'SNLR775',  1.165, 2.60, 'prolongé de SNLR2 3,50 € / SNLR5 5,00 € / SNLR11 8,00 € : 2,00 € par sac + 0,514 €/kg'),
  ('SNLC-025', 'SNLC1200', 0.126, 1.19, 'prolongé de SNLC2 2,80 € / SNLC5 4,50 € : 1,10 € par sac + 0,677 €/kg'),
  ('SNLC-05',  'SNLC1200', 0.252, 1.27, 'prolongé de SNLC2 2,80 € / SNLC5 4,50 € : 1,10 € par sac + 0,677 €/kg'),
  ('SNLC-1',   'SNLC1200', 0.504, 1.44, 'prolongé de SNLC2 2,80 € / SNLC5 4,50 € : 1,10 € par sac + 0,677 €/kg')
),
calc as (
  select k.*, round(ch.prix_achat::numeric * k.kg / ch.poids::numeric + k.mo, 2) as achat
  from kits k join produits ch on ch.reference = k.sac
),
prix as (select c.*, round(c.achat * 1.8, 2) as rev from calc c)
update produits p set
  prix_achat      = x.achat,
  prix_revendeur  = x.rev,
  prix_ht         = round(x.rev / 0.7, 2),
  coefficient     = round(x.rev / x.achat, 4),
  coeff_revendeur = round(x.rev / x.achat, 4),
  prix_achat_maj  = now(),
  prix_vente_maj  = now(),
  composants = (
    select jsonb_agg(case when e->>'produitId' = (select id::text from produits where reference = 'MOQRM' limit 1)
                          then jsonb_set(e, '{prixAchatManuel}', to_jsonb(x.mo)) else e end)
    from jsonb_array_elements(p.composants) e
  ),
  paliers_prix = (
    select jsonb_agg(jsonb_build_object(
             'qteMin', q,
             'prixAchat', x.achat,
             'prixRevendeur', round((x.achat + 15.0 / q) * 1.8, 2),
             'prixHT', round(round((x.achat + 15.0 / q) * 1.8, 2) / 0.7, 2)) order by q)
    from unnest(array[1, 5, 10]) q
  ),
  notes = '⚠️ MAIN D''ŒUVRE QRM ' || replace(to_char(x.mo, 'FM990.00'), '.', ',')
       || ' € PAR SAC — À CONFIRMER PAR LE FABRICANT QRM. Sac absent du tarif QRM 2026, '
       || x.regle || '. Forfait préparation de commande QRM : 15 € par commande.'
from prix x
where p.reference = x.reference;
