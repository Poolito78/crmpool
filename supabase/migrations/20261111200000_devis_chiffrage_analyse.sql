-- La proposition de l'analyse de document, figee dans le devis qu'elle cree
-- (11/11/2026). Chaque enregistrement du devis a la main s'y compare : un
-- article change sur une ligne qui porte la demande du client est appris par
-- la memoire de l'analyseur (memoire_articles), le reste (quantites, oublis,
-- lignes retirees) est montre dans le devis. Voir src/lib/correctionsDevis.ts.
--
-- { date, demande, pieces[], lignes: [{ id, produitId, reference, description,
--   quantite, pu, demandeClient }], fraisPortHT }

alter table public.devis add column if not exists chiffrage_analyse jsonb;

comment on column public.devis.chiffrage_analyse is
  'Proposition de l''analyse de document a la creation du devis (lignes + texte de la demande), pour apprendre des corrections.';
