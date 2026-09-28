-- Paves a coller : la silice par defaut est le QUARTZ GRIS CLAIR 0,7-1,3.
--
-- Regle du charge d'affaires (28/09/2026) : la silice du systeme n'est pas
-- la 0,4/0,9 du tarif ISOMARK (epaississant de colle, bordures), mais
-- QUARTZGRI0.7-1.3 « QUARTZ GRIS CLAIR MI 0,7-1,3 (Cdt 48x25kg) », article
-- Odoo achete chez URBADECCO sous sa propre reference. Son prix d'achat
-- (standard_price Odoo, 8,025 € le sac) est deja au CRM par la synchro.
--
-- La fiche n'a pas de poids (0) : le sac de 25 kg reste porte par le
-- composant (conditionnement_kg). Le dosage reste celui du tarif, 1/2 sac
-- par seau d'Eclipse.

update public.systeme_composants c
set produit_id = (select id from public.produits where reference = 'QUARTZGRI0.7-1.3' limit 1),
    libelle = 'Quartz gris clair 0,7-1,3 (sac 25 kg)',
    conditionnement_kg = 25,
    phrase_source = 'Silice par défaut : QUARTZGRI0.7-1.3 (URBADECCO) — 1/2 sac pour 1 seau Eclipse'
where c.role = 'silice'
  and c.systeme_id in (select id from public.systemes where nom = 'Pavés à coller')
  and exists (select 1 from public.produits where reference = 'QUARTZGRI0.7-1.3');
