-- Devis fournisseur : l'offre de prix qu'on RECOIT, et ce qu'on en a fait.
--
-- L'application savait lire un devis client et en faire un devis. Le
-- symetrique n'existait pas. Un fournisseur envoie sa nouvelle offre, elle est
-- lue, les prix d'achat sont ressaisis a la main — ou ne le sont pas — et le
-- document disparait dans une boite mail. Six mois plus tard, personne ne sait
-- plus quel tarif a ete applique, ni quand, ni ce que le fournisseur proposait
-- d'autre.
--
-- Ces deux tables gardent l'offre telle qu'elle est arrivee : l'en-tete, et
-- chaque article propose avec son prix. La ligne retient aussi ce qu'on en a
-- fait — l'article du catalogue auquel elle a ete rattachee, et si son prix a
-- ete applique. C'est ce qui distingue un tarif recu d'un tarif repercute.

create table if not exists public.devis_fournisseur (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid(),
  -- Nul tant que le fournisseur n'est pas reconnu : le document existe avant
  -- qu'on sache a qui le rattacher.
  fournisseur_id uuid references public.fournisseurs(id) on delete set null,
  -- Le nom lu sur le document, garde meme apres rattachement : il ne coincide
  -- pas toujours avec la fiche, et c'est parfois lui qui explique un doute.
  fournisseur_nom text,
  numero         text,
  date_document  date,
  date_validite  date,
  -- Notre propre reference chez eux, quand le document la porte.
  reference      text,
  total_ht       numeric,
  devise         text not null default 'EUR',
  -- 'recu' : lu, rien d'applique. 'applique' : au moins un prix repercute.
  -- 'archive' : offre perimee ou ecartee.
  statut         text not null default 'recu',
  notes          text,
  -- Le texte d'origine, pour pouvoir relire ce que l'IA a interprete.
  source_texte   text,
  source_fichier text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.devis_fournisseur_lignes (
  id            uuid primary key default gen_random_uuid(),
  devis_id      uuid not null references public.devis_fournisseur(id) on delete cascade,
  user_id       uuid not null default auth.uid(),
  ordre         integer not null default 0,
  -- Ce que le document dit, mot pour mot. Jamais reecrit : c'est la preuve.
  reference     text,
  designation   text,
  quantite      numeric,
  prix_achat    numeric,
  unite         text,
  -- Ce qu'on en a fait. Nul tant qu'aucun article n'a ete rapproche.
  produit_id    uuid references public.produits(id) on delete set null,
  -- 'actualiser' | 'rattacher' | 'inchange' | 'absent' | 'sans_prix'
  action        text,
  -- Le prix a-t-il ete repercute, et quand. Une offre lue n'est pas appliquee.
  applique      boolean not null default false,
  applique_le   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_devis_fournisseur_fournisseur
  on public.devis_fournisseur(fournisseur_id);
create index if not exists idx_devis_fournisseur_date
  on public.devis_fournisseur(date_document desc);
create index if not exists idx_devis_fournisseur_lignes_devis
  on public.devis_fournisseur_lignes(devis_id);
-- « Que m'a-t-on deja propose sur cet article ? » est la question qui justifie
-- de garder les lignes : elle doit se repondre sans balayer la table.
create index if not exists idx_devis_fournisseur_lignes_produit
  on public.devis_fournisseur_lignes(produit_id);

alter table public.devis_fournisseur         enable row level security;
alter table public.devis_fournisseur_lignes  enable row level security;

-- Un tarif fournisseur engage la societe, pas un commercial : tout le monde
-- lit, tout le monde ecrit, comme pour les systemes et le catalogue. Le
-- cloisonnement par utilisateur cacherait a l'acheteur l'offre recue par son
-- collegue — exactement ce que ces tables existent pour eviter.
drop policy if exists devis_fournisseur_lecture on public.devis_fournisseur;
create policy devis_fournisseur_lecture on public.devis_fournisseur
  for select to authenticated using (true);
drop policy if exists devis_fournisseur_ecriture on public.devis_fournisseur;
create policy devis_fournisseur_ecriture on public.devis_fournisseur
  for all to authenticated using (true) with check (true);

drop policy if exists df_lignes_lecture on public.devis_fournisseur_lignes;
create policy df_lignes_lecture on public.devis_fournisseur_lignes
  for select to authenticated using (true);
drop policy if exists df_lignes_ecriture on public.devis_fournisseur_lignes;
create policy df_lignes_ecriture on public.devis_fournisseur_lignes
  for all to authenticated using (true) with check (true);
