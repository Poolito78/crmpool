-- Petits kits de charge Flowfast 319 — ceux que la page « Surface des
-- pochoirs » propose (`KITS_CHARGE`, melangeFlowfast319.ts), repris du
-- calculateur isofloor.fr : SNLR-025 / -05 / -1 (Road) et SNLC-025 / -05 / -1
-- (Concrete). Le suffixe dit la résine à mélanger : 0,25 / 0,5 / 1 kg.
--
-- Même mode de calcul que SNLR2 (règle du 17/11/2026) :
--   * achat = charge au prorata du sac (SNLR775 / SNLC1200, au poids)
--             + main d'œuvre QRM du kit (prixAchatManuel) ;
--   * forfait 15 € par commande (MOQRMSNLR5, forfaitCommande), hors du prix
--     unitaire, réparti sur la quantité de chaque palier ;
--   * revendeur = achat × 1,8, public = revendeur ÷ 0,7 (remise 30 %) ;
--   * paliers 1 / 5 / 10 : revendeur = (achat + 15 / qté) × 1,8.
--
-- ⚠️ La main d'œuvre d'un si petit kit n'existait sur aucune fiche : elle
-- prolonge la droite des kits existants (choix de l'utilisateur, 17/11) —
-- SNLR1 1,455 kg → 2,07 €, SNLR2 2,91 kg → 3,50 € ; SNLC1 1,26 kg → 1,90 €,
-- SNLC2 2,52 kg → 2,80 €. Modifiable sur chaque fiche.
-- ⚠️ REMPLACÉ par 20261117160000_kits_charge_mo_qrm.sql : la main d'œuvre
-- suit le tarif du fabricant QRM, à confirmer par QRM.
--
-- Idempotente : un kit déjà présent n'est pas touché.

with kits(reference, modele, sac, kg, mo, description, resine) as (values
  ('SNLR-025', 'SNLR2', 'SNLR775',  0.291, 0.93, 'SNL 319 ROAD (0,291 Kg)',      '0,25'),
  ('SNLR-05',  'SNLR2', 'SNLR775',  0.583, 1.21, 'SNL 319 ROAD (0,583 Kg)',      '0,5'),
  ('SNLR-1',   'SNLR2', 'SNLR775',  1.165, 1.79, 'SNL 319 ROAD (1,165 Kg)',      '1'),
  ('SNLC-025', 'SNLC1', 'SNLC1200', 0.126, 1.09, 'SNLC 319 Concrete (0,126 Kg)', '0,25'),
  ('SNLC-05',  'SNLC1', 'SNLC1200', 0.252, 1.18, 'SNLC 319 Concrete (0,252 Kg)', '0,5'),
  ('SNLC-1',   'SNLC1', 'SNLC1200', 0.504, 1.36, 'SNLC 319 Concrete (0,504 Kg)', '1')
),
calc as (
  select k.*, m.user_id, m.categorie, m.catalogue, m.consommation, m.unite, m.tva,
         ch.id as sac_id, ch.poids::numeric as sac_poids,
         round(ch.prix_achat::numeric * k.kg / ch.poids::numeric + k.mo, 2) as achat
  from kits k
  join produits m  on m.reference  = k.modele
  join produits ch on ch.reference = k.sac
),
prix as (
  select c.*, round(c.achat * 1.8, 2) as rev from calc c
)
insert into produits (
  user_id, reference, description, description_detaillee, categorie, catalogue,
  unite, tva, poids, consommation, origine, proprietaire, est_modele, nb_variantes,
  disponible_vente, remise_revendeur,
  prix_achat, prix_revendeur, prix_ht, coefficient, coeff_revendeur,
  prix_achat_maj, prix_vente_maj, date_creation,
  composants, paliers_prix
)
select
  p.user_id, p.reference, p.description,
  'à mélanger avec ' || p.resine || ' kg de Flowfast 319 unpigmented',
  p.categorie, p.catalogue, p.unite, p.tva, p.kg, p.consommation,
  'crm', 'isosign', true, 1, true, 30,
  p.achat, p.rev, round(p.rev / 0.7, 2),
  round(p.rev / p.achat, 4), round(p.rev / p.achat, 4),
  now(), now(), date_trunc('day', now()),
  jsonb_build_array(
    jsonb_build_object('produitId', p.sac_id, 'poidsKg', p.kg, 'quantite', round(p.kg / p.sac_poids, 4)),
    jsonb_build_object('produitId', (select id from produits where reference = 'MOQRMSNLR5' limit 1),
                       'quantite', 1, 'forfaitCommande', true, 'prixAchatManuel', 15),
    jsonb_build_object('produitId', (select id from produits where reference = 'MOQRM' limit 1),
                       'quantite', 1, 'prixAchatManuel', p.mo)
  ),
  (select jsonb_agg(jsonb_build_object(
            'qteMin', q,
            'prixAchat', p.achat,
            'prixRevendeur', round((p.achat + 15.0 / q) * 1.8, 2),
            'prixHT', round(round((p.achat + 15.0 / q) * 1.8, 2) / 0.7, 2)) order by q)
     from unnest(array[1, 5, 10]) q)
from prix p
where not exists (select 1 from produits x where x.reference = p.reference);
