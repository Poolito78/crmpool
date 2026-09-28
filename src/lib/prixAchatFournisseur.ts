import type { Produit, ProduitFournisseur, Fournisseur } from './store';

/**
 * Reprise des prix d'ACHAT depuis un document fournisseur.
 *
 * L'analyse de document savait lire un devis CLIENT et en faire un devis. Le
 * symétrique manquait : un fournisseur envoie sa nouvelle offre, et les prix
 * d'achat étaient ressaisis à la main, article par article — quand ils
 * l'étaient. Un tarif fournisseur reçu et non répercuté ne se voit nulle
 * part : les devis continuent de sortir sur l'ancien coût, et la marge
 * affichée est fausse sans que rien ne le signale.
 *
 * Ce module ne décide rien. Il PROPOSE, ligne par ligne, ce qu'il a compris —
 * l'article visé, le prix lu, l'écart avec ce qu'on paie aujourd'hui — et
 * laisse l'arbitrage à celui qui a le document sous les yeux.
 */

/* ── Le fournisseur ──────────────────────────────────────────────────────── */

/** Formes juridiques et bruits de fond qui ne distinguent pas deux sociétés. */
const MOTS_SOCIETE = new Set([
  'sa', 'sas', 'sasu', 'sarl', 'eurl', 'sci', 'snc', 'gie', 'scop',
  'ste', 'societe', 'sté', 'cie', 'et', 'the', 'group', 'groupe',
  'france', 'sa.', 'sas.', 'ltd', 'gmbh', 'bv', 'nv', 'spa', 'srl',
]);

export function normaliserNom(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function motsSignificatifs(nom: string): string[] {
  return normaliserNom(nom)
    .split(' ')
    .filter(m => m.length >= 2 && !MOTS_SOCIETE.has(m.toLowerCase()));
}

/**
 * Retrouve le fournisseur nommé sur le document.
 *
 * Le nom lu ne coïncide presque jamais avec celui de la fiche : « TREMCO CPG
 * FRANCE SAS » d'un côté, « Tremco CPG » de l'autre. On compare donc les mots
 * qui distinguent vraiment — la forme juridique et le pays n'en sont pas.
 *
 * Un seul mot commun suffit s'il est distinctif, mais on exige qu'il soit
 * assez long : « CPG » rapproche, « ET » non. Et le meilleur candidat n'est
 * retenu que s'il devance nettement le suivant — deux fournisseurs qui
 * répondent également bien, c'est une question à poser, pas à trancher.
 */
export function rapprocherFournisseur(
  nomLu: string | undefined,
  fournisseurs: Fournisseur[],
): Fournisseur | undefined {
  const cherches = motsSignificatifs(nomLu || '');
  if (!cherches.length || !fournisseurs.length) return undefined;

  const scores = fournisseurs.map(f => {
    const cibles = new Set([
      ...motsSignificatifs(f.nom),
      ...motsSignificatifs(f.societe || ''),
    ]);
    let score = 0;
    for (const m of cherches) if (cibles.has(m)) score += m.length;
    return { f, score };
  }).filter(x => x.score >= 3).sort((a, b) => b.score - a.score);

  if (!scores.length) return undefined;
  if (scores.length > 1 && scores[1].score >= scores[0].score) return undefined;
  return scores[0].f;
}

/* ── Le coefficient de vente ─────────────────────────────────────────────── */

export interface Coefficient {
  /** prix public = prix d'achat × coef. */
  coef: number;
  /** Nombre d'articles sur lesquels il est mesuré. */
  effectif: number;
  /** Catégorie effectivement utilisée (celle de l'article, ou une plus large). */
  categorie: string;
  /**
   * Le coefficient est-il assez régulier pour qu'on ose s'en servir ?
   *
   * Faux quand les articles de la catégorie ne s'accordent pas entre eux.
   */
  fiable: boolean;
}

/** Écart toléré entre le premier et le troisième quartile, en proportion. */
const DISPERSION_MAX = 1.6;
/** En deçà, l'échantillon ne dit rien. */
const EFFECTIF_MIN = 5;

function quantile(tries: number[], p: number): number {
  if (tries.length === 1) return tries[0];
  const pos = (tries.length - 1) * p;
  const bas = Math.floor(pos);
  const haut = Math.ceil(pos);
  if (bas === haut) return tries[bas];
  return tries[bas] + (tries[haut] - tries[bas]) * (pos - bas);
}

/** Les catégories à essayer, de la plus précise à la plus large. */
function categoriesCandidates(categorie?: string): string[] {
  const c = (categorie || '').trim();
  if (!c) return [];
  const segments = c.split('/').map(s => s.trim()).filter(Boolean);
  const essais = [c];
  // « ISOMARK / FLOORING / EPOXY » → « EPOXY », puis « ISOMARK / FLOORING ».
  if (segments.length > 1) {
    essais.push(segments[segments.length - 1]);
    essais.push(segments.slice(0, -1).join(' / '));
  }
  return [...new Set(essais)];
}

/**
 * Le rapport prix public / prix d'achat pratiqué sur une catégorie.
 *
 * Il n'est pas inventé : on le MESURE sur les articles déjà en base. Un
 * nouvel article d'une famille connue prend le coefficient de sa famille,
 * pas un chiffre choisi par un développeur qui ne vend rien.
 *
 * Encore faut-il que la famille s'accorde avec elle-même. Sur les résines le
 * catalogue est net — EPOXY, PU et MMA tiennent tous les trois à 2,29, du
 * premier au troisième quartile. Sur la signalisation il ne dit rien de
 * cohérent : premier quartile à 0,05, troisième à 23, parce que `prix_achat`
 * y mélange des coûts à l'unité et au kilo. Là, `fiable` vaut faux, et
 * l'appelant doit s'abstenir plutôt que de propager une valeur absurde dans
 * 22 508 articles.
 */
export function coefficientVente(
  produits: Produit[],
  categorie?: string,
): Coefficient | null {
  for (const cat of categoriesCandidates(categorie)) {
    const cible = cat.toUpperCase();
    const rapports = produits
      .filter(p => (p.categorie || '').trim().toUpperCase() === cible)
      .filter(p => (p.prixAchat ?? 0) > 0 && (p.prixHT ?? 0) > 0)
      .map(p => p.prixHT / p.prixAchat)
      .sort((a, b) => a - b);

    if (rapports.length < EFFECTIF_MIN) continue;

    const q1 = quantile(rapports, 0.25);
    const q3 = quantile(rapports, 0.75);
    const median = quantile(rapports, 0.5);
    if (!(median > 0)) continue;

    return {
      coef: median,
      effectif: rapports.length,
      categorie: cat,
      fiable: q1 > 0 && q3 / q1 <= DISPERSION_MAX,
    };
  }
  return null;
}

/* ── Les propositions ────────────────────────────────────────────────────── */

/**
 * Ce que le document demande de faire d'une ligne.
 *
 * `absent` n'est pas une erreur : c'est le cas normal d'un article que le
 * fournisseur vend et qu'on ne référence pas encore.
 */
export type ActionPrix =
  /** L'article existe et ce fournisseur lui est déjà rattaché : le prix change. */
  | 'actualiser'
  /** L'article existe, mais pas le lien avec ce fournisseur : on le crée. */
  | 'rattacher'
  /** Le prix lu est celui qu'on paie déjà. */
  | 'inchange'
  /** Aucun article du catalogue ne correspond. */
  | 'absent'
  /** La ligne ne porte pas de prix exploitable. */
  | 'sans_prix';

export interface PropositionPrix {
  /** Indice de la ligne dans le document analysé. */
  indice: number;
  action: ActionPrix;
  /** Article du catalogue retenu, quand il y en a un. */
  produit?: Produit;
  /** Lien produit ↔ fournisseur existant, quand il y en a un. */
  lien?: ProduitFournisseur;
  /** Prix d'achat unitaire lu sur le document. */
  prixLu?: number;
  /** Prix d'achat de la fiche fournisseur aujourd'hui. */
  prixLien?: number;
  /** Prix d'achat de la fiche article aujourd'hui. */
  prixArticle?: number;
  /** Variation par rapport au prix de la fiche fournisseur, en %. */
  ecartLien?: number;
  /** Variation par rapport au prix de la fiche article, en %. */
  ecartArticle?: number;
  /** Prix de vente proposé pour un article à créer. */
  prixVentePropose?: number;
  /** Le coefficient qui l'a produit, pour que l'écran puisse le dire. */
  coefficient?: Coefficient;
}

/** Deux prix se valent en dessous du demi-centime. */
export const memePrix = (a?: number, b?: number) =>
  a == null || b == null ? a === b : Math.abs(a - b) < 0.005;

function variation(avant?: number, apres?: number): number | undefined {
  if (avant == null || apres == null || avant <= 0) return undefined;
  return ((apres - avant) / avant) * 100;
}

/**
 * Ce qu'il faut faire d'une ligne de document fournisseur.
 *
 * Le rapprochement d'article n'est PAS refait ici : l'écran s'en charge avec
 * `rapprocherArticle`, le même que pour un devis client, et nous passe
 * l'article retenu — ou celui que l'utilisateur a corrigé à la main. Ce
 * module ne s'occupe que de ce qui suit : quel prix, comparé à quoi.
 */
export function proposerPrix(args: {
  indice: number;
  prixLu?: number | null;
  produit?: Produit;
  fournisseurId?: string;
  liens: ProduitFournisseur[];
  produits: Produit[];
}): PropositionPrix {
  const { indice, produit, fournisseurId, liens, produits } = args;
  const prixLu = args.prixLu == null || args.prixLu <= 0 ? undefined : args.prixLu;

  if (prixLu === undefined) return { indice, action: 'sans_prix', produit };

  if (!produit) {
    /* Sans catégorie connue, aucun coefficient ne s'applique : l'article est
       créé sans prix de vente, et l'écran le dit. */
    return { indice, action: 'absent', prixLu };
  }

  const lien = fournisseurId
    ? liens.find(l => l.produitId === produit.id && l.fournisseurId === fournisseurId)
    : undefined;

  const prixLien = lien?.prixAchat;
  const prixArticle = produit.prixAchat;

  const action: ActionPrix = !lien
    ? 'rattacher'
    : memePrix(prixLien, prixLu) ? 'inchange' : 'actualiser';

  const coefficient = coefficientVente(produits, produit.categorie) ?? undefined;

  return {
    indice,
    action,
    produit,
    lien,
    prixLu,
    prixLien,
    prixArticle,
    ecartLien: variation(prixLien, prixLu),
    ecartArticle: variation(prixArticle, prixLu),
    coefficient,
  };
}

/**
 * Le prix de vente à proposer pour un article qu'on va créer.
 *
 * Rien quand le catalogue ne fournit pas de coefficient fiable : mieux vaut
 * un prix de vente vide, qui saute aux yeux dès le premier devis, qu'un prix
 * plausible et faux, qui part chez le client sans que personne ne le relise.
 */
export function prixVenteDepuisAchat(
  prixAchat: number,
  coefficient: Coefficient | null | undefined,
): number | undefined {
  if (!coefficient?.fiable || !(prixAchat > 0)) return undefined;
  return Math.round(prixAchat * coefficient.coef * 100) / 100;
}

/**
 * L'article à CRÉER pour une ligne de document fournisseur.
 *
 * Deux chemins y mènent, et doivent produire la même fiche : l'analyse de
 * document (ligne « hors catalogue » cochée à créer) et la page Devis
 * Fournisseurs, où l'on corrige après coup une ligne rattachée au mauvais
 * article — la résine méthacrylate URBADECO du 28/09/2026 était partie sur
 * GRANITROUGE1-3, un granulat.
 *
 * Fonction PURE. Le prix de vente ne se propose que si la catégorie donne un
 * coefficient fiable (`prixVenteDepuisAchat`) : sinon zéro, qui se voit au
 * premier devis.
 */
export function articleDepuisLigne(args: {
  id: string;
  referenceFournisseur?: string;
  reference?: string;
  designation?: string;
  prixAchat: number;
  categorie?: string;
  fournisseurId?: string;
  tva?: number;
  produits: Produit[];
  horodate: string;
  aujourdhui: string;
}): Produit {
  const designation = (args.designation || '').trim();
  const reference = (args.reference || '').trim()
    || (args.referenceFournisseur || '').trim()
    || designation.slice(0, 40)
    || 'NOUVEAU';
  const categorie = (args.categorie || '').trim() || undefined;
  const coefficient = categorie ? coefficientVente(args.produits, categorie) : null;
  return {
    id: args.id,
    reference,
    description: designation,
    prixAchat: args.prixAchat, coefficient: 1,
    prixHT: prixVenteDepuisAchat(args.prixAchat, coefficient) ?? 0,
    coeffRevendeur: 1, remiseRevendeur: 0, prixRevendeur: 0,
    tva: args.tva ?? 20, unite: 'u', stock: 0, stockMin: 0,
    prixAchatMaj: args.horodate,
    dateCreation: args.aujourdhui,
    origine: 'crm',
    ...(categorie ? { categorie } : {}),
    ...(args.fournisseurId ? { fournisseurId: args.fournisseurId } : {}),
  };
}

/** L'article qui porte déjà cette référence, casse comprise ignorée. */
export function referencePrise(reference: string, produits: Produit[]): Produit | undefined {
  const r = reference.trim().toUpperCase();
  return r ? produits.find(p => (p.reference || '').trim().toUpperCase() === r) : undefined;
}

/**
 * Une référence libre, dérivée de celle proposée : « X », sinon « X-2 »,
 * « X-3 »… La référence est UNIQUE en base (`idx_produits_reference_unique`) :
 * une désignation reprise telle quelle comme référence — ce que fait un article
 * créé sans référence fournisseur — pouvait déjà exister, et l'article était
 * refusé.
 */
export function referenceLibre(reference: string, produits: Produit[]): string {
  const base = reference.trim() || 'NOUVEAU';
  if (!referencePrise(base, produits)) return base;
  for (let n = 2; n < 1000; n++) {
    const essai = `${base}-${n}`;
    if (!referencePrise(essai, produits)) return essai;
  }
  return `${base}-${Date.now()}`;
}

/* ── L'écriture ──────────────────────────────────────────────────────────── */

/** Une ligne dont on a décidé le sort. */
export interface CibleEcriture {
  produitId: string;
  prix: number;
  /** Référence sous laquelle le fournisseur vend cet article. */
  reference?: string;
  /** Écrire sur la fiche fournisseur (`produit_fournisseurs`). */
  versLien: boolean;
  /** Écrire sur le `prixAchat` de la fiche article. */
  versArticle: boolean;
  /** La ligne du document, pour reconnaître un prix au kilo. */
  designation?: string;
  quantite?: number;
  unite?: string;
}

/**
 * ⚠️ **UN PRIX AU KILO N'EST PAS LE PRIX DU FÛT.**
 *
 * La fiche article porte le prix du CONDITIONNEMENT. URBADECO chiffre la
 * colle Eclipse « (Fût de 25kg) » par 175 kg à 3,15 € : le prix lu est au
 * kilo, et l'écrire tel quel sur ECLIPSE25 affichait 97,8 % de marge.
 *
 * On ne convertit que sur preuve : unité « kg » écrite sur la ligne, ou
 * conditionnement annoncé par la désignation égal au poids de l'article ET
 * quantité en multiple de ce conditionnement. Et jamais si le prix converti
 * dépasserait le prix de vente : 25 sacs de 25 kg à 17,50 € sont des sacs.
 * Le doute laisse le prix lu, tel quel.
 */
export function prixConditionnement(
  prix: number,
  produit: Pick<Produit, 'poids' | 'prixHT'> | undefined,
  ligne: { designation?: string; quantite?: number; unite?: string },
): number {
  const poids = produit?.poids ?? 0;
  if (!(poids > 1) || !(prix > 0)) return prix;
  const auKilo = /^kgs?$/i.test((ligne.unite || '').trim());
  const m = (ligne.designation || '').match(/(\d+(?:[.,]\d+)?)\s*kgs?\b/i);
  const annonce = m ? Number(m[1].replace(',', '.')) : 0;
  const q = ligne.quantite ?? 0;
  const enKilos = annonce > 0 && Math.abs(annonce - poids) < 0.01
    && q > annonce && Math.abs(q / annonce - Math.round(q / annonce)) < 1e-6;
  if (!auKilo && !enKilos) return prix;
  const converti = Math.round(prix * poids * 100) / 100;
  if ((produit?.prixHT ?? 0) > 0 && converti > produit!.prixHT) return prix;
  return converti;
}

/**
 * Les collections telles qu'elles seront après application.
 *
 * Fonction PURE : elle ne parle ni à Supabase ni au store, elle rend les deux
 * tableaux mis à jour. C'est ce qui permet à l'analyse de document et à la
 * page « Devis Fournisseurs » d'appliquer un prix exactement de la même
 * façon — un prix appliqué depuis l'écran de lecture et le même prix appliqué
 * six mois plus tard depuis la fiche du devis doivent produire le même
 * résultat, sans quoi il faudrait se demander lequel des deux fait foi.
 */
export function appliquerPrix(args: {
  cibles: CibleEcriture[];
  fournisseurId: string;
  liens: ProduitFournisseur[];
  produits: Produit[];
  horodate: string;
  nouvelId: () => string;
}): { liens: ProduitFournisseur[]; produits: Produit[]; nbLiens: number; nbArticles: number } {
  const { cibles, fournisseurId, horodate, nouvelId } = args;

  const versArticle = new Map<string, number>();
  for (const c of cibles) {
    if (!c.versArticle) continue;
    const produit = args.produits.find(p => p.id === c.produitId);
    versArticle.set(c.produitId, prixConditionnement(c.prix, produit, c));
  }

  const produits = versArticle.size
    ? args.produits.map(p => {
        const prix = versArticle.get(p.id);
        if (prix == null || memePrix(prix, p.prixAchat)) return p;
        return { ...p, prixAchat: prix, prixAchatMaj: horodate };
      })
    : args.produits;

  const liens = [...args.liens];
  let nbLiens = 0;
  for (const c of cibles) {
    if (!c.versLien) continue;
    const idx = liens.findIndex(pf =>
      pf.produitId === c.produitId && pf.fournisseurId === fournisseurId);
    if (idx >= 0) {
      liens[idx] = {
        ...liens[idx],
        prixAchat: c.prix,
        /* La référence n'est complétée que si elle manquait : celle saisie à
           la main vaut mieux que celle lue sur un PDF. */
        referenceFournisseur: liens[idx].referenceFournisseur || (c.reference || ''),
      };
    } else {
      liens.push({
        id: nouvelId(),
        produitId: c.produitId,
        fournisseurId,
        prixAchat: c.prix,
        referenceFournisseur: c.reference || '',
        delaiLivraison: 0,
        conditionnementMin: 1,
        estPrioritaire: false,
      });
    }
    nbLiens++;
  }

  return { liens, produits, nbLiens, nbArticles: versArticle.size };
}
