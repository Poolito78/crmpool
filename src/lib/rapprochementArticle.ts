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
  /**
   * L'article ACCOMPAGNE la pièce nue au lieu d'en être une : gaine
   * plastique pour tube, support GBA pour glissière béton, fourreau à
   * sceller.
   *
   * Tous portent la section et la longueur de la pièce qu'ils habillent —
   * « Gaine Plastique pour Tube 80 × 40 », « Support GBA 80 × 40 Longueur
   * 2m » — et le rapprochement les retenait donc en tête sur « mât de 80 × 40
   * de 2 ml », là où le bon article est « SUPPORT ACIER GALVA 80X40 1.5 LG
   * 2000 ». Ce sont des produits distincts, à des prix sans rapport — 39 € et
   * 104,88 € contre 15,09 € — pas des finitions du même article.
   *
   * Ils restent proposés dès que la demande les nomme.
   */
  accessoire?: boolean;
  /**
   * Conditionnement en kilogrammes, lu dans le libellé — « (20KG) »,
   * « (180KG) », « (2,93 kg) ».
   *
   * Chez ISOMARK et ISOFLOOR, deux articles peuvent porter exactement les
   * mêmes mots et ne différer que par là : FLOWFASTPRIMER107.20 est le pot de
   * 20 kg à 462 €, FLOWFASTF107 le fût de 180 kg à 4 088 €. Se tromper de
   * ligne, c'est neuf fois la marchandise.
   */
  conditionnement?: number;
  /** La demande parle d'un pot, d'un seau, d'un bidon : petit format. */
  petitContenant?: boolean;
  /** Elle parle d'un fût, d'une palette : grand format. */
  grosContenant?: boolean;
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

  /* À demander explicitement, jamais proposés d'office. */
  if (/\b(gaine|gaines|gba|fourreau|fourreaux)\b/.test(t)) out.accessoire = true;

  /* Conditionnement. Les grammes sont volontairement ignorés : un catalyseur
     de 400 g n'est pas un conditionnement concurrent d'un pot de 20 kg, c'est
     un autre produit. */
  const kg = t.match(/(\d+(?:[.,]\d+)?)\s*kgs?\b/);
  if (kg) out.conditionnement = parseFloat(kg[1].replace(',', '.'));

  if (/\b(pot|pots|seau|seaux|bidon|bidons|boite|boites)\b/.test(t)) out.petitContenant = true;
  if (/\b(fut|futs|tonnelet|tonnelets|palette|palettes)\b/.test(t)) out.grosContenant = true;

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
  /* Ni un accessoire à une demande de pièce nue. */
  if (cible.accessoire && !demande.accessoire) return null;

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

  /* CONDITIONNEMENT.
   *
   * « pot de primaire flowfast » retenait FLOWFASTF107, le fût de 180 kg à
   * 4 088 €, quand le client demandait le pot de 20 kg à 462 € : les deux
   * articles portent les mêmes mots, seul le conditionnement les sépare.
   *
   * On classe, on n'élimine pas : un client qui voulait le fût le retrouve
   * juste en dessous, à un clic. Les malus sont donc VOLONTAIREMENT modestes
   * — un article dont la note tombe sous zéro disparaît de la liste, et le
   * premier jet de cette règle faisait exactement cela. Un poids
   * explicitement demandé prime sur le mot du contenant. */
  if (cible.conditionnement !== undefined) {
    if (demande.conditionnement !== undefined) {
      if (Math.abs(cible.conditionnement - demande.conditionnement) < 0.01) {
        score += 40; raisons.push(`${cible.conditionnement} kg`);
      } else {
        score -= 25; raisons.push(`conditionnement ${cible.conditionnement} kg`);
      }
    } else if (demande.petitContenant) {
      if (cible.conditionnement <= SEUIL_PETIT_CONDITIONNEMENT) {
        score += 20; raisons.push(`${cible.conditionnement} kg`);
      } else {
        score -= 12; raisons.push(`${cible.conditionnement} kg, trop gros pour un pot`);
      }
    } else if (demande.grosContenant) {
      if (cible.conditionnement >= SEUIL_PETIT_CONDITIONNEMENT) {
        score += 20; raisons.push(`${cible.conditionnement} kg`);
      } else {
        score -= 12; raisons.push(`${cible.conditionnement} kg seulement`);
      }
    }
  }

  // Recouvrement de vocabulaire, pour départager à caractéristiques égales.
  const md = mots(demandeTexte);
  const mc = mots(`${produit.reference} ${produit.description}`);
  const communs = [...md].filter(m => mc.has(m)).length;
  score += md.size ? Math.round((communs / md.size) * 30) : 0;

  return { score, pourquoi: raisons.join(', ') };
}

/** Au-delà, ce n'est plus un pot mais un fût. */
export const SEUIL_PETIT_CONDITIONNEMENT = 30;

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
    /* À égalité, le conditionnement courant plutôt que le fût : se tromper
       vers le petit coûte une relance, se tromper vers le gros engage neuf
       fois la marchandise. */
    || (caracteristiques(`${a.p.reference} ${a.p.description}`).conditionnement ?? 0)
       - (caracteristiques(`${b.p.reference} ${b.p.description}`).conditionnement ?? 0)
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
