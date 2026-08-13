-- Rattache un relevé de veille à notre propre article, et à l'affaire où on
-- l'a rencontré. Sans ce lien, la veille reste une liste de prix flottants :
-- on sait que Morphée vaut 2,75 €, sans savoir à quel article ISOSIGN le
-- comparer, ni sur quel devis on s'est aligné.
--
-- ON DELETE SET NULL des deux côtés : supprimer un article ou un devis ne doit
-- pas effacer un relevé terrain, qui garde sa valeur historique.

alter table public.concurrent_produits
  add column if not exists produit_id uuid references public.produits(id) on delete set null,
  add column if not exists devis_id   uuid references public.devis(id)    on delete set null;

comment on column public.concurrent_produits.produit_id is
  'Article ISOSIGN équivalent, pour comparer notre prix au leur.';
comment on column public.concurrent_produits.devis_id is
  'Affaire sur laquelle ce prix a été rencontré.';

create index if not exists idx_concurrent_produits_produit
  on public.concurrent_produits(produit_id) where produit_id is not null;
create index if not exists idx_concurrent_produits_devis
  on public.concurrent_produits(devis_id) where devis_id is not null;
