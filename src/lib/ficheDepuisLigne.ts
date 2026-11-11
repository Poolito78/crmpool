/**
 * UNE LIGNE LIBRE DU DEVIS DEVIENT UN ARTICLE, SANS RESSAISIE.
 *
 * Un article absent du catalogue se chiffre d'abord en ligne libre :
 * désignation, prix, coût d'achat tapés dans le devis. Pour en faire un
 * article, il fallait aller à la page Produits, tout retaper, revenir au
 * devis et y choisir l'article — qui reprenait alors le prix du jour.
 *
 * Désormais le bouton de la ligne ouvre la fiche NEUVE pré-remplie avec ce
 * que la ligne sait (désignation, unité, TVA, prix, coût, référence Odoo) ;
 * on y complète le CODE ARTICLE, obligatoire, et le reste. Au retour, la
 * ligne est reliée à l'article créé (`lierLigneAuProduit`) et garde SON
 * prix : c'est celui qu'on a chiffré (« un devis garde les prix de sa
 * conception »). Une ligne sans prix prend celui de la fiche.
 *
 * Le passage d'une page à l'autre se fait par `sessionStorage` (la
 * demande, puis la liaison) : la désignation n'a rien à faire dans l'URL.
 * Rien n'est deviné : la remise revendeur de la fiche (30 % par défaut)
 * relie public et revendeur, comme le fait déjà la fiche elle-même.
 */
import { designationProduit, type LigneDevis, type Produit } from '@/lib/store';
import { noteEnTexte } from '@/lib/noteRiche';

/** Ce que la ligne transmet à la fiche. */
export interface DemandeFiche {
  devisId: string;
  ligneId: string;
  /** Texte de la ligne, sans balises. */
  texte: string;
  prixUnitaireHT: number;
  prixAchat?: number;
  unite: string;
  tva: number;
  referenceOdoo?: string;
  /** Le prix de la ligne est un prix revendeur (client revendeur). */
  clientRevendeur: boolean;
}

/** L'article créé pour une ligne, en attente du retour au devis. */
export interface LiaisonFiche {
  devisId: string;
  ligneId: string;
  produitId: string;
}

const CLE_DEMANDE = 'crm-fiche-depuis-ligne';
const CLE_LIAISON = 'crm-liaison-fiche-ligne';

const arrondi = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function demandeDepuisLigne(devisId: string, l: LigneDevis, clientRevendeur: boolean): DemandeFiche {
  return {
    devisId,
    ligneId: l.id,
    texte: noteEnTexte(l.description).trim(),
    prixUnitaireHT: l.prixUnitaireHT || 0,
    prixAchat: l.prixAchatLigne && l.prixAchatLigne > 0 ? l.prixAchatLigne : undefined,
    unite: l.unite,
    tva: l.tva,
    referenceOdoo: l.referenceOdoo?.trim() || undefined,
    clientRevendeur,
  };
}

/**
 * Les champs de la fiche neuve. La première ligne du texte est la
 * désignation ; la suite, la description détaillée. Le code article reste
 * vide (ou la référence Odoo de la ligne) : c'est à l'utilisateur de le
 * donner, la fiche le refuse vide.
 */
export function champsFiche(d: DemandeFiche, remiseRevendeur = 30) {
  const lignes = d.texte.split('\n').map(s => s.trim()).filter(Boolean);
  const prix = d.prixUnitaireHT > 0 ? d.prixUnitaireHT : 0;
  const facteur = 1 - remiseRevendeur / 100;
  const prixRevendeur = prix > 0 ? (d.clientRevendeur ? prix : arrondi(prix * facteur)) : 0;
  const prixHT = prix > 0 ? (d.clientRevendeur ? arrondi(prix / facteur) : prix) : 0;
  const prixAchat = d.prixAchat ?? 0;
  const coefficient = prixAchat > 0 && prixRevendeur > 0 ? arrondi(prixRevendeur / prixAchat, 4) : undefined;
  return {
    reference: d.referenceOdoo ?? '',
    referenceOdoo: d.referenceOdoo ?? '',
    description: lignes[0] ?? '',
    descriptionDetaillee: lignes.slice(1).join('\n'),
    unite: d.unite,
    tva: d.tva,
    prixAchat,
    prixHT,
    prixRevendeur,
    remiseRevendeur,
    ...(coefficient != null ? { coefficient, coeffRevendeur: coefficient } : {}),
  };
}

/**
 * La ligne reliée à l'article créé. Elle garde sa quantité, sa remise et son
 * prix (sauf s'il était nul : `prixSiVide`). Une désignation d'une seule
 * ligne devient celle de l'article — on vient de la compléter ; un texte de
 * plusieurs lignes, écrit à la main, reste tel quel.
 */
export function lierLigneAuProduit(l: LigneDevis, p: Produit, prixSiVide = 0): LigneDevis {
  const texte = noteEnTexte(l.description).trim();
  const uneLigne = !texte.includes('\n');
  return {
    ...l,
    produitId: p.id,
    description: uneLigne ? designationProduit(p) : l.description,
    unite: p.unite || l.unite,
    tva: p.tva ?? l.tva,
    prixUnitaireHT: l.prixUnitaireHT > 0 ? l.prixUnitaireHT : prixSiVide,
    /* L'article porte désormais son coût, sa référence Odoo et sa gamme. */
    prixAchatLigne: undefined,
    referenceOdoo: undefined,
    gamme: undefined,
  };
}

function lire<T>(cle: string): T | null {
  try {
    const brut = sessionStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as T) : null;
  } catch {
    return null;
  }
}
function ecrire(cle: string, valeur: unknown | null) {
  try {
    if (valeur == null) sessionStorage.removeItem(cle);
    else sessionStorage.setItem(cle, JSON.stringify(valeur));
  } catch { /* stockage indisponible : la fiche s'ouvrira vide */ }
}

export const memoriserDemandeFiche = (d: DemandeFiche) => ecrire(CLE_DEMANDE, d);
export const lireDemandeFiche = () => lire<DemandeFiche>(CLE_DEMANDE);
export const oublierDemandeFiche = () => ecrire(CLE_DEMANDE, null);

export const memoriserLiaison = (l: LiaisonFiche) => ecrire(CLE_LIAISON, l);
/** La liaison en attente pour CE devis, retirée du stockage une fois lue. */
export function prendreLiaison(devisId: string): LiaisonFiche | null {
  const l = lire<LiaisonFiche>(CLE_LIAISON);
  if (!l || l.devisId !== devisId) return null;
  ecrire(CLE_LIAISON, null);
  return l;
}
