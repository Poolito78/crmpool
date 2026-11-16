/**
 * LE MAIL D'UN DEVIS CITE SON DEVIS ODOO ET EN JOINT LE PDF.
 *
 * Un devis du CRM part souvent aussi dans Odoo (`odoo-devis`) : c'est le PDF
 * d'Odoo qui sert de pièce officielle, et le client répond en citant son
 * numéro AF…. Le mail d'envoi dit donc les deux numéros — « notre devis
 * DEV-2026-186 / AF042095 » (demande du 16/11/2026) — et joint le PDF d'Odoo
 * À CÔTÉ de celui du CRM.
 *
 * Le PDF d'Odoo vient de la fonction `odoo-devis-pdf` (lien portail d'Odoo),
 * à défaut d'un fichier choisi à la main — le dossier Téléchargements s'ouvre
 * d'office. ⚠️ **LES DEUX MONTANTS HT DOIVENT ÊTRE IDENTIQUES** : celui du
 * CRM, celui de la fiche Odoo et celui imprimé sur le PDF joint. Un écart se
 * dit avant l'envoi : on ne joint pas sans le voir un devis qui annonce un
 * autre prix que le mail.
 */

import { supabase } from '@/integrations/supabase/client';
import { lireDevisOdoo } from './devisOdooPdf';

/** Tolérance d'arrondi entre deux montants HT, en euros. */
export const ECART_TOLERE = 0.01;

const MOTIF_NUMERO_ODOO = /^[A-Z]{1,4}\d{4,}$/;

/** « af 042095 » → « AF042095 » ; `''` si ce n'est pas un numéro Odoo. */
export function normaliserNumeroOdoo(saisie: string): string {
  const n = String(saisie || '').toUpperCase().replace(/\s/g, '');
  return MOTIF_NUMERO_ODOO.test(n) ? n : '';
}

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Le numéro du CRM suivi de celui d'Odoo, partout où le texte le cite :
 * « DEV-2026-186 » → « DEV-2026-186 / AF042095 ». Idempotent ; un ancien
 * numéro Odoo accolé est remplacé, et sans numéro Odoo il est retiré.
 */
export function avecNumeroOdoo(texte: string, numeroCrm: string, numeroOdoo: string): string {
  if (!texte || !numeroCrm) return texte;
  const motif = new RegExp(`${echapper(numeroCrm)}(?![\\w-])(?:\\s*/\\s*[A-Z]{1,4}\\d{4,})?`, 'g');
  return texte.replace(motif, numeroOdoo ? `${numeroCrm} / ${numeroOdoo}` : numeroCrm);
}

/** Ce qu'un PDF de devis Odoo dit de lui-même : son numéro et son montant HT. */
export interface LecturePdfOdoo {
  numero?: string;
  totalHT?: number;
}

function nombreFr(s: string): number | undefined {
  const n = Number(s.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** Numéro et montant HT lus dans le texte des pages d'un PDF Odoo. */
export function lirePdfOdoo(pages: string[]): LecturePdfOdoo {
  const lu = lireDevisOdoo(pages);
  const texte = pages.join('\n');
  const numero = lu?.numeroDocument
    ?? texte.match(/(?:Devis|Commande|Bon de commande)\s*(?:#|n°)\s*([A-Z]{1,4}\d{4,})/i)?.[1]?.toUpperCase();
  let totalHT = lu?.totalHT;
  if (totalHT === undefined) {
    const m = texte.match(/(?:Montant|Total)\s+HT\s+(-?[\d\s\u00a0\u202f.,]+?)\s*€/i);
    totalHT = m ? nombreFr(m[1]) : undefined;
  }
  return { ...(numero ? { numero } : {}), ...(totalHT !== undefined ? { totalHT } : {}) };
}

/** Une ligne du contrôle des montants, pour l'écran. */
export interface ControleMontant {
  source: 'odoo' | 'pdf';
  montant: number;
  ecart: number;
}

/**
 * Les montants HT d'Odoo (fiche, PDF) comparés à celui du CRM. `ok` seulement
 * si au moins un montant Odoo est connu et qu'aucun ne s'écarte.
 */
export function controlerMontants(montantCrm: number, odoo?: number, pdf?: number): { ok: boolean; lignes: ControleMontant[] } {
  const lignes: ControleMontant[] = [];
  const arrondi = (n: number) => Math.round(n * 100) / 100;
  if (odoo !== undefined) lignes.push({ source: 'odoo', montant: odoo, ecart: arrondi(odoo - montantCrm) });
  if (pdf !== undefined) lignes.push({ source: 'pdf', montant: pdf, ecart: arrondi(pdf - montantCrm) });
  return { ok: lignes.length > 0 && lignes.every(l => Math.abs(l.ecart) <= ECART_TOLERE), lignes };
}

/** Nom de la pièce jointe : « Devis_AF042095_DRS_SIGNALISATION.pdf ». */
export function nomPdfOdoo(numeroOdoo: string, societe?: string): string {
  const propre = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return ['Devis', numeroOdoo, societe ? propre(societe) : ''].filter(Boolean).join('_') + '.pdf';
}

export interface DevisOdooRecupere {
  id: number;
  numero: string;
  montantHT: number;
  montantTTC?: number;
  etatOdoo?: string;
  url?: string;
  pdfBase64?: string;
  erreurPdf?: string;
}

/**
 * Le devis Odoo et son PDF, par son id, son numéro AF… ou le numéro du CRM
 * (`origin`). `null` : Odoo ne le connaît pas.
 */
export async function recupererDevisOdoo(cle: { id?: number; numero?: string; origine?: string; sansPdf?: boolean }): Promise<DevisOdooRecupere | null> {
  const { data, error } = await supabase.functions.invoke('odoo-devis-pdf', { body: cle });
  if (error) throw new Error(error.message || 'Odoo injoignable');
  if (data?.erreur) throw new Error(data.erreur);
  if (data?.etat !== 'ok') return null;
  return data as DevisOdooRecupere;
}

/** Octets → base64, par tranches (un PDF de plusieurs Mo dépasse la pile). */
export function octetsEnBase64(octets: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < octets.length; i += 0x8000) {
    bin += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Texte des pages d'un PDF donné en base64 (pdf.js chargé à la demande). */
export async function pagesDuPdf(base64: string): Promise<string[]> {
  const octets = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const { extrairePagesPDF } = await import('./analyseDocument');
  return extrairePagesPDF(octets.buffer);
}

/**
 * Un PDF choisi à la main, le dossier Téléchargements ouvert d'office quand
 * le navigateur le permet. `null` : rien de choisi.
 */
export async function choisirPdfLocal(): Promise<File | null> {
  const w = window as unknown as {
    showOpenFilePicker?: (o: unknown) => Promise<Array<{ getFile: () => Promise<File> }>>;
  };
  if (w.showOpenFilePicker) {
    try {
      const [h] = await w.showOpenFilePicker({
        startIn: 'downloads',
        types: [{ description: 'Devis Odoo (PDF)', accept: { 'application/pdf': ['.pdf'] } }],
      });
      return h ? await h.getFile() : null;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
      /* sélecteur refusé : repli sur le champ fichier */
    }
  }
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}
