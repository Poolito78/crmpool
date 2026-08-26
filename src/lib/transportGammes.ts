/**
 * Frais de port des gammes ISOMARK et ISOFLOOR.
 *
 * Trois barèmes coexistent chez ISOSIGN et ne se ressemblent pas :
 *
 *  - ISOSIGN, au forfait selon le montant (cf. `transportIsosign.ts`) ;
 *  - le plastique STI, au poids ou à l'encombrement (`transportPlastique.ts`) ;
 *  - ISOMARK et ISOFLOOR, au POIDS par tranches, avec des francos qui ne se
 *    jugent pas sur la même grandeur — c'est le piège de ces deux-là.
 *
 * ISOMARK offre le port à partir d'un MONTANT : 2 700 € HT en H1, 1 000 € HT
 * en H2. ISOFLOOR l'offre à partir d'un POIDS : deux tonnes, granulats exclus.
 * Un devis ISOFLOOR de 5 000 € reste donc payant s'il ne pèse pas assez, et un
 * devis ISOMARK léger passe franco s'il est assez cher.
 */

import type { NiveauGamme } from './remiseGammes';

/** Une tranche de poids et son tarif. */
interface Tranche {
  /** Borne HAUTE incluse, en kilogrammes. `null` = au-delà de tout. */
  jusqua: number | null;
  prix: number;
}

/** ISOMARK H1 — le cas général. */
const ISOMARK_H1: Tranche[] = [
  { jusqua: 25, prix: 51 },
  { jusqua: 100, prix: 87 },
  { jusqua: 700, prix: 178 },
  { jusqua: null, prix: 235 },
];

/** ISOFLOOR. Au-delà de deux tonnes, c'est le franco qui s'applique. */
const ISOFLOOR: Tranche[] = [
  { jusqua: 25, prix: 49 },
  { jusqua: 100, prix: 85 },
  { jusqua: 700, prix: 178 },
  { jusqua: null, prix: 230 },
];

/** Franco ISOMARK H1, en euros HT. */
export const FRANCO_ISOMARK_H1 = 2700;
/** Franco ISOMARK H2, en euros HT, hors ADR. */
export const FRANCO_ISOMARK_H2 = 1000;
/** Forfait unique H2 sous le franco. */
export const PORT_ISOMARK_H2 = 51;
/** Franco ISOFLOOR, en kilogrammes, granulats exclus. */
export const FRANCO_ISOFLOOR_KG = 2000;

/** Suppléments communs, à ajouter à la demande. */
export const HAYON = 12;
export const RELIVRAISON = 75;
export const DEPALETTISATION = 35;

/**
 * Poids d'un article, lu dans son libellé.
 *
 * Les conditionnements sont écrits dans la désignation et nulle part
 * ailleurs : « FLOWFAST 107 Primer (20 kg) », « FLOWCOAT PA302 A 2,93KG »,
 * « FLOWFAST PRIMER ( B ) CATALYST (400 gr) ». Sans cette lecture, un barème
 * au poids n'a rien à peser.
 *
 * Renvoie `null` quand le libellé n'en porte pas — on ne devine pas un poids.
 */
export function poidsDepuisLibelle(libelle: string): number | null {
  const t = String(libelle || '').toLowerCase().replace(/\s+/g, ' ');
  /* Grammes d'abord : « 400 gr » ne doit pas être lu comme 400 kg. */
  const g = t.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|grammes?)\b/);
  if (g) return parseFloat(g[1].replace(',', '.')) / 1000;
  const kg = t.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kgs|kilos?)\b/);
  if (kg) return parseFloat(kg[1].replace(',', '.'));
  return null;
}

/** Un granulat ne compte pas dans le franco ISOFLOOR. */
export function estGranulat(libelle: string): boolean {
  return /\bgranulat/i.test(String(libelle || ''));
}

function tarifDeTranche(bareme: Tranche[], poids: number): number {
  for (const t of bareme) {
    if (t.jusqua === null || poids <= t.jusqua) return t.prix;
  }
  return bareme[bareme.length - 1].prix;
}

export interface LigneGamme {
  reference: string;
  designation?: string;
  quantite: number;
  /** Montant HT de la ligne. */
  montant: number;
  /** Niveau lu sur la catégorie Odoo — voir `remiseGammes.ts`. */
  niveau?: NiveauGamme;
}

export interface PortGamme {
  gamme: 'ISOMARK' | 'ISOFLOOR';
  montant: number;
  offert: boolean;
  /** Poids total retenu, en kilogrammes. */
  poids: number;
  /** Poids hors granulats, celui qui juge le franco ISOFLOOR. */
  poidsFranco: number;
  base: number;
  /** Des lignes n'ont pas de poids lisible : le calcul est incomplet. */
  poidsIncomplet: boolean;
  explication: string;
}

function poidsTotal(lignes: LigneGamme[], sansGranulats = false) {
  let poids = 0;
  let incomplet = false;
  for (const l of lignes) {
    if (sansGranulats && estGranulat(l.designation || l.reference)) continue;
    const u = poidsDepuisLibelle(l.designation || '');
    if (u === null) { incomplet = true; continue; }
    poids += u * (l.quantite || 0);
  }
  return { poids, incomplet };
}

/**
 * Port ISOMARK.
 *
 * `h2` dit que la commande relève entièrement du barème H2 — franco à
 * 1 000 € et forfait unique. En cas de panachage, les conditions H1
 * s'appliquent : c'est la règle écrite sur les conditions de vente, et c'est
 * aussi le défaut de cette fonction.
 */
export function portIsomark(lignes: LigneGamme[], h2 = false): PortGamme {
  const base = lignes.reduce((t, l) => t + (Number(l.montant) || 0), 0);
  const { poids, incomplet } = poidsTotal(lignes);

  if (h2) {
    const offert = base >= FRANCO_ISOMARK_H2;
    return {
      gamme: 'ISOMARK', montant: offert ? 0 : PORT_ISOMARK_H2, offert,
      poids, poidsFranco: poids, base, poidsIncomplet: incomplet,
      explication: `H2 — ${base.toFixed(2)} € HT, franco à ${FRANCO_ISOMARK_H2} € `
        + `(hors ADR) : ${offert ? 'offert' : `${PORT_ISOMARK_H2.toFixed(2)} €`}`,
    };
  }

  const offert = base >= FRANCO_ISOMARK_H1;
  const montant = offert ? 0 : tarifDeTranche(ISOMARK_H1, poids);
  return {
    gamme: 'ISOMARK', montant, offert, poids, poidsFranco: poids, base,
    poidsIncomplet: incomplet,
    explication: `H1 — ${base.toFixed(2)} € HT, franco à ${FRANCO_ISOMARK_H1} € : `
      + (offert ? 'offert' : `${poids.toFixed(1)} kg → ${montant.toFixed(2)} €`),
  };
}

/**
 * Port ISOFLOOR.
 *
 * Le franco est un POIDS, pas un montant, et les granulats en sont exclus :
 * ils pèsent lourd sans faire franchir le seuil. Ils restent en revanche
 * comptés dans le poids qui choisit la tranche — c'est bien le camion qui
 * les emporte.
 */
export function portIsofloor(lignes: LigneGamme[]): PortGamme {
  const base = lignes.reduce((t, l) => t + (Number(l.montant) || 0), 0);
  const { poids, incomplet } = poidsTotal(lignes);
  const { poids: poidsFranco } = poidsTotal(lignes, true);

  const offert = poidsFranco >= FRANCO_ISOFLOOR_KG;
  const montant = offert ? 0 : tarifDeTranche(ISOFLOOR, poids);
  return {
    gamme: 'ISOFLOOR', montant, offert, poids, poidsFranco, base,
    poidsIncomplet: incomplet,
    explication: `${poidsFranco.toFixed(1)} kg hors granulats, franco à `
      + `${FRANCO_ISOFLOOR_KG} kg : `
      + (offert ? 'offert' : `${poids.toFixed(1)} kg → ${montant.toFixed(2)} €`),
  };
}

/**
 * Répartit des lignes de gamme entre leurs EXPÉDITIONS et chiffre chacune.
 *
 * Un devis panaché part en plusieurs camions : les articles « ISOMARK / H1 »
 * quittent ISOSIGN, les « ISOMARK / H2 » l'usine ISOMARK, les ISOFLOOR leur
 * propre dépôt. Chaque expédition juge son franco sur ses seules lignes —
 * additionner les trois ferait franchir des seuils que rien ne franchit.
 *
 * Les lignes dont le niveau reste inconnu voyagent avec H1 : c'est le franco
 * le plus haut, donc le port le plus souvent facturé. Se tromper là coûte une
 * ligne de port en trop, qui se voit et se retire ; l'inverse coûte un port
 * oublié, qui ne se voit pas.
 */
export function portGammes(lignes: LigneGamme[]): PortGamme[] {
  const h1 = lignes.filter(l => l.niveau !== 'H2' && l.niveau !== 'ISOFLOOR');
  const h2 = lignes.filter(l => l.niveau === 'H2');
  const sol = lignes.filter(l => l.niveau === 'ISOFLOOR');

  const ports: PortGamme[] = [];
  if (h1.length) ports.push(portIsomark(h1));
  if (h2.length) ports.push(portIsomark(h2, true));
  if (sol.length) ports.push(portIsofloor(sol));
  return ports;
}
