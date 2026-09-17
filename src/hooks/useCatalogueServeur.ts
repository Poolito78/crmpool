import { useEffect, useMemo, useRef, useState } from 'react';
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
  /** N'afficher que les modèles, sans leurs déclinaisons. Comme Odoo. */
  seulementModeles: boolean;
  /** Renseigné : on liste les variantes de ce modèle, et rien d'autre. */
  modeleCle: string | null;
  /**
   * Change quand le catalogue en mémoire gagne ou perd un article : la page
   * se relit. Sans lui, un article créé n'apparaissait qu'au rafraîchissement.
   */
  version?: number;
}

/** Échappe les caractères qui ont un sens dans un motif PostgREST. */
function motif(v: string) {
  return v.replace(/[%,()]/g, ' ').trim();
}

/**
 * Découpe la recherche en mots.
 *
 * « flowfast 107 » cherché tel quel ne trouve que les articles où les deux
 * mots se suivent, dans cet ordre, séparés par une seule espace — donc pas
 * FLOWFAST PRIMER 107.20, qui est pourtant l'article voulu. On cherche donc
 * chaque mot séparément, et on ne garde que les articles qui les portent
 * TOUS, où qu'ils soient : référence, description ou catégorie.
 *
 * Les mots d'une seule lettre sont écartés : ils figurent partout, ne
 * rétrécissent rien, et l'index trigramme ne sait pas les exploiter.
 */
function mots(v: string): string[] {
  const tous = motif(v).split(/\s+/).filter(Boolean);
  const utiles = tous.filter(m => m.length >= 2);
  return (utiles.length ? utiles : tous).slice(0, 5);
}

/** Attente avant d'interroger la base, en millisecondes.
 *
 * Le champ de recherche attend déjà un court silence avant de prévenir la
 * page ; inutile d'attendre deux fois autant ici. Ce délai sert surtout aux
 * filtres de colonne, qui, eux, remontent chaque frappe. */
const DELAI_FRAPPE = 120;

export function useCatalogueServeur(o: OptionsCatalogue) {
  const [lignes, setLignes] = useState<Produit[]>([]);
  const [total, setTotal] = useState(0);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /** Le compte exact n'a pas abouti : `total` est une estimation. */
  const [totalEstime, setTotalEstime] = useState(false);
  /** La requête (hors page) dont `total` est le compte. */
  const derniereCle = useRef<string | null>(null);

  // Sérialisé : évite de relancer la requête à chaque rendu sur un objet égal.
  const cleFiltres = JSON.stringify(o.filtres);

  /* La saisie est différée : sans cela, taper « J11C2 » lançait cinq requêtes,
     dont quatre pour des résultats que personne n'aura vus. On attend un quart
     de seconde de silence au clavier — c'est en dessous du seuil où l'on
     perçoit une attente, et cela divise le trafic par cinq. */
  const [rechercheDifferee, setRechercheDifferee] = useState(o.recherche);
  const [filtresDifferes, setFiltresDifferes] = useState(cleFiltres);

  useEffect(() => {
    const t = setTimeout(() => {
      setRechercheDifferee(o.recherche);
      setFiltresDifferes(cleFiltres);
    }, DELAI_FRAPPE);
    return () => clearTimeout(t);
  }, [o.recherche, cleFiltres]);

  // Une frappe en attente compte comme un chargement : le bandeau ne clignote
  // pas entre la frappe et le départ de la requête.
  const enAttente = o.actif
    && (rechercheDifferee !== o.recherche || filtresDifferes !== cleFiltres);

  useEffect(() => {
    if (!o.actif) return;
    let annule = false;

    /* ⚠️ LA PAGE ET LE COMPTE PARTENT SÉPARÉMENT.
     *
     * Les cinquante lignes se lisent en 14 ms par l'index des références ; le
     * compte exact, lui, parcourt toute la table — 6 s à froid, au-delà des
     * 8 s du `statement_timeout` dès que la base est occupée. Demandés
     * ensemble, l'échec du compte emportait la page : « Lecture en base
     * impossible (canceling statement due to statement timeout) », « Aucun
     * produit », et il fallait rafraîchir. La page s'affiche donc d'abord ; le
     * compte arrive ensuite, et s'il échoue on retient l'estimation du
     * planificateur, jamais une liste vide. */
    const construire = (colonnes: string, compte?: 'exact' | 'planned') => {
      let q = supabase
        .from('produits')
        .select(colonnes, compte ? { count: compte, head: true } : undefined);

      /* Odoo ne propose pas les déclinaisons dans la liste de vente : il
         montre le modèle, et n'ouvre ses variantes qu'une fois celui-ci
         choisi. Le catalogue passe ainsi de 22 634 lignes à 7 782. */
      const termes = mots(rechercheDifferee);

      /* CHERCHER, C'EST CHERCHER PARTOUT — Y COMPRIS DANS LES DÉCLINAISONS.
         La vue « modèles » cache les variantes, et le modèle des A13A est
         A13A.500 : chercher « A13A 700 » ne rendait donc RIEN, alors que
         le catalogue porte trente A13A en 700. Dès qu'on tape quelque
         chose, on lève la restriction et la liste montre les articles qui
         répondent ; sans saisie, elle reste la liste de vente d'Odoo. */
      if (o.modeleCle) q = q.eq('modele_cle', o.modeleCle);
      else if (o.seulementModeles && termes.length === 0) q = q.eq('est_modele', true);

      /* Un `or` par mot. PostgREST assemble les appels successifs avec ET :
         chaque mot doit se trouver quelque part, mais pas forcément dans
         le même champ ni dans l'ordre saisi.

         `description_variante` en fait partie : c'est la désignation
         qu'Odoo vend (« A11 1000 C1 BTR ST BRUT (MAGELLAN) »), la seule
         qui distingue une déclinaison d'une autre. */
      for (const m of termes) {
        q = q.or(
          `reference.ilike.%${m}%,description.ilike.%${m}%,description_variante.ilike.%${m}%,categorie.ilike.%${m}%`,
        );
      }

      for (const [cle, val] of Object.entries(JSON.parse(filtresDifferes) as Record<string, string>)) {
        const colonne = COLONNES_TEXTE[cle];
        if (!colonne || !val) continue;
        if (val === '!empty') {
          /* `filter` plutôt que `not(...).neq(...)` : sur un schéma de cette
             taille, la signature surchargée de `neq` fait renoncer TypeScript
             à l'inférence (TS2589) et le typage de toute la requête tombe.
             `filter` prend l'opérateur en texte, donc reste plat. Le nom de
             colonne vient de COLONNES_TEXTE, il est validé au-dessus. */
          q = q.filter(colonne, 'not.is', null);
          q = q.filter(colonne, 'neq', '');
          continue;
        }
        const m = motif(val);
        if (m) q = q.ilike(colonne, `%${m}%`);
      }
      return q;
    };

    const debut = (o.page - 1) * o.parPage;
    const cleRequete = JSON.stringify([rechercheDifferee, filtresDifferes, o.seulementModeles,
      o.modeleCle, o.version]);

    (async () => {
      setChargement(true);
      setErreur(null);
      let lus = 0;
      let suite = false;
      try {
        let q = construire('*');
        const colTri = o.triCol ? COLONNES_BASE[o.triCol] : null;
        // « id » en second critère : sans lui, deux articles de même prix
        // pourraient changer de place d'une page à l'autre.
        q = colTri
          ? q.order(colTri, { ascending: o.triSens === 'asc' }).order('id')
          : q.order('reference').order('id');

        /* Une ligne de plus que la page : elle dit s'il y a une suite, même
           quand le compte n'arrive pas. */
        const { data, error } = await q.range(debut, debut + o.parPage);
        if (annule) return;
        if (error) throw error;
        const rangs = (data || []) as unknown as Parameters<typeof dbToProduitPublic>[0][];
        suite = rangs.length > o.parPage;
        lus = Math.min(rangs.length, o.parPage);
        setLignes(rangs.slice(0, o.parPage).map(dbToProduitPublic));
        // En attendant le compte : au moins ce qu'on voit, et une page de plus s'il y en a.
        /* Changer de page garde le compte déjà connu ; une autre recherche
           repart de ce qu'on voit, en attendant le sien. */
        const plancherVu = debut + lus + (suite ? 1 : 0);
        setTotal(t => (cleRequete === derniereCle.current ? Math.max(t, plancherVu) : plancherVu));
        derniereCle.current = cleRequete;
      } catch (e) {
        if (!annule) setErreur((e as Error).message);
        return;
      } finally {
        if (!annule) setChargement(false);
      }

      const plancher = debut + lus + (suite ? 1 : 0);
      for (const mode of ['exact', 'planned'] as const) {
        const { count, error } = await construire('id', mode);
        if (annule) return;
        if (!error && count != null) {
          setTotal(Math.max(count, plancher));
          setTotalEstime(mode !== 'exact');
          return;
        }
        console.warn(`[catalogue] compte ${mode} impossible :`, error?.message);
      }
      setTotal(plancher);
      setTotalEstime(true);
    })();

    return () => { annule = true; };
  }, [o.actif, o.page, o.parPage, rechercheDifferee, o.triCol, o.triSens, filtresDifferes,
      o.seulementModeles, o.modeleCle, o.version]);

  return useMemo(
    () => ({ lignes, total, totalEstime, chargement: chargement || enAttente, erreur }),
    [lignes, total, totalEstime, chargement, enAttente, erreur],
  );
}
