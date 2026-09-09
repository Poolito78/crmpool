-- Le CHANTIER d'un devis, au sens d'Odoo.
--
-- CE N'EST PAS LA REFERENCE D'AFFAIRE. Odoo porte les deux cote a cote sur
-- `sale.order` : `client_order_ref` pour la reference que le CLIENT donne a sa
-- commande, et `x_studio_chantier` (champ texte) pour le LIEU des travaux.
--
-- Jusqu'ici MonCRM n'avait que `reference_affaire`, et l'export Odoo la
-- recopiait dans la case Chantier faute de mieux — la reference du client
-- partait donc dans une case qui n'est pas la sienne. Sur le devis AF036911
-- les deux se ressemblent (« CHANTIER PANTIN ») ; elles n'ont aucune raison de
-- coincider en general, et c'est le chantier qui regroupe les commandes d'un
-- meme site.
--
-- Colonne texte libre : Odoo n'a pas de referentiel de chantiers, c'est une
-- saisie. Une cle etrangere obligerait a inventer ce referentiel et a le tenir
-- a jour des deux cotes.
alter table public.devis
  add column if not exists chantier text;

comment on column public.devis.chantier is
  'Lieu des travaux, recopie dans x_studio_chantier a l''export Odoo. Distinct de reference_affaire.';
