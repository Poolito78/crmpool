-- Fiche produit publique — la page qu'un client ouvre depuis un lien de mail.
--
-- POURQUOI UNE FONCTION ET PAS UNE VUE : une vue ouverte à `anon` se lit sans
-- filtre, et le catalogue entier (22 500 désignations) partirait au premier
-- `select *` fait avec la clé publique. La fonction, elle, exige l'identifiant
-- de l'article. Un UUID ne se devine pas : celui qui a le lien voit la fiche,
-- les autres ne voient rien — et personne ne peut énumérer le catalogue.
--
-- CE QUI SORT, ET CE QUI NE SORT PAS : référence, désignation, description
-- détaillée, unité, photos, lien vers la fiche technique. AUCUN prix, aucun
-- coût, aucun stock, aucun fournisseur. La fonction est la frontière : ce qui
-- n'est pas dans le `jsonb_build_object` n'est pas public.
--
-- `security definer` est nécessaire (la RLS de `produits` n'ouvre rien à
-- `anon`) et sans danger ici : la fonction est en lecture seule et ne rend
-- qu'un article, celui qu'on lui nomme.

create or replace function public.fiche_publique(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',                   p.id,
    'reference',            p.reference,
    'description',          p.description,
    'description_detaillee', p.description_detaillee,
    'unite',                p.unite,
    'categorie',            p.categorie,
    'fiche_url',            p.fiche_url,
    'fiche_link_label',     p.fiche_link_label,
    'images', (
      select coalesce(
        jsonb_agg(jsonb_build_object('url', i.url, 'nom', i.nom) order by i.ordre),
        '[]'::jsonb)
      from public.produit_images i
      where i.produit_id = p.id
    )
  )
  from public.produits p
  where p.id = p_id
    and coalesce(p.disponible_vente, true) = true;
$$;

revoke all on function public.fiche_publique(uuid) from public;
grant execute on function public.fiche_publique(uuid) to anon, authenticated;

comment on function public.fiche_publique(uuid) is
  'Fiche produit publique (sans prix) pour la page /p/:id — accessible sans compte, sur présentation de l''UUID de l''article.';
