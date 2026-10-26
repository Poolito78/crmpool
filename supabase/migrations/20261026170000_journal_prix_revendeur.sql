-- Le journal des prix garde aussi le PRIX REVENDEUR.
--
-- `noter_prix` n'écrivait que l'achat et `prix_ht` (le prix PUBLIC) ; l'onglet
-- Prix de la fiche affichait ce public sous le titre « Prix revendeur ». Le
-- revendeur est le prix qu'on vend : on le consigne avec les deux autres, et un
-- changement du seul revendeur ouvre désormais une période lui aussi.
-- Les mouvements d'avant cette migration n'ont pas de revendeur (NULL).

alter table public.journal_prix
  add column if not exists revendeur_avant numeric,
  add column if not exists revendeur_apres numeric;

create or replace function public.noter_prix()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.prix_achat is distinct from old.prix_achat
     or new.prix_ht is distinct from old.prix_ht
     or new.prix_revendeur is distinct from old.prix_revendeur then
    insert into public.journal_prix
      (produit_id, reference, achat_avant, achat_apres, vente_avant, vente_apres,
       revendeur_avant, revendeur_apres, maj_recue)
    values
      (old.id, old.reference, old.prix_achat, new.prix_achat,
       old.prix_ht, new.prix_ht, old.prix_revendeur, new.prix_revendeur,
       new.prix_achat_maj);
  end if;
  return new;
end;
$function$;
