/**
 * Lecture d'un devis ODOO ISOSIGN en PDF — l'« offre de prix » réellement
 * envoyée au client — sans IA.
 *
 * ⚠️ **UNE OFFRE DE 600 LIGNES NE SE RÉSUME PAS.** AF039468 (TRAM LE HAVRE,
 * 61 ensembles) compte 41 pages et 692 lignes : confiée au modèle, elle
 * revenait tronquée, et le mail qui la transmettait passait pour une demande
 * de devis (le plan Kadri refait par ISOSIGN, joint au même mail, était lu
 * comme une demande). Or le PDF d'Odoo est régulier :
 *
 *     2   DF50 2200 250 C2 50 O BRUT FLECHE LAPEROUSE P50
 *     Réf :   DF50.2200.250.C2.50.IS.BRUT
 *     1,000   Unité   126,920   126,92 €
 *
 * numéro, désignation (parfois sur plusieurs lignes), « Réf : », puis
 * quantité / unité / prix unitaire / montant. Les en-têtes « Ensemble
 * AF039468/0001 » donnent le groupe ; une remise (« REMISE PROMOTIONNELLE »,
 * montant négatif) est une ligne comme une autre ; « Montant HT » clôt.
 * Le prix retenu est le montant ÷ la quantité : il porte la remise de ligne.
 *
 * L'offre lue part au type `offre_prix` : elle se compare au devis du CRM
 * qu'elle reprend (`comparaisonDevis.ts`), elle ne crée rien.
 */

import type { DocumentAnalysis, LigneAnalysee } from './analyseDocument';

/** Le document est-il un devis émis par Odoo ISOSIGN ? */
export function estDevisOdoo(pages: string[]): boolean {
  const t = pages.join('\n');
  return /Devis\s*#\s*[A-Z]{2}\d{5,}/.test(t) && /R[ée]f\s*:/.test(t) && /ISOSIGN/i.test(t);
}

/** « 1 234,560 », « -8 206,079 » → nombre. */
function nombreFr(s: string): number | null {
  const n = Number(s.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const MOTIF_NOMBRE = /^-?[\d\s\u00a0\u202f.]*\d(?:,\d+)?$/;

/** « 1,000   Unité   126,920   126,92 € » → quantité, unité, prix, montant. */
export function lireLigneMontant(ligne: string): { quantite: number; unite: string; pu: number; montant: number } | null {
  const l = ligne.trim();
  if (!/€\s*$/.test(l)) return null;
  const parts = l.replace(/€\s*$/, '').trim().split(/\s{2,}/);
  if (parts.length < 4) return null;
  const quantite = MOTIF_NOMBRE.test(parts[0]) ? nombreFr(parts[0]) : null;
  const montant = MOTIF_NOMBRE.test(parts[parts.length - 1]) ? nombreFr(parts[parts.length - 1]) : null;
  const pu = MOTIF_NOMBRE.test(parts[2]) ? nombreFr(parts[2]) : null;
  if (quantite === null || montant === null || pu === null || /\d/.test(parts[1])) return null;
  return { quantite, unite: parts[1], pu, montant };
}

/** Lignes de pied et d'en-tête de page qui s'intercalent dans les articles. */
const BRUIT = /^(ISOSIGN SAS|ZA DU MONAY|71210 |France\b|Z\.A du Monay|SAS au capital|Page\s*:|Sous-total)/i;

export type LigneOffre = LigneAnalysee;

/** Le devis Odoo en document analysé ; `null` si ce n'en est pas un. */
export function lireDevisOdoo(pages: string[]): DocumentAnalysis | null {
  if (!estDevisOdoo(pages)) return null;
  const texte = pages.join('\n');
  const lignes = texte.split('\n').map(l => l.replace(/\s+$/, ''));

  const out: LigneOffre[] = [];
  let groupe: string | undefined;
  let courant: { desc: string[]; ref?: string } | null = null;
  let totalHT: number | undefined;

  for (const brute of lignes) {
    const l = brute.trim();
    if (!l) continue;
    const ens = l.match(/^Ensemble\s+(\S+)/);
    if (ens) { groupe = ens[1]; courant = null; continue; }
    const ht = l.match(/^Montant HT(?:\s+Montant HT)?\s+(-?[\d\s\u00a0\u202f.,]+)\s*€/);
    if (ht) { totalHT = nombreFr(ht[1]) ?? undefined; courant = null; continue; }
    if (BRUIT.test(l)) continue;

    const montant = lireLigneMontant(l);
    if (montant && courant) {
      out.push({
        reference: courant.ref ?? '',
        description: courant.desc.join(' ').replace(/\s+/g, ' ').trim(),
        quantite: montant.quantite,
        unite: montant.unite,
        prixUnitaireHT: montant.quantite
          ? Math.round((montant.montant / montant.quantite) * 1000) / 1000
          : montant.pu,
        ...(groupe ? { groupe } : {}),
      });
      courant = null;
      continue;
    }
    const ref = l.match(/^R[ée]f\s*:\s*(\S+)/);
    if (ref && courant) { courant.ref = ref[1]; continue; }
    const debut = l.match(/^(\d{1,4})\s{2,}(\S.*)$/);
    if (debut) { courant = { desc: [debut[2]] }; continue; }
    /* La suite d'une désignation sur plusieurs lignes. */
    if (courant && !courant.ref && courant.desc.length < 4) courant.desc.push(l);
  }

  const apres = (motif: RegExp) => {
    const i = lignes.findIndex(x => motif.test(x));
    return i >= 0 ? lignes.slice(i + 1).find(x => x.trim())?.trim() : undefined;
  };
  const date = apres(/Date du devis\s*:/)?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return {
    typeDocument: 'offre_prix',
    numeroDocument: texte.match(/Devis\s*#\s*([A-Z]{2}\d{5,})/)?.[1],
    nomPartenaire: apres(/Adresse de facturation\s*:/),
    referencePartenaire: apres(/Votre r[ée]f[ée]rence\s*:/),
    dateDocument: date ? `${date[3]}-${date[2]}-${date[1]}` : undefined,
    totalHT,
    lignes: out,
  };
}
