import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { dbToProduitPublic, type Produit } from '@/lib/store';

/**
 * Lecture du catalogue à la demande, comme le fait Odoo.
 *
 * Le catalogue compte 22 634 articles depuis l'import Odoo. Les charger tous
 * dans le navigateur pour n'en afficher que cinquante coûtait plusieurs
 * secondes au démarrage, et autant à chaque tri. Ici la base fait le travail :
 * elle filtre, trie, et ne renvoie que la page demandée.
 *
 * Ce hook ne couvre que les colonnes qui existent en base. Les colonnes
 * calculées à partir d'autres tables — quantité vendue, valeur de stock,
 * fournisseur — ne peuvent pas être triées ni filtrées par la base : la page
 * bascule alors sur la liste en mémoire.
 */

export type SensTri = 'asc' | 'desc';

/** Correspondance colonne affichée → colonne de la base. */
export const COLONNES_BASE: Record<string, string> = {
  reference: 'reference',
  description: 'description',
  categorie: 'categorie',
  catalogue: 'catalogue',
  prixAchat: 'prix_achat',
  coefficient: 'coefficient',
  prixHT: 'prix_ht',
  prixRevendeur: 'prix_revendeur',
  tva: 'tva',
  poids: 'poids',
  consommation: 'consommation',
  stock: 'stock',
  disponibleVente: 'disponible_vente',
};

/**
 * Colonnes filtrables par la base.
 *
 * Seules les colonnes texte : PostgREST n'accepte pas de conversion dans un
 * filtre, on ne peut donc pas chercher « 32,20 » dans une colonne numérique.
 * Un filtre sur un prix fait basculer la page en mode mémoire.
 */
export const COLONNES_TEXTE: Record<string, string> = {
  reference: 'reference',
  description: 'description',
  categorie: 'categorie',
  catalogue: 'catalogue',
};

export interface OptionsCatalogue {
  page: number;
  parPage: number;
  recherche: string;
  /** clé d'affichage, ex. « reference » — ignorée si absente de COLONNES_BASE */
  triCol: string | null;
  triSens: SensTri;
  /** filtres par colonne, clés d'affichage ; « !empty » signifie « non vide » */
  filtres: Record<string, string>;
  /** false = le hook ne requête rien (la page utilise la liste en mémoire) */
  actif: boolean;
}

/** Échappe les caractères qui ont un sens dans un motif PostgREST. */
function motif(v: string) {
  return v.replace(/[%,()]/g, ' ').trim();
}

export function useCatalogueServeur(o: OptionsCatalogue) {
  const [lignes, setLignes] = useState<Produit[]>([]);
  const [total, setTotal] = useState(0);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Sérialisé : évite de relancer la requête à chaque rendu sur un objet égal.
  const cleFiltres = JSON.stringify(o.filtres);

  useEffect(() => {
    if (!o.actif) return;
    let annule = false;

    (async () => {
      setChargement(true);
      setErreur(null);
      try {
        let q = supabase
          .from('produits')
          .select('*', { count: 'exact' });

        const r = motif(o.recherche);
        if (r) {
          q = q.or(
            `reference.ilike.%${r}%,description.ilike.%${r}%,categorie.ilike.%${r}%`,
          );
        }

        for (const [cle, val] of Object.entries(JSON.parse(cleFiltres) as Record<string, string>)) {
          const colonne = COLONNES_TEXTE[cle];
          if (!colonne || !val) continue;
          if (val === '!empty') {
            q = q.not(colonne, 'is', null).neq(colonne, '');
            continue;
          }
          const m = motif(val);
          if (m) q = q.ilike(colonne, `%${m}%`);
        }

        const colTri = o.triCol ? COLONNES_BASE[o.triCol] : null;
        // « id » en second critère : sans lui, deux articles de même prix
        // pourraient changer de place d'une page à l'autre.
        q = colTri
          ? q.order(colTri, { ascending: o.triSens === 'asc' }).order('id')
          : q.order('reference').order('id');

        const debut = (o.page - 1) * o.parPage;
        const { data, count, error } = await q.range(debut, debut + o.parPage - 1);
        if (annule) return;
        if (error) throw error;

        setLignes((data || []).map(dbToProduitPublic));
        setTotal(count ?? 0);
      } catch (e) {
        if (!annule) setErreur((e as Error).message);
      } finally {
        if (!annule) setChargement(false);
      }
    })();

    return () => { annule = true; };
  }, [o.actif, o.page, o.parPage, o.recherche, o.triCol, o.triSens, cleFiltres]);

  return useMemo(
    () => ({ lignes, total, chargement, erreur }),
    [lignes, total, chargement, erreur],
  );
}
