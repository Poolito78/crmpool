import type { Produit } from '@/lib/store';
import { classifySegment } from '@/lib/variantFunnel';

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
  /**
   * Segment de finition porté par la référence, en minuscules : `brut`,
   * `l7003`, `lchamp`… Vide quand la référence n'en porte pas (la plupart
   * des articles hors panneaux). Sert au classement des résultats, pas au
   * filtrage : c'est le même segment que l'entonnoir de variantes appelle
   * « RAL ».
   */
  ral: string;
}

/** Finition d'une référence Odoo : le dernier segment classé « ral ». */
function finitionDeReference(reference: string): string {
  const segments = reference.split('.');
  for (let i = segments.length - 1; i >= 0; i--) {
    if (classifySegment(segments[i]) === 'ral') return segments[i].toLowerCase();
  }
  return '';
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
      // Les deux désignations sont cherchées : « IS KC1 » reste tapable, et
      // « KC1 800 600 C1 BRUT (MARCO POLO) » le devient.
      desc: `${p.description || ''} ${p.descriptionVariante || ''}`.toLowerCase(),
      cat: (p.categorie || '').toLowerCase(),
      ral: finitionDeReference(p.reference || ''),
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
 *
 * À rang égal, **la finition BRUT passe devant les laquées**. Sans cette
 * règle, taper « BSP.650.C2.BTR » ramenait d'abord L7003, L5010, L7016… et
 * reléguait BRUT en fin de liste, alors qu'aucun RAL n'était demandé — on
 * vend brut par défaut, un laquage se commande. C'est la même règle que
 * l'entonnoir de variantes applique déjà (RAL = BRUT tant qu'on n'en tape
 * pas un). Une laquée nommée dans la saisie n'est pas reléguée : chercher
 * « L7016 » doit la remonter. La règle ne filtre rien — elle ne fait que
 * classer ce qui correspond déjà.
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

  /* Mot à mot. « A13A 700 » cherché d'un bloc ne trouve rien : dans
     A13A.700.C1.BTR.IS.BRUT les deux morceaux sont séparés par un point, pas
     par l'espace tapé. On coupe donc la saisie, et on ne garde que les
     articles qui portent TOUS les mots, où qu'ils soient. Le point est un
     séparateur comme l'espace : coller la référence entière revient à taper
     ses segments. */
  const termes = q.split(/[\s.]+/).filter(Boolean);

  /* Six seaux : trois rangs de pertinence × deux finitions (brut d'abord).
     Chaque seau est plafonné séparément — plafonner AVANT de trier ferait
     disparaître les BRUT quand soixante laquées les précèdent au catalogue. */
  const seaux: Produit[][] = [[], [], [], [], [], []];
  let total = 0;

  for (let i = 0; i < entrees.length; i++) {
    const e = entrees[i];

    /* Trois rangs, du plus précis au plus large : la référence commence par
       la saisie, la référence la porte entière, ou elle se retrouve éparpillée
       entre référence, désignation et catégorie. */
    let rang = -1;
    if (termes.every(t => e.ref.includes(t))) rang = e.ref.startsWith(termes[0]) ? 0 : 1;
    else {
      const tout = `${e.ref} ${e.desc} ${e.cat}`;
      if (termes.every(t => tout.includes(t))) rang = 2;
    }
    if (rang < 0) continue;

    total++;
    // Une laquée ne recule que si la saisie ne la nomme pas.
    /* Le RAL n'est « demandé » que si un mot le nomme : il commence par L
       (L7016, L70…) ou vaut BRUT. Sans cette précaution, chercher la cote
       « A11 1000 » ferait passer le laquage L1000 pour une demande de RAL et
       le hisserait à côté de la brute. */
    const nomme = termes.some(t => (t === 'brut' || t.startsWith('l')) && e.ral.startsWith(t));
    const laquee = e.ral !== '' && e.ral !== 'brut' && !nomme;
    const seau = seaux[rang * 2 + (laquee ? 1 : 0)];
    if (seau.length < limite) seau.push(e.p);
  }

  return {
    resultats: seaux.flat().slice(0, limite),
    total,
  };
}
