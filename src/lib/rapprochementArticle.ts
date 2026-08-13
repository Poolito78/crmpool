import type { Produit } from '@/lib/store';

/**
 * Rapprochement d'une demande client avec un article du catalogue.
 *
 * L'ancien rapprochement ne lisait que le premier mot de la demande. « Support
 * Ø 60 mm long 3.50 m » se réduisait à « support », et parmi les références
 * commençant par ce mot la plus courte l'emportait : SUPPORTGB, un support de
 * glissière béton pour tube 40×40. Le diamètre et la longueur n'étaient jamais
 * regardés — au point que le 3,50 m et le 4,00 m recevaient le même article et
 * le même prix.
 *
 * Ici, les caractéristiques qui distinguent deux articles d'une même famille
 * sont extraites des deux côtés et confrontées. Une contradiction élimine :
 * un article en 40×40 ne peut pas répondre à une demande en Ø 60, quel que
 * soit le reste du libellé. Et quand rien ne ressort, on ne choisit pas : une
 * ligne vide se remarque, un mauvais article chiffré avec assurance ne se
 * remarque pas.
 */

export interface Caracteristiques {
  /** Diamètre en mm — Ø60, D60, dia 60. */
  diametre?: number;
  /** Section en mm, normalisée « 40x40 » — le profil carré ou rectangulaire. */
  section?: string;
  /** Longueur en mm — 3.50 m, 3500, LG 3500. */
  longueur?: number;
  /** L'article est un conditionnement groupé : fardeau, lot, kit, palette. */
  groupe?: boolean;
}

export type Confiance = 'sure' | 'douteux' | 'aucun';

export interface Rapprochement {
  candidats: Produit[];
  /** Renseigné seulement si la confiance le justifie. */
  meilleur?: Produit;
  confiance: Confiance;
  /** À afficher tel quel quand la confiance n'est pas « sûre ». */
  pourquoi: string;
}

/* ── Extraction ──────────────────────────────────────────────────────────── */

function sansAccents(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Convertit « 3.50 m », « 3,50m », « 3500 », « 350 cm » en millimètres. */
function enMillimetres(valeur: number, unite: string): number | undefined {
  if (unite === 'm') return Math.round(valeur * 1000);
  if (unite === 'cm') return Math.round(valeur * 10);
  if (unite === 'mm') return Math.round(valeur);
  return undefined;
}

export function caracteristiques(texte: string): Caracteristiques {
  const t = sansAccents(texte);
  const out: Caracteristiques = {};

  // Section avant diamètre : « 80x80x2 » contient des nombres qu'on ne veut
  // pas voir pris pour un diamètre.
  const sec = t.match(/\b(\d{2,3})\s*[x×]\s*(\d{2,3})(?:\s*[x×]\s*(\d{1,2}))?\b/);
  if (sec) out.section = `${sec[1]}x${sec[2]}`;

  const dia = t.match(/(?:o|ø|d|dia|diam|diametre)\s*\.?\s*(\d{2,3})\b/)
    || t.match(/\b(\d{2,3})\s*mm\s*(?:de\s*)?diam/);
  if (dia) out.diametre = parseInt(dia[1], 10);

  // Longueur : d'abord les formes explicites, ensuite les nombres en mètres.
  const lgExplicite = t.match(/(?:lg|long|longueur|lng)\s*\.?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\b/);
  if (lgExplicite) {
    const v = parseFloat(lgExplicite[1].replace(',', '.'));
    out.longueur = enMillimetres(v, lgExplicite[2] || (v < 20 ? 'm' : 'mm'));
  } else {
    const lgMetres = t.match(/\b(\d{1,2}[.,]\d{1,2})\s*m\b/);
    if (lgMetres) out.longueur = Math.round(parseFloat(lgMetres[1].replace(',', '.')) * 1000);
  }

  // Un fardeau de 61 supports ne répond pas à une demande de 12 supports.
  if (/\b(fardeau|lot\s*\d|palette|kit\b|paquet|botte)/.test(t)) out.groupe = true;

  return out;
}

/* ── Comparaison ─────────────────────────────────────────────────────────── */

const MOTS_VIDES = new Set([
  'de', 'du', 'la', 'le', 'les', 'des', 'a', 'au', 'aux', 'en', 'pour', 'avec',
  'et', 'sur', 'par', 'is', 'mm', 'cm', 'm', 'long', 'longueur', 'lg',
]);

function mots(t: string) {
  return new Set(
    sansAccents(t).split(/[^a-z0-9]+/).filter(m => m.length > 1 && !MOTS_VIDES.has(m)),
  );
}

/**
 * Note un article face à une demande.
 *
 * `null` signifie « éliminé » : l'article contredit une caractéristique
 * explicite de la demande. Ce n'est pas un mauvais score, c'est une exclusion.
 */
export function noter(
  demande: Caracteristiques,
  demandeTexte: string,
  produit: Produit,
): { score: number; pourquoi: string } | null {
  const cible = caracteristiques(`${produit.reference} ${produit.description}`);

  // Contradictions : elles ferment le débat.
  if (demande.diametre && cible.diametre && demande.diametre !== cible.diametre) {
    return null;
  }
  if (demande.diametre && !cible.diametre && cible.section) {
    // La demande veut un rond, l'article est un profilé carré.
    return null;
  }
  if (demande.section && cible.section && demande.section !== cible.section) {
    return null;
  }
  if (demande.longueur && cible.longueur && demande.longueur !== cible.longueur) {
    return null;
  }
  // Un conditionnement groupé ne répond pas à une demande à l'unité.
  if (cible.groupe && !demande.groupe) return null;

  let score = 0;
  const raisons: string[] = [];

  if (demande.diametre && cible.diametre === demande.diametre) {
    score += 40; raisons.push(`Ø${cible.diametre}`);
  }
  if (demande.longueur && cible.longueur === demande.longueur) {
    score += 40; raisons.push(`longueur ${cible.longueur} mm`);
  }
  if (demande.section && cible.section === demande.section) {
    score += 40; raisons.push(cible.section);
  }

  // Les caractéristiques demandées mais absentes de l'article laissent un doute.
  if (demande.diametre && !cible.diametre) { score -= 15; raisons.push('diamètre absent'); }
  if (demande.longueur && !cible.longueur) { score -= 15; raisons.push('longueur absente'); }

  // Recouvrement de vocabulaire, pour départager à caractéristiques égales.
  const md = mots(demandeTexte);
  const mc = mots(`${produit.reference} ${produit.description}`);
  const communs = [...md].filter(m => mc.has(m)).length;
  score += md.size ? Math.round((communs / md.size) * 30) : 0;

  return { score, pourquoi: raisons.join(', ') };
}

/** Au-dessus, on retient l'article d'office. En dessous, on demande à voir. */
const SEUIL_SUR = 55;

export function rapprocherArticle(
  demandeTexte: string,
  produits: Produit[],
  limite = 20,
): Rapprochement {
  const texte = (demandeTexte || '').trim();
  if (!texte) return { candidats: [], confiance: 'aucun', pourquoi: 'demande vide' };

  const demande = caracteristiques(texte);

  const notes: { p: Produit; score: number; pourquoi: string }[] = [];
  for (const p of produits) {
    const n = noter(demande, texte, p);
    if (n && n.score > 0) notes.push({ p, score: n.score, pourquoi: n.pourquoi });
  }
  notes.sort((a, b) => b.score - a.score
    || a.p.reference.length - b.p.reference.length);

  const candidats = notes.slice(0, limite).map(n => n.p);
  if (!notes.length) {
    return {
      candidats: [],
      confiance: 'aucun',
      pourquoi: decrire(demande)
        ? `aucun article ne correspond à ${decrire(demande)}`
        : 'aucun article ne correspond',
    };
  }

  const tete = notes[0];
  if (tete.score >= SEUIL_SUR) {
    return { candidats, meilleur: tete.p, confiance: 'sure', pourquoi: tete.pourquoi };
  }
  return {
    candidats,
    confiance: 'douteux',
    pourquoi: tete.pourquoi
      ? `au mieux : ${tete.pourquoi}`
      : 'rapprochement par le libellé seul',
  };
}

/** « Ø60, 3500 mm » — pour expliquer ce qu'on cherchait. */
export function decrire(c: Caracteristiques): string {
  const bouts: string[] = [];
  if (c.diametre) bouts.push(`Ø${c.diametre}`);
  if (c.section) bouts.push(c.section);
  if (c.longueur) bouts.push(`${c.longueur} mm`);
  return bouts.join(', ');
}
