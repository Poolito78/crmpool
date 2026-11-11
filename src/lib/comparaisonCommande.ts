import { poidsDepuisLibelle } from './transportGammes';
import { estLignePort } from './portDuDocument';
import { prixConditionnement } from './prixAchatFournisseur';
import {
  designationProduit, getPrixPourQuantite,
  type Produit, type ProduitFournisseur,
} from './store';

/**
 * UNE COMMANDE FOURNISSEUR COMPARÉE AUX PRIX DU CRM : ligne par ligne, kit par
 * kit, puis au total.
 *
 * Un fournisseur vend les parties d'un kit à part, et le CRM le connaît souvent
 * sous un seul article. Tremco facture « F1 MORTAR POWDER 17,8 KG » et « F1 MORTAR
 * LIQUID 2,2 KG » ; le catalogue porte FLOWFASTF1, « (A 2,2 KG + B 17,8 kG) » :
 * comparer ses deux lignes à leurs seuls prix unitaires ne dirait rien du coût du
 * kit, celui des devis. Un kit se reconnaît de deux façons :
 *
 *  - ses COMPOSANTS déclarés sont tous sur le document, en quantités
 *    proportionnelles (FLOWFAST319R11 : 1 + 4 + 4 ; 5 + 20 + 20 font 5 kits) ;
 *  - sans composants, son LIBELLÉ annonce ses parties : les mots de son nom sont
 *    sur chaque ligne, chaque poids a sa ligne, et les quantités sont égales.
 *
 * RIEN N'EST DEVINÉ : une ligne sans article ou un article sans prix sort de la
 * comparaison et l'écran le dit. Rien n'est écrit non plus, sauf le coût d'un kit
 * reporté sur sa fiche d'un clic (`reportDuKit`).
 */

const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

const PARTIE = String.raw`(?:[A-Za-z]{1,4}\s+)?\d+(?:[.,]\d+)?\s*kgs?`;
const RE_PARTIES = new RegExp(`${PARTIE}(?:\\s*\\+\\s*${PARTIE})+`, 'i');
const MOTS_VIDES = new Set(['KIT', 'KG', 'KGS', 'PART', 'PARTIE', 'DE', 'DU', 'ET']);

/** « FLOWFAST F1 MORTAR (A 2,2 KG + B 17,8 kG) » → son nom et le poids de ses parties. */
export function partiesDuLibelle(libelle: string): { mots: string[]; poids: number[] } | null {
  const m = libelle.match(RE_PARTIES);
  if (!m || m.index === undefined) return null;
  const poids = [...m[0].matchAll(/(\d+(?:[.,]\d+)?)\s*kgs?/gi)].map(x => parseFloat(x[1].replace(',', '.')));
  const mots = normaliser(libelle.slice(0, m.index)).split(/[^A-Z0-9]+/).filter(w => w.length >= 2 && !MOTS_VIDES.has(w));
  /* Un seul mot ne prouve rien (« FLOWSHIELD » porte toute une gamme). */
  return poids.length >= 2 && mots.length >= 2 ? { mots, poids } : null;
}

/** Les articles du catalogue qui sont des kits : à ne calculer qu'une fois, le catalogue compte 22 000 articles. */
export function kitsDuCatalogue(produits: Produit[]): Produit[] {
  return produits.filter(p => (p.composants?.length ?? 0) >= 2 || partiesDuLibelle(designationProduit(p)));
}

export interface LigneLue {
  reference?: string;
  description?: string;
  quantite: number;
  unite?: string;
  prixUnitaireHT?: number;
}

export interface KitRapproche {
  kit: Produit;
  /** Nombre de kits que font les lignes. */
  nombre: number;
  indices: number[];
  origine: 'composants' | 'libelle';
}

/** Les kits que forment les lignes du document. Une ligne ne sert qu'à un kit. */
export function rapprocherKits(
  lignes: { indice: number; ligne: LigneLue; produit?: Produit }[],
  kits: Produit[],
): KitRapproche[] {
  const prises = new Set<number>();
  const libres = () => lignes.filter(l => !prises.has(l.indice) && l.ligne.quantite > 0);
  const out: KitRapproche[] = [];

  /* D'abord les composants déclarés, les plus gros kits en tête : ce sont des preuves. */
  const parTaille = kits
    .filter(k => (k.composants?.length ?? 0) >= 2)
    .sort((a, b) => (b.composants?.length ?? 0) - (a.composants?.length ?? 0));
  for (const kit of parTaille) {
    const trouvees = (kit.composants ?? []).map(c => ({ c, l: libres().find(x => x.produit?.id === c.produitId) }));
    if (trouvees.some(t => !t.l || !(t.c.quantite > 0))) continue;
    const nombre = trouvees[0].l!.ligne.quantite / trouvees[0].c.quantite;
    if (trouvees.some(t => Math.abs(t.l!.ligne.quantite / t.c.quantite - nombre) > 1e-6)) continue;
    trouvees.forEach(t => prises.add(t.l!.indice));
    out.push({ kit, nombre, indices: trouvees.map(t => t.l!.indice).sort((a, b) => a - b), origine: 'composants' });
  }

  for (const kit of kits) {
    if ((kit.composants?.length ?? 0) >= 2) continue;
    const parties = partiesDuLibelle(designationProduit(kit));
    if (!parties) continue;
    const candidates = libres().filter(({ ligne, produit }) => {
      const texte = normaliser(`${ligne.reference || ''} ${ligne.description || ''}`).split(/[^A-Z0-9]+/);
      return produit?.id !== kit.id && parties.mots.every(w => texte.includes(w));
    });
    const utilisees = new Set<number>();
    const trouvees = parties.poids.map(p => {
      const c = candidates.find(({ indice, ligne, produit }) =>
        !utilisees.has(indice)
        && Math.abs((poidsDepuisLibelle(ligne.description || '') ?? produit?.poids ?? 0) - p) < 0.01);
      if (c) utilisees.add(c.indice);
      return c;
    });
    if (trouvees.some(t => !t)) continue;
    const nombre = trouvees[0]!.ligne.quantite;
    if (trouvees.some(t => t!.ligne.quantite !== nombre)) continue;
    trouvees.forEach(t => prises.add(t!.indice));
    /* Dans l'ordre du document, pas dans celui du libellé du kit. */
    out.push({ kit, nombre, indices: trouvees.map(t => t!.indice).sort((a, b) => a - b), origine: 'libelle' });
  }
  return out;
}

export interface LigneComparee {
  indice: number;
  reference?: string;
  description: string;
  quantite: number;
  /** Prix du document, ramené au conditionnement s'il est au kilo. */
  prixDoc?: number;
  produit?: Produit;
  /** Prix d'achat de la fiche article, au palier de cette quantité. */
  prixCRM?: number;
  /** Prix du lien avec CE fournisseur, s'il diffère de la fiche. */
  prixLien?: number;
  /** Écart document − CRM. Positif : le fournisseur est plus cher que le CRM. */
  ecart?: number;
  ecartPct?: number;
}

export interface KitCompare extends KitRapproche {
  lignes: LigneComparee[];
  /** Coût d'un kit d'après le document. */
  prixDoc?: number;
  prixCRM?: number;
  prixLien?: number;
  /** Somme des parties aux prix du CRM, quand elles y ont toutes un prix. */
  sommePartiesCRM?: number;
  ecart?: number;
  ecartPct?: number;
}

export interface ComparaisonCommande {
  kits: KitCompare[];
  /** Lignes hors kit et hors transport. */
  lignes: LigneComparee[];
  /** Montant du document, toutes marchandises lues. */
  marchandisesDoc: number;
  /** Les seules marchandises comparables, au prix du document et à celui du CRM. */
  compareesDoc: number;
  compareesCRM: number;
  /** Lignes ou kits sans prix de part ou d'autre : hors comparaison. */
  horsComparaison: number;
  portDoc: number;
  portFiche?: number;
  totalDoc: number;
  /** Absent tant qu'une ligne manque : un total partiel se lirait comme un vrai. */
  totalCRM?: number;
  /** Total HT écrit − marchandises − port : des lignes non lues (éco-contribution…). */
  ecartTotalEcrit?: number;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

/**
 * Ce que le bouton de report peut faire du coût lu d'un kit. Il n'est proposé que
 * si l'écriture tient : le coût d'un kit à composants se recalcule depuis leurs
 * fiches, et un palier de quantité passe avant le `prixAchat` de la fiche. Dans ces
 * deux cas le prix écrit serait défait ou resterait sans effet : l'écran le dit.
 */
export type ReportKit = { prix: number; raison?: undefined } | { prix?: undefined; raison: string };

export function reportDuKit(k: Pick<KitCompare, 'kit' | 'nombre' | 'prixDoc'>): ReportKit | null {
  const prix = k.prixDoc;
  if (prix === undefined || !(prix > 0)) return null;
  if (Math.abs(getPrixPourQuantite(k.kit, k.nombre).prixAchat - prix) <= 0.005) return null;
  if ((k.kit.composants?.length ?? 0) > 0) return { raison: 'Coût calculé depuis les fiches de ses composants : à corriger sur celles-ci.' };
  if (Math.abs(getPrixPourQuantite({ ...k.kit, prixAchat: prix }, k.nombre).prixAchat - prix) > 0.005) {
    return { raison: 'Prix tiré d’un palier de quantité : à corriger dans les paliers de la fiche.' };
  }
  return { prix };
}

function ecarts(prixDoc?: number, prixCRM?: number): { ecart?: number; ecartPct?: number } {
  if (prixDoc === undefined || !prixCRM) return {};
  const ecart = arrondi(prixDoc - prixCRM);
  return { ecart, ecartPct: Math.round((ecart / prixCRM) * 1000) / 10 };
}

export function comparerCommande(args: {
  lignes: LigneLue[];
  produitDe: (indice: number) => Produit | undefined;
  kits: Produit[];
  fournisseurId?: string;
  liens: ProduitFournisseur[];
  totalHT?: number;
  portDoc: number;
  portFiche?: number;
}): ComparaisonCommande {
  const { fournisseurId, liens } = args;
  const lienDe = (p: Produit) => (fournisseurId
    ? liens.find(l => l.produitId === p.id && l.fournisseurId === fournisseurId)
    : undefined);
  const prixCRMDe = (p: Produit | undefined, quantite: number) => {
    const v = p ? getPrixPourQuantite(p, quantite).prixAchat : 0;
    return v > 0 ? v : undefined;
  };
  /* Le lien ne se montre que s'il contredit la fiche : FLOWFASTF1 porte 59,29 € et 43,80 € chez Tremco. */
  const prixLienDe = (p: Produit | undefined, prixCRM?: number) => {
    const v = p ? lienDe(p)?.prixAchat : undefined;
    return v && v > 0 && Math.abs(v - (prixCRM ?? 0)) > 0.005 ? v : undefined;
  };

  const articles = args.lignes
    .map((ligne, indice) => ({ indice, ligne, produit: args.produitDe(indice) }))
    .filter(({ ligne }) => !estLignePort(ligne));

  const comparer = ({ indice, ligne, produit }: typeof articles[number]): LigneComparee => {
    const lu = ligne.prixUnitaireHT;
    const prixDoc = lu && lu > 0
      ? prixConditionnement(lu, produit, { designation: ligne.description, quantite: ligne.quantite, unite: ligne.unite })
      : undefined;
    const prixCRM = prixCRMDe(produit, ligne.quantite);
    return {
      indice, reference: ligne.reference, description: ligne.description || '', quantite: ligne.quantite,
      prixDoc, produit, prixCRM, prixLien: prixLienDe(produit, prixCRM), ...ecarts(prixDoc, prixCRM),
    };
  };

  const rapproches = rapprocherKits(articles, args.kits);
  const dansUnKit = new Set(rapproches.flatMap(k => k.indices));
  const parIndice = new Map(articles.map(a => [a.indice, a]));

  const kits: KitCompare[] = rapproches.map(r => {
    const lignes = r.indices.map(i => comparer(parIndice.get(i)!));
    const complet = lignes.every(l => l.prixDoc !== undefined);
    const prixDoc = complet ? arrondi(lignes.reduce((s, l) => s + l.prixDoc! * l.quantite, 0) / r.nombre) : undefined;
    const prixCRM = prixCRMDe(r.kit, r.nombre);
    /* Le kit retenu par erreur pour une de ses parties n'en donne pas le prix. */
    const partiesConnues = lignes.every(l => l.prixCRM !== undefined && l.produit?.id !== r.kit.id);
    return {
      ...r, lignes, prixDoc, prixCRM, prixLien: prixLienDe(r.kit, prixCRM),
      ...(partiesConnues ? { sommePartiesCRM: arrondi(lignes.reduce((s, l) => s + l.prixCRM! * l.quantite, 0) / r.nombre) } : {}),
      ...ecarts(prixDoc, prixCRM),
    };
  });
  const lignes = articles.filter(a => !dansUnKit.has(a.indice)).map(comparer);

  const montantLigne = (l: LigneComparee) => (l.prixDoc ?? 0) * l.quantite;
  const marchandisesDoc = arrondi([...lignes, ...kits.flatMap(k => k.lignes)].reduce((s, l) => s + montantLigne(l), 0));
  let compareesDoc = 0;
  let compareesCRM = 0;
  let horsComparaison = 0;
  for (const l of lignes) {
    if (l.prixDoc !== undefined && l.prixCRM !== undefined) { compareesDoc += montantLigne(l); compareesCRM += l.prixCRM * l.quantite; } else horsComparaison += 1;
  }
  for (const k of kits) {
    if (k.prixDoc !== undefined && k.prixCRM !== undefined) { compareesDoc += k.prixDoc * k.nombre; compareesCRM += k.prixCRM * k.nombre; } else horsComparaison += 1;
  }
  const totalDoc = arrondi(marchandisesDoc + args.portDoc);
  const reste = args.totalHT === undefined ? 0 : arrondi(args.totalHT - totalDoc);
  return {
    kits, lignes, marchandisesDoc,
    compareesDoc: arrondi(compareesDoc), compareesCRM: arrondi(compareesCRM), horsComparaison,
    portDoc: args.portDoc, portFiche: args.portFiche, totalDoc,
    ...(horsComparaison === 0 ? { totalCRM: arrondi(compareesCRM + (args.portFiche ?? args.portDoc)) } : {}),
    ...(Math.abs(reste) > 0.01 ? { ecartTotalEcrit: reste } : {}),
  };
}
