import type { Produit } from '@/lib/store';

/**
 * Index de recherche du catalogue, calculé une fois par tableau de produits.
 *
 * Le catalogue compte 22 634 articles. Sans index, chaque frappe dans un
 * sélecteur d'article rappelait `toLowerCase()` sur trois champs pour chacun
 * d'eux — 68 000 chaînes créées puis jetées par caractère tapé. Et chaque
 * ligne de devis affichée refaisait un `produits.find()` complet à chaque
 * rendu : sur un devis de trente lignes, 680 000 comparaisons par frappe,
 * dans n'importe quel champ du formulaire.
 *
 * L'index est mémorisé dans une WeakMap sur le tableau lui-même : tant que le
 * store ne remplace pas `produits`, toutes les lignes du devis partagent le
 * même travail, et l'index disparaît avec le tableau sans qu'on ait à le
 * libérer.
 */

export interface EntreeIndex {
  p: Produit;
  ref: string;
  desc: string;
  cat: string;
}

export interface IndexProduits {
  entrees: EntreeIndex[];
  parId: Map<string, Produit>;
}

const cache = new WeakMap<readonly Produit[], IndexProduits>();

export function indexProduits(produits: Produit[]): IndexProduits {
  const connu = cache.get(produits);
  if (connu) return connu;

  const entrees: EntreeIndex[] = new Array(produits.length);
  const parId = new Map<string, Produit>();
  for (let i = 0; i < produits.length; i++) {
    const p = produits[i];
    entrees[i] = {
      p,
      ref: (p.reference || '').toLowerCase(),
      desc: (p.description || '').toLowerCase(),
      cat: (p.categorie || '').toLowerCase(),
    };
    parId.set(p.id, p);
  }

  const index = { entrees, parId };
  cache.set(produits, index);
  return index;
}

/** Retrouve un article par son identifiant sans balayer le catalogue. */
export function produitParId(produits: Produit[], id?: string | null) {
  if (!id) return undefined;
  return indexProduits(produits).parId.get(id);
}

/**
 * Cherche dans le catalogue et renvoie au plus `limite` résultats.
 *
 * Les résultats sont classés : d'abord les références qui commencent par la
 * saisie — taper « J11 » doit proposer J11C2 avant une balise dont la
 * description mentionne « conforme J11 » — puis les références qui la
 * contiennent, enfin les descriptions et catégories.
 */
export function chercherProduits(
  produits: Produit[],
  requete: string,
  limite = 60,
): { resultats: Produit[]; total: number } {
  const { entrees } = indexProduits(produits);
  const q = requete.trim().toLowerCase();

  if (!q) {
    return { resultats: produits.slice(0, limite), total: produits.length };
  }

  const debutRef: Produit[] = [];
  const dansRef: Produit[] = [];
  const ailleurs: Produit[] = [];
  let total = 0;

  for (let i = 0; i < entrees.length; i++) {
    const e = entrees[i];
    if (e.ref.startsWith(q)) { total++; if (debutRef.length < limite) debutRef.push(e.p); continue; }
    if (e.ref.includes(q)) { total++; if (dansRef.length < limite) dansRef.push(e.p); continue; }
    if (e.desc.includes(q) || e.cat.includes(q)) {
      total++;
      if (ailleurs.length < limite) ailleurs.push(e.p);
    }
  }

  return {
    resultats: [...debutRef, ...dansRef, ...ailleurs].slice(0, limite),
    total,
  };
}
