import { appelerGemini, texteGemini } from './modelesIA';
import type { ModeTransport, PalierPortPoids } from './store';

/**
 * Le port d'un fournisseur se renseigne depuis un DOCUMENT : tarif du
 * transporteur, devis, commande ou facture fournisseur déposés dans l'onglet
 * Transport de sa fiche.
 *
 *  - une GRILLE (tarif) donne plusieurs paliers de poids ;
 *  - un devis / une commande / une facture donne UN point : « tant de kg,
 *    tant d'euros de port » — il devient un palier à ce poids, remplaçant
 *    celui qui y était (mise à jour des coûts par le poids et le montant).
 *
 * RIEN N'EST DEVINÉ : un franco, un mode d'expédition ou un coût absent du
 * document reste vide. Le résultat est montré avant d'être intégré, puis
 * chaque palier reste modifiable à la main.
 */

export const LIBELLE_MODE: Record<ModeTransport, string> = {
  chronopost: 'Chronopost',
  messagerie: 'Messagerie',
  affretement: 'Affrètement',
};

export interface TransportLu {
  type: 'tarif' | 'devis' | 'commande' | 'facture' | 'autre';
  transporteur?: string;
  reference?: string;
  date?: string;
  /** Franco annoncé par le document (jamais déduit). */
  francoPort?: number;
  /** Les paliers d'une grille, ou le point unique d'un devis / d'une facture. */
  paliers: PalierPortPoids[];
  /** Le point relevé sur un devis / une facture (pour affichage). */
  poidsKg?: number;
  portHT?: number;
  montantMarchandiseHT?: number;
}

const MODES: ModeTransport[] = ['chronopost', 'messagerie', 'affretement'];

const nombre = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/\s/g, '').replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
};

function modeDe(v: unknown): ModeTransport | undefined {
  const s = String(v ?? '').toLowerCase();
  if (s.includes('chrono') || s.includes('express') || s.includes('colis')) return 'chronopost';
  if (s.includes('affr') || s.includes('camion') || s.includes('lot complet')) return 'affretement';
  if (s.includes('messag') || s.includes('palette')) return 'messagerie';
  return MODES.find(m => m === s);
}

/** Nettoie, valide et trie des paliers : un seul par poids, jamais de négatif. */
export function normaliserPaliers(brut: unknown): PalierPortPoids[] {
  if (!Array.isArray(brut)) return [];
  const parPoids = new Map<number, PalierPortPoids>();
  for (const x of brut as Record<string, unknown>[]) {
    const poidsMin = nombre(x?.poidsMin);
    const cout = nombre(x?.coutTransport);
    if (poidsMin === undefined || cout === undefined) continue;
    const mode = modeDe(x?.mode);
    const p = Math.floor(poidsMin);
    parPoids.set(p, { poidsMin: p, coutTransport: cout, ...(mode ? { mode } : {}) });
  }
  return [...parPoids.values()].sort((a, b) => a.poidsMin - b.poidsMin);
}

/** Les paliers lus remplacent ceux du même poids ; les autres sont conservés. */
export function fusionnerPaliers(existants: PalierPortPoids[], lus: PalierPortPoids[]): PalierPortPoids[] {
  const poidsLus = new Set(lus.map(p => p.poidsMin));
  return [...existants.filter(p => !poidsLus.has(p.poidsMin)), ...lus]
    .sort((a, b) => a.poidsMin - b.poidsMin);
}

/** Traduit la réponse brute de l'IA en lecture exploitable. */
export function lectureTransport(brut: Record<string, unknown>): TransportLu {
  const type = (['tarif', 'devis', 'commande', 'facture'] as const)
    .find(t => t === String(brut.typeDocument ?? '').toLowerCase()) ?? 'autre';
  let paliers = normaliserPaliers(brut.paliers);
  const poidsKg = nombre(brut.poidsKg);
  const portHT = nombre(brut.portHT);
  if (!paliers.length && poidsKg && poidsKg > 0 && portHT !== undefined) {
    const mode = modeDe(brut.mode);
    paliers = [{ poidsMin: Math.floor(poidsKg), coutTransport: portHT, ...(mode ? { mode } : {}) }];
  }
  const franco = nombre(brut.francoPort);
  return {
    type,
    transporteur: brut.transporteur ? String(brut.transporteur) : undefined,
    reference: brut.reference ? String(brut.reference) : undefined,
    date: brut.date ? String(brut.date) : undefined,
    francoPort: franco && franco > 0 ? franco : undefined,
    paliers,
    poidsKg, portHT,
    montantMarchandiseHT: nombre(brut.montantMarchandiseHT),
  };
}

const PROMPT = `Tu lis un document de TRANSPORT lié à un fournisseur : tarif de port, conditions de livraison, devis, commande ou facture fournisseur. Réponds UNIQUEMENT par un objet JSON :
{
  "typeDocument": "tarif | devis | commande | facture | autre",
  "transporteur": "prestataire de transport (Chronopost, Heppner, Schenker, GLS, Geodis…) ou null",
  "reference": "numéro du document ou null",
  "date": "YYYY-MM-DD ou null",
  "francoPort": nombre (montant HT de marchandise à partir duquel le port est offert, UNIQUEMENT s'il est écrit) ou null,
  "paliers": [ { "poidsMin": nombre (kg à partir desquels ce tarif s'applique), "coutTransport": nombre (€ HT), "mode": "chronopost | messagerie | affretement | null" } ],
  "poidsKg": nombre (poids total expédié, pour un devis / commande / facture) ou null,
  "portHT": nombre (frais de port HT facturés, pour un devis / commande / facture) ou null,
  "montantMarchandiseHT": nombre (total HT des marchandises, port exclu) ou null,
  "mode": "chronopost | messagerie | affretement | null"
}
Règles : une grille de tarif donne plusieurs "paliers" (poidsMin = borne basse de la tranche) ; un devis, une commande ou une facture donne "poidsKg" et "portHT" et laisse "paliers" vide. Messagerie = palette / colis lourd par messagerie ; affrètement = camion dédié ; Chronopost = colis express. N'invente RIEN : une valeur absente du document est null. Les montants sont des nombres (87.5, pas "87,50 €").`;

export async function analyserTransportFournisseur(file: File): Promise<TransportLu> {
  const estPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!estPdf) throw new Error('Déposez un PDF (tarif, devis, commande ou facture).');
  // pdf.js ne se charge qu'à l'usage (il n'existe pas hors navigateur : tests).
  const { extraireObjetJSON, extraireTextePDF } = await import('./analyseTransport');
  const texte = await extraireTextePDF(await file.arrayBuffer());
  if (!texte.trim()) throw new Error('PDF sans texte lisible (scan ?).');
  const data = await appelerGemini({
    systemInstruction: { parts: [{ text: PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: `Document :\n${texte}` }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 2048 },
  });
  return lectureTransport(JSON.parse(extraireObjetJSON(texteGemini(data))));
}
