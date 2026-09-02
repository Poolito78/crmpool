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
