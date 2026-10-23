/**
 * Coût RÉEL du transport d'un devis : celui que les fournisseurs facturent.
 *
 * Le port du devis (`fraisPortHT`) est un prix de vente. Son coût n'est pas
 * le même chiffre : chaque fournisseur qui livre une partie des articles
 * facture son propre port, d'après sa fiche (`portFournisseur` — franco, palier
 * de poids, coût fixe) ou d'après les paliers du lien article-fournisseur
 * (`getPfTransportPourMontant`). Le port est dû PAR COMMANDE : on regroupe
 * donc les lignes par fournisseur, on additionne poids et achat, puis on lit
 * le port de ce total — jamais ligne par ligne.
 *
 * ⚠️ On n'invente pas un coût : un fournisseur dont la fiche ne permet pas de
 * dire son port rend `montant: null` (« à vérifier ») et reste hors du total.
 * Les lignes sans fournisseur ne portent aucun port ; elles sont comptées à
 * part pour que l'écran le dise.
 */
import {
  departementDeCodePostal,
  getPfTransportPourMontant,
  portFournisseur,
  type Client,
  type Fournisseur,
  type LigneDevis,
  type ModeTransport,
  type Produit,
  type ProduitFournisseur,
} from '@/lib/store';

export interface PortParFournisseur {
  fournisseurId: string;
  nom: string;
  nbLignes: number;
  poidsKg: number;
  /** Achat HT des lignes de ce fournisseur (la base du franco). */
  montantAchat: number;
  /** Port facturé par ce fournisseur ; `null` = la fiche ne le dit pas. */
  montant: number | null;
  source: 'franco' | 'palier' | 'fixe' | 'lien' | null;
  mode?: ModeTransport;
  /** Département du tarif retenu (relevé sur un devis fournisseur), s'il est propre à une destination. */
  dept?: string;
  /** Tarif relevé pour une AUTRE destination que celle du devis : une estimation, pas un tarif. */
  approximatif?: boolean;
}

export interface PortReel {
  fournisseurs: PortParFournisseur[];
  /** Somme des ports connus. */
  total: number;
  /** Au moins un fournisseur dont le port est connu : le total est alors un coût réel. */
  connu: boolean;
  /** Au moins un fournisseur dont le port est à vérifier : le total est partiel. */
  incomplet: boolean;
  /** Lignes d'article sans fournisseur rattaché. */
  sansFournisseur: number;
}

interface Entree {
  lignes: LigneDevis[];
  produitParId: (id: string) => Produit | null | undefined;
  produitFournisseurs: ProduitFournisseur[];
  fournisseurs: Fournisseur[];
  /** Fournisseur choisi par ligne (onglet Comparatif) ; absent = le prioritaire, ou l'unique. */
  choix: Record<string, string>;
  /** Achat HT total de la ligne (quantité × prix d'achat + forfait de commande). */
  achatDeLigne: (l: LigneDevis) => number;
  /** Département de livraison du devis : choisit, parmi les tarifs relevés, celui de cette destination. */
  dept?: string;
}

export function portReelParFournisseur(e: Entree): PortReel {
  const groupes = new Map<string, { pfs: ProduitFournisseur[]; nbLignes: number; poidsKg: number; montantAchat: number }>();
  let sansFournisseur = 0;

  for (const l of e.lignes) {
    // Un article se reconnaît par exclusion : `type` absent DÉSIGNE une ligne d'article.
    if (l.type === 'groupe' || l.type === 'soustotal' || l.type === 'texte') continue;
    if (!l.produitId) continue;
    const pfs = e.produitFournisseurs.filter(pf => pf.produitId === l.produitId);
    const pf = pfs.find(p => p.fournisseurId === e.choix[l.id]) ?? pfs.find(p => p.estPrioritaire) ?? pfs[0];
    if (!pf) { sansFournisseur += 1; continue; }
    const g = groupes.get(pf.fournisseurId) ?? { pfs: [], nbLignes: 0, poidsKg: 0, montantAchat: 0 };
    g.pfs.push(pf);
    g.nbLignes += 1;
    g.poidsKg += (e.produitParId(l.produitId)?.poids || 0) * l.quantite;
    g.montantAchat += e.achatDeLigne(l);
    groupes.set(pf.fournisseurId, g);
  }

  const fournisseurs: PortParFournisseur[] = [...groupes.entries()].map(([fournisseurId, g]): PortParFournisseur => {
    const f = e.fournisseurs.find(x => x.id === fournisseurId);
    const base = {
      fournisseurId,
      nom: f?.societe || f?.nom || 'Fournisseur inconnu',
      nbLignes: g.nbLignes,
      poidsKg: g.poidsKg,
      montantAchat: g.montantAchat,
    };
    if (!f) return { ...base, montant: null, source: null };
    // Des paliers de lien tous à 0 € ne disent rien (TREMCO : [0 €, 0 €] sur FLOWFAST 319, alors que la fiche
    // porte 38,11 €) : la fiche fait foi. Un lien ne prime que s'il chiffre un port.
    const lien = g.pfs.find(p => p.paliersPort?.some(x => x.coutTransport > 0));
    if (lien) return { ...base, montant: getPfTransportPourMontant(lien, f, g.montantAchat, g.poidsKg, e.dept), source: 'lien' };
    const r = portFournisseur(f, g.poidsKg, g.montantAchat, e.dept);
    return r
      ? { ...base, montant: r.montant, source: r.source, mode: r.mode, dept: r.dept, approximatif: r.approximatif }
      : { ...base, montant: null, source: null };
  }).sort((a, b) => b.montantAchat - a.montantAchat);

  const connus = fournisseurs.filter(f => f.montant !== null);
  return {
    fournisseurs,
    total: connus.reduce((s, f) => s + (f.montant ?? 0), 0),
    connu: connus.length > 0,
    incomplet: connus.length < fournisseurs.length,
    sansFournisseur,
  };
}

/**
 * Département où le devis est livré : l'adresse de livraison choisie, sinon la
 * livraison par défaut du client, sinon son adresse de facturation. Les deux
 * derniers sont des replis — l'écran l'indique (`origine`).
 */
export function destinationDuDevis(
  client: Pick<Client, 'codePostal' | 'adressesLivraison'> | undefined,
  adresseLivraisonId?: string,
): { dept: string; origine: string } | null {
  if (!client) return null;
  const livraisons = (client.adressesLivraison ?? []).filter(a => a.type !== 'facturation');
  const choisie = adresseLivraisonId ? livraisons.find(a => a.id === adresseLivraisonId) : undefined;
  const dChoisie = departementDeCodePostal(choisie?.codePostal);
  if (choisie && dChoisie) return { dept: dChoisie, origine: `adresse de livraison « ${choisie.libelle || choisie.ville} »` };
  const parDefaut = livraisons.find(a => a.parDefaut && departementDeCodePostal(a.codePostal)) ?? livraisons.find(a => departementDeCodePostal(a.codePostal));
  if (parDefaut) return { dept: departementDeCodePostal(parDefaut.codePostal)!, origine: `livraison « ${parDefaut.libelle || parDefaut.ville} », à défaut` };
  const fact = departementDeCodePostal(client.codePostal);
  return fact ? { dept: fact, origine: 'adresse de facturation, à défaut' } : null;
}

export const LIBELLE_SOURCE_PORT: Record<NonNullable<PortParFournisseur['source']>, string> = {
  franco: 'franco atteint',
  palier: 'palier de poids',
  fixe: 'coût fixe',
  lien: 'paliers de l’article',
};
