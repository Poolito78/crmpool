import type { Devis, LigneDevis, Produit } from '@/lib/store';
import { produitParId } from '@/lib/indexProduits';

/**
 * Ce que le commercial corrige APRÈS la création du devis par l'analyse.
 *
 * ⚠️ **L'AGENT NE VOYAIT QUE LES CORRECTIONS FAITES DANS L'ÉCRAN D'ANALYSE.**
 * Le devis créé, le commercial le reprend dans l'éditeur : il change un
 * article, ajoute les brides, retouche une quantité, retire une ligne. Rien
 * de cela ne revenait à l'analyseur — sauf à réimporter le devis Odoo
 * (`comparaisonDevis.ts`). La demande suivante, identique, repartait sur la
 * même erreur.
 *
 * L'analyse fige donc sa proposition dans le devis (`Devis.chiffrageAnalyse`,
 * colonne jsonb `chiffrage_analyse`), avec le texte de la demande. Chaque
 * enregistrement à la main confronte les lignes du devis à cette proposition
 * — par l'IDENTIFIANT de ligne, que l'éditeur conserve, jamais par la
 * ressemblance : c'est le même devis.
 *
 *  - `article`  : la ligne porte la demande du client et un autre article —
 *    c'est ce que la mémoire (`memoireArticles.ts`) apprend ;
 *  - `quantite` / `prix` : même ligne, autre quantité ou autre prix ;
 *  - `ajout`    : une ligne d'article que l'agent n'avait pas proposée (l'oubli :
 *    brides, support, port…) ;
 *  - `retrait`  : une ligne proposée que le commercial a supprimée.
 *
 * Seul l'article s'apprend seul. Le reste est montré et se copie en relevé :
 * une quantité ou un oubli se corrige dans une RÈGLE de chiffrage, pas dans
 * une mémoire de mots.
 */

/** Une ligne d'article telle que l'analyse l'a proposée. */
export interface LigneProposee {
  id: string;
  produitId?: string;
  reference?: string;
  description: string;
  quantite: number;
  /** Prix unitaire net (remise déduite). */
  pu: number;
  demandeClient?: string;
}

export interface ChiffrageAnalyse {
  /** Date ISO de la création du devis par l'analyse. */
  date: string;
  /** Le texte de la demande (mail, signature retirée), tronqué. */
  demande?: string;
  /** Noms des pièces déposées (le .msg, ses PDF), joints au devis. */
  pieces?: string[];
  lignes: LigneProposee[];
  fraisPortHT?: number;
}

export type TypeCorrection = 'article' | 'quantite' | 'prix' | 'ajout' | 'retrait';

export interface CorrectionDevis {
  type: TypeCorrection;
  avant?: LigneProposee;
  apres?: LigneProposee;
}

/** Un texte de demande n'a pas à alourdir chaque lecture du devis. */
export const DEMANDE_MAX = 20000;

const estArticle = (l: LigneDevis) =>
  l.type !== 'groupe' && l.type !== 'soustotal' && l.type !== 'texte';

const arrondi = (n: number) => Math.round(n * 10000) / 10000;

/** Les lignes d'article du devis, sous la forme de la proposition. */
export function lignesProposees(lignes: LigneDevis[], produits: Produit[]): LigneProposee[] {
  return lignes.filter(estArticle).map(l => {
    const p = l.produitId ? produitParId(produits, l.produitId) : undefined;
    const reference = (l.referenceOdoo || p?.reference || p?.referenceOdoo || '').trim();
    return {
      id: l.id,
      ...(l.produitId ? { produitId: l.produitId } : {}),
      ...(reference ? { reference } : {}),
      description: l.description || '',
      quantite: Number(l.quantite) || 0,
      pu: arrondi((Number(l.prixUnitaireHT) || 0) * (1 - (Number(l.remise) || 0) / 100)),
      ...(l.demandeClient ? { demandeClient: l.demandeClient } : {}),
    };
  });
}

/** La proposition de l'analyse, à figer dans le devis qu'elle crée. */
export function figerChiffrage(
  devis: Pick<Devis, 'lignes' | 'fraisPortHT'>,
  produits: Produit[],
  source: { demande?: string; pieces?: string[]; date?: string } = {},
): ChiffrageAnalyse {
  const demande = source.demande?.trim();
  return {
    date: source.date ?? new Date().toISOString(),
    ...(demande ? { demande: demande.slice(0, DEMANDE_MAX) } : {}),
    ...(source.pieces?.length ? { pieces: source.pieces } : {}),
    lignes: lignesProposees(devis.lignes, produits),
    ...(devis.fraisPortHT ? { fraisPortHT: devis.fraisPortHT } : {}),
  };
}

/** Un centime ET un pour cent : un arrondi n'est pas une correction. */
const ecartPrix = (a: number, b: number) => Math.abs(a - b) > 0.01 && Math.abs(a - b) > Math.abs(b) * 0.01;

/** Même article : même fiche, ou à défaut même référence. Deux lignes libres se valent. */
function memeArticle(a: LigneProposee, b: LigneProposee): boolean {
  if (a.produitId || b.produitId) return a.produitId === b.produitId;
  return (a.reference || '').toUpperCase() === (b.reference || '').toUpperCase();
}

/** Les corrections du devis par rapport à la proposition, dans l'ordre du devis. */
export function corrections(chiffrage: ChiffrageAnalyse, lignes: LigneDevis[], produits: Produit[]): CorrectionDevis[] {
  const actuelles = lignesProposees(lignes, produits);
  const avantParId = new Map(chiffrage.lignes.map(l => [l.id, l]));
  const vues = new Set<string>();
  const res: CorrectionDevis[] = [];

  for (const apres of actuelles) {
    const avant = avantParId.get(apres.id);
    if (!avant) { res.push({ type: 'ajout', apres }); continue; }
    vues.add(apres.id);
    if (!memeArticle(avant, apres)) { res.push({ type: 'article', avant, apres }); continue; }
    if (Math.abs(avant.quantite - apres.quantite) > 0.001) res.push({ type: 'quantite', avant, apres });
    else if (ecartPrix(apres.pu, avant.pu)) res.push({ type: 'prix', avant, apres });
  }
  for (const avant of chiffrage.lignes) {
    if (!vues.has(avant.id)) res.push({ type: 'retrait', avant });
  }
  return res;
}

export interface ArticleAApprendre {
  demande: string;
  produitId: string;
  reference: string;
  designation: string;
}

/**
 * Les corrections d'article que la mémoire peut retenir : la demande du client
 * → l'article finalement choisi.
 *
 * ⚠️ Une ligne sans `demandeClient` n'apprend rien (sa désignation est celle
 * du MAUVAIS article, pas les mots du client), ni une ligne vidée de son
 * article (« pas cet article » ne dit pas lequel).
 */
export function articlesAApprendre(cs: CorrectionDevis[]): ArticleAApprendre[] {
  return cs
    .filter(c => c.type === 'article' && c.avant?.demandeClient && c.apres?.produitId && c.apres.reference)
    .map(c => ({
      demande: c.avant!.demandeClient!,
      produitId: c.apres!.produitId!,
      reference: c.apres!.reference!,
      designation: c.apres!.description,
    }));
}

/**
 * Ce que la mémoire doit écrire à cet enregistrement : les articles corrigés
 * qu'elle ne connaît pas encore pour cette demande, ET les lignes revenues à
 * l'article proposé alors que la mémoire en retient un autre — un premier
 * enregistrement a pu apprendre un essai que le commercial a défait. La
 * dernière décision fait foi, comme dans `retenirArticle`.
 *
 * Rien n'est réécrit quand la mémoire dit déjà la même chose : `nb` ne monte
 * pas à chaque enregistrement automatique.
 */
export function souvenirsAEcrire(
  chiffrage: ChiffrageAnalyse,
  lignes: LigneDevis[],
  produits: Produit[],
  referenceRetenue: (demande: string) => string | undefined,
): ArticleAApprendre[] {
  const proposees = new Map(chiffrage.lignes.map(l => [l.id, l]));
  const vues = new Set<string>();
  const res: ArticleAApprendre[] = [];
  for (const l of lignesProposees(lignes, produits)) {
    const avant = proposees.get(l.id);
    const demande = avant?.demandeClient;
    if (!avant || !demande || !l.produitId || !l.reference) continue;
    const retenue = referenceRetenue(demande);
    const corrige = !memeArticle(avant, l);
    const contredit = retenue != null && retenue.toUpperCase() !== l.reference.toUpperCase();
    if (!(corrige ? retenue?.toUpperCase() !== l.reference.toUpperCase() : contredit)) continue;
    const cle = demande.trim().toLowerCase();
    if (vues.has(cle)) continue;
    vues.add(cle);
    res.push({ demande, produitId: l.produitId, reference: l.reference, designation: l.description });
  }
  return res;
}

const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const cote = (l?: LigneProposee) =>
  l ? `${l.reference ? `[${l.reference}] ` : ''}${l.description} × ${l.quantite} à ${eur(l.pu)}` : '—';
const demande = (l?: LigneProposee) => (l?.demandeClient ? ` (demande : « ${l.demandeClient} »)` : '');

export const LIBELLE_CORRECTION: Record<TypeCorrection, string> = {
  article: 'Article changé',
  quantite: 'Quantité',
  prix: 'Prix',
  ajout: 'Ajouté',
  retrait: 'Retiré',
};

/**
 * Le relevé en texte, à copier : c'est ce qu'on transmet pour corriger une
 * règle de chiffrage (un oubli systématique, une quantité mal déduite).
 */
export function releveCorrections(
  cs: CorrectionDevis[],
  meta: { numero?: string; client?: string; chiffrage: ChiffrageAnalyse },
): string {
  const lignes = [
    `Corrections du devis ${meta.numero || ''}${meta.client ? ` — ${meta.client}` : ''} par rapport à la proposition de l'analyse du ${new Date(meta.chiffrage.date).toLocaleDateString('fr-FR')}`,
    `${cs.length} correction(s)`,
    '',
  ];
  for (const c of cs) {
    if (c.type === 'ajout') lignes.push(`- AJOUTÉ : ${cote(c.apres)}`);
    else if (c.type === 'retrait') lignes.push(`- RETIRÉ : ${cote(c.avant)}${demande(c.avant)}`);
    else lignes.push(`- ${LIBELLE_CORRECTION[c.type].toUpperCase()} : proposé ${cote(c.avant)} → retenu ${cote(c.apres)}${demande(c.avant)}`);
  }
  if (meta.chiffrage.demande) lignes.push('', '— Demande du client —', meta.chiffrage.demande);
  return lignes.join('\n');
}
