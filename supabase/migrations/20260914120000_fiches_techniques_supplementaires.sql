-- Plusieurs fiches techniques par article.
--
-- `fiche_url` / `fiche_link_label` restent LA PREMIÈRE FICHE : tout ce qui les
-- lit déjà (fiche publique, liens des mails, bloc du devis) continue de
-- fonctionner sans rien changer. Les fiches suivantes vivent ici, dans l'ordre
-- où elles ont été ajoutées : `[{ "url": "https://…", "label": "…" }, …]`.
-- Un Flowseal EPW se vend avec sa fiche technique ET sa fiche de sécurité ;
-- une seule colonne obligeait à choisir.

alter table public.produits
  add column if not exists fiches_supplementaires jsonb;

comment on column public.produits.fiches_supplementaires is
  'Fiches techniques au-delà de la première (fiche_url) : tableau de { url, label }.';

-- La fiche publique les montre aussi. Même frontière qu'avant : ce qui n'est
-- pas dans le `jsonb_build_object` n'est pas public — et toujours aucun prix.
create or replace function public.fiche_publique(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',                     p.id,
    'reference',              p.reference,
    'description',            p.description,
    'description_detaillee',  p.description_detaillee,
    'unite',                  p.unite,
    'categorie',              p.categorie,
    'fiche_url',              p.fiche_url,
    'fiche_link_label',       p.fiche_link_label,
    'fiches_supplementaires', coalesce(p.fiches_supplementaires, '[]'::jsonb),
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
