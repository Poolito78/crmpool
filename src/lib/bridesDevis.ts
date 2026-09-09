import { estCodeChantier } from '@/lib/tarifPanneaux';
import {
  RAILS_PANNEAU, RAILS_PANONCEAU, RAILS_FIXES, RAILS_ZONE, RAILS_J4,
} from '@/lib/railsPanneaux.donnees';

/**
 * Combien de brides un devis demande-t-il ?
 *
 * **UNE BRIDE PAR RAIL.** Le nombre de rails n'est pas une formule : il se lit
 * dans la table du catalogue, famille par famille et taille par taille (voir
 * `railsPanneaux.donnees.ts`). Un A13a en 700 porte 2 rails et donc 2 brides ;
 * le même en 1250 en porte 3 ; un B21a1 en porte 4 quelle que soit sa cote ;
 * un panonceau 700×200 n'en porte qu'un.
 *
 * ON N'INVENTE JAMAIS UN NOMBRE DE RAILS. Une ligne dont la famille ou la
 * cote n'est pas dans la table ressort dans `aVerifier` : l'écran la montre
 * et le total ne la compte pas. Un rail deviné en trop se facture au client,
 * un rail deviné en moins manque sur le chantier — les deux se paient, et
 * aucun des deux ne se voit sur un total muet.
 *
 * La signalisation temporaire (AK, KC, KD, K5…) n'entre pas dans le compte :
 * elle se pose au sol ou sur trépied, elle n'a pas de rail. `estCodeChantier`
 * l'écarte, et c'est volontaire.
 */

export interface LigneABrider {
  /** Référence et libellé réunis : le code et la cote sont dans l'un ou l'autre. */
  texte: string;
  quantite: number;
}

export interface LigneBridee {
  texte: string;
  famille: string;
  /** Cote retenue : « 700 » pour un panneau, « 700x200 » pour un panonceau. */
  cote: string;
  quantite: number;
  railsUnitaires: number;
  brides: number;
}

export interface LigneDouteuse {
  texte: string;
  quantite: number;
  /** Ce qui manque pour trancher : la famille, ou la cote dans cette famille. */
  raison: 'famille inconnue' | 'cote absente de la table';
  famille?: string;
  cote?: string;
}

export interface ComptageBrides {
  lignes: LigneBridee[];
  aVerifier: LigneDouteuse[];
  /** Total des brides sur les seules lignes tranchées. */
  brides: number;
}

/** Cote rectangulaire d'un texte : « 700x200 », « 1200 x 600 ». */
function coteRectangle(t: string): string | null {
  const m = t.match(/(\d{3,4})\s*[x×]\s*(\d{3,4})/i);
  return m ? `${Number(m[1])}x${Number(m[2])}` : null;
}

/** Cote simple : le premier nombre de 3 ou 4 chiffres qui traîne. */
function coteSimple(t: string): string | null {
  const m = t.match(/(?:^|[^\d])(\d{3,4})(?:[^\d]|$)/);
  return m ? String(Number(m[1])) : null;
}

/**
 * Famille de rails d'un code IISR.
 *
 * L'ordre compte, comme dans `formeDeCode` : AB4 et AB3 avant la règle
 * générale des « A », B21a avant celle des « B », CE avant C.
 */
export function familleRails(code: string): string | null {
  const t = String(code || '').toUpperCase().replace(/\s+/g, '');
  if (!t) return null;
  if (estCodeChantier(t)) return null;

  if (/^M9H/.test(t)) return 'M9H';
  if (/^M9B/.test(t)) return 'M9B';
  if (/^M\d/.test(t)) return 'PANONCEAU';
  if (/^AB4/.test(t) || /^STOP/.test(t)) return 'AB4';
  if (/^AB3/.test(t)) return 'AB3';
  if (/^AB[167]/.test(t)) return 'AB6';
  if (/^A\d/.test(t)) return 'A';
  if (/^B21A/.test(t)) return 'B21A';
  if (/^B(30|51|56|57)\b/.test(t)) return 'ZONE';
  if (/^B\d/.test(t)) return 'B';
  if (/^C(107|108|207|208)/.test(t)) return 'C107';
  if (/^CE\d/.test(t)) return 'CE';
  if (/^C\d/.test(t)) return 'CE';
  if (/^J4/.test(t)) return 'J4';
  if (/^J5/.test(t)) return 'J5';
  if (/^G1/.test(t)) return 'G1';
  return null;
}

/**
 * La CLASSE de rétroréflexion, telle qu'une référence Odoo la porte en
 * segment : C1, C2, C3 et leurs variantes (C3FJ).
 *
 * ⚠️ **ELLE SE FAISAIT PRENDRE POUR UN CODE DE PANNEAU.** Une référence
 * s'écrit `AK3.700.C1.BTR.R.IS.BRUT` : le motif « C + chiffres » y trouvait
 * `C1`, et la famille « C » répondait. Mesuré sur la demande MGD / PANTIN —
 * AK3, KC1, MSP et POINT DE RASSEMBLEMENT ressortaient tous en famille
 * « CE », avec une cote prise au hasard dans le reste de la référence. Le
 * total de brides n'avait alors aucun rapport avec la demande, et rien ne le
 * signalait.
 *
 * Les vrais panneaux de la série C portent au moins deux chiffres — C18,
 * C20A, C27, C107 : écarter les C1/C2/C3 isolés ne coûte aucun panneau réel.
 */
const CLASSE_SEULE = /^C[123](FJ|J|V)?$/;

/** Le code réglementaire présent dans un texte, s'il y en a un. */
function codeDuTexte(t: string): string | null {
  const T = String(t || '').toUpperCase();
  const re = /\b(M9[HB]|M\d+[A-Z]?\d*|AB\d+[A-Z]?\d*|A\d+[A-Z]*\d*|B\d+[A-Z]*\d*|CE\d+[A-Z]*|C\d+[A-Z]*|J\d+|G1[A-C]?)\b/g;
  /* On parcourt TOUTES les occurrences : dans une référence, la classe précède
     souvent ce qui pourrait être un code, et s'arrêter à la première la
     retenait. */
  for (const m of T.matchAll(re)) {
    if (CLASSE_SEULE.test(m[1])) continue;
    return m[1];
  }
  return null;
}

/**
 * Rails d'un panneau : la table, et rien qu'elle.
 * `null` quand la combinaison n'y figure pas.
 */
export function railsDuPanneau(famille: string, texte: string): { rails: number | null; cote: string | null } {
  if (RAILS_FIXES[famille] != null) return { rails: RAILS_FIXES[famille], cote: null };

  if (famille === 'PANONCEAU') {
    const c = coteRectangle(texte);
    return { rails: c ? RAILS_PANONCEAU[c] ?? null : null, cote: c };
  }
  if (famille === 'ZONE') {
    const c = coteRectangle(texte);
    return { rails: c ? RAILS_ZONE[c] ?? null : null, cote: c };
  }
  if (famille === 'J4') {
    const c = coteRectangle(texte);
    return { rails: c ? RAILS_J4[c] ?? null : null, cote: c };
  }

  const table = RAILS_PANNEAU[famille];
  if (!table) return { rails: null, cote: null };
  const c = coteSimple(texte);
  return { rails: c ? table[c] ?? null : null, cote: c };
}

export function compterBrides(lignes: LigneABrider[]): ComptageBrides {
  const bridees: LigneBridee[] = [];
  const aVerifier: LigneDouteuse[] = [];

  for (const l of lignes) {
    const quantite = Math.max(0, Math.round(l.quantite || 0));
    if (!quantite) continue;

    const code = codeDuTexte(l.texte || '');
    const famille = code ? familleRails(code) : null;
    /* Pas de code réglementaire : ce n'est pas un panneau. Une résine, un
       plot, un mât ne se signalent pas comme « à vérifier » — ils n'ont
       simplement rien à voir avec des brides. */
    if (!famille) continue;

    const { rails, cote } = railsDuPanneau(famille, l.texte || '');
    if (rails == null) {
      aVerifier.push({
        texte: l.texte,
        quantite,
        raison: cote ? 'cote absente de la table' : 'famille inconnue',
        famille,
        cote: cote ?? undefined,
      });
      continue;
    }

    bridees.push({
      texte: l.texte,
      famille,
      cote: cote ?? '—',
      quantite,
      railsUnitaires: rails,
      brides: rails * quantite,
    });
  }

  return {
    lignes: bridees,
    aVerifier,
    brides: bridees.reduce((s, b) => s + b.brides, 0),
  };
}
