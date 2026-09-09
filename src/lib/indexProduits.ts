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
 *
 * ⚠️ **DEUX CACHES ET NON UN SEUL.** Les tags (`produitTags.ts`) arrivent
 * après le catalogue et changent dès qu'on en apprend un ; les entrées de
 * recherche en dépendent donc, mais pas la table des identifiants.
 * `produitParId` est appelée à chaque rendu de chaque ligne de devis, sans
 * tags : partager un cache unique la ferait reconstruire l'index complet à
 * chaque alternance avec une recherche taguée — 22 634 entrées par frappe,
 * exactement ce que cet index existe pour éviter.
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
  /**
   * Les mots du CLIENT attachés à l'article (`produitTags.ts`), prêts à
   * chercher. Vide quand l'article n'en porte aucun — c'est le cas de la
   * quasi-totalité du catalogue.
   */
  tags: string;
}

/** Finition d'une référence Odoo : le dernier segment classé « ral ». */
function finitionDeReference(reference: string): string {
  const segments = reference.split('.');
  for (let i = segments.length - 1; i >= 0; i--) {
    if (classifySegment(segments[i]) === 'ral') return segments[i].toLowerCase();
  }
  return '';
}

/**
 * Le texte cherché pour les tags d'un article : les mots retenus, **plus leur
 * pluriel**.
 *
 * On a retenu « cycliste » et le client suivant écrit « cyclistes ». La
 * recherche compare des morceaux de texte : sans le pluriel dans l'index, ce
 * « s » suffirait à manquer l'article, et tout l'intérêt du tag avec. Le
 * pluriel est ajouté ici plutôt que retiré de la saisie parce que la saisie,
 * elle, sert aussi à chercher les références — où un « s » final compte.
 */
function texteDesTags(tags: readonly string[]): string {
  const morceaux: string[] = [];
  for (const tag of tags) {
    morceaux.push(tag);
    for (const mot of tag.split(/\s+/)) {
      if (mot.length >= 4 && !mot.endsWith('s')) morceaux.push(`${mot}s`);
    }
  }
  return morceaux.join(' ').toLowerCase();
}

export interface IndexProduits {
  entrees: EntreeIndex[];
  parId: Map<string, Produit>;
}

/** Tags par identifiant d'article — l'`indexTags()` de `produitTags.ts`. */
export type TagsParProduit = ReadonlyMap<string, string[]>;

const cacheId = new WeakMap<readonly Produit[], Map<string, Produit>>();
const cacheEntrees = new WeakMap<
  readonly Produit[],
  { tags: TagsParProduit | undefined; entrees: EntreeIndex[] }
>();

function tableIdentifiants(produits: Produit[]): Map<string, Produit> {
  const connu = cacheId.get(produits);
  if (connu) return connu;
  const parId = new Map<string, Produit>();
  for (let i = 0; i < produits.length; i++) parId.set(produits[i].id, produits[i]);
  cacheId.set(produits, parId);
  return parId;
}

function entreesDeRecherche(produits: Produit[], tags?: TagsParProduit): EntreeIndex[] {
  const connu = cacheEntrees.get(produits);
  if (connu && connu.tags === tags) return connu.entrees;

  const entrees: EntreeIndex[] = new Array(produits.length);
  for (let i = 0; i < produits.length; i++) {
    const p = produits[i];
    const sesTags = tags?.get(p.id);
    entrees[i] = {
      p,
      ref: (p.reference || '').toLowerCase(),
      // Les deux désignations sont cherchées : « IS KC1 » reste tapable, et
      // « KC1 800 600 C1 BRUT (MARCO POLO) » le devient.
      desc: `${p.description || ''} ${p.descriptionVariante || ''}`.toLowerCase(),
      cat: (p.categorie || '').toLowerCase(),
      ral: finitionDeReference(p.reference || ''),
      tags: sesTags && sesTags.length ? texteDesTags(sesTags) : '',
    };
  }

  cacheEntrees.set(produits, { tags, entrees });
  return entrees;
}

export function indexProduits(produits: Produit[], tags?: TagsParProduit): IndexProduits {
  return { entrees: entreesDeRecherche(produits, tags), parId: tableIdentifiants(produits) };
}

/** Retrouve un article par son identifiant sans balayer le catalogue. */
export function produitParId(produits: Produit[], id?: string | null) {
  if (!id) return undefined;
  return tableIdentifiants(produits).get(id);
}

/**
 * Cherche dans le catalogue et renvoie au plus `limite` résultats.
 *
 * Les résultats sont classés : d'abord les références qui commencent par la
 * saisie — taper « J11 » doit proposer J11C2 avant une balise dont la
 * description mentionne « conforme J11 » — puis les références qui la
 * contiennent, enfin les descriptions, catégories et tags.
 *
 * ⚠️ **Les tags cherchent au rang le plus large, jamais devant une
 * référence.** Un tag est un mot appris, parfois d'un seul devis : le hisser
 * ferait remonter un article marginal sur un mot que le catalogue porte déjà
 * correctement ailleurs.
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
  tags?: TagsParProduit,
): { resultats: Produit[]; total: number } {
  const entrees = entreesDeRecherche(produits, tags);
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
       entre référence, désignation, catégorie et mots du client. */
    let rang = -1;
    if (termes.every(t => e.ref.includes(t))) rang = e.ref.startsWith(termes[0]) ? 0 : 1;
    else {
      const tout = e.tags
        ? `${e.ref} ${e.desc} ${e.cat} ${e.tags}`
        : `${e.ref} ${e.desc} ${e.cat}`;
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
