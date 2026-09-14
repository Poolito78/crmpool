import type { NiveauTarif } from '@/lib/tarifPanneaux.donnees';
import { articlePlastique } from '@/lib/transportPlastique';
import type { Produit } from '@/lib/store';

export type { NiveauTarif };

/**
 * Prix d'un article au NIVEAU DE TARIF du client (R0 à R4).
 *
 * Les prix de la fiche article ne sont pas ceux qu'ISOSIGN facture sur la
 * signalisation verticale : `SG80401_5.3000.IS.BRUT` y vaut 89,43 € quand la
 * grille R4 le cote 22 €, et `AB4.600.C1.BRUT` n'y a aucun prix alors que la
 * grille R1 le cote 47,29 €. Le niveau du client (fiche client, onglet
 * Tarifs, repris et modifiable dans chaque devis) désigne donc la source :
 *
 *   signalisation ISOSIGN   grille du contrat « TARIF Rn » d'Odoo, recopiée
 *                           dans `grille_contrat` par `odoo-grille-sync`
 *   plastique STI           barème STI (`transportPlastique.donnees.ts`) :
 *                           R0 = prix public, R1-R4 = prix net remisé
 *   tout le reste           rien — la fiche article continue de tarifer
 *
 * ⚠️ **ON NE DÉDUIT JAMAIS UN NIVEAU D'UN AUTRE.** R4 = R0 − 35 % se vérifie
 * sur les panneaux, pas sur les fixations (BOUCHON8040 : R4 1,40 €, R1
 * 1,51 €, deux R0 différents selon qu'on part de l'un ou de l'autre). Un
 * article absent de la grille rend `null` : la ligne garde son prix fiche,
 * et l'écran le compte « hors grille ».
 *
 * ⚠️ `gabaritsGrille` est la COPIE de `ContratCadre.gabarits`
 * (`supabase/functions/odoo-prix/index.ts`) : une règle changée d'un côté
 * doit l'être de l'autre, sans quoi le devis et l'analyse de demande
 * cesseraient de coter le même prix.
 */

export const NIVEAUX_TARIF: NiveauTarif[] = ['R0', 'R1', 'R2', 'R3', 'R4'];

export const LIBELLE_NIVEAU: Record<NiveauTarif, string> = {
  R0: 'R0 — tarif public',
  R1: 'R1 — remise 20 %',
  R2: 'R2 — remise 25 %',
  R3: 'R3 — remise 30 %',
  R4: 'R4 — remise 35 %',
};

export function estNiveauTarif(v: unknown): v is NiveauTarif {
  return typeof v === 'string' && (NIVEAUX_TARIF as string[]).includes(v);
}

/** Codification (majuscules) → prix net et priorité de la ligne de grille. */
export type GrilleTarif = Map<string, { prix: number; prio: number }>;

export interface RangGrille {
  codification: string;
  prix: number | string;
  priorite?: number | string | null;
}

/**
 * Indexe les lignes d'une grille. Même arbitrage que `odoo-prix` : la
 * priorité la plus haute tranche, puis le prix le plus favorable au client.
 */
export function indexerGrille(rangs: RangGrille[]): GrilleTarif {
  const m: GrilleTarif = new Map();
  for (const l of rangs) {
    const k = String(l.codification || '').trim().toUpperCase();
    const prix = Number(l.prix) || 0;
    const prio = Number(l.priorite) || 0;
    if (!k || prix <= 0) continue;
    const vu = m.get(k);
    if (!vu || prio > vu.prio || (prio === vu.prio && prix < vu.prix)) m.set(k, { prix, prio });
  }
  return m;
}

/**
 * Codifications de grille susceptibles de tarifer ce code article, de la
 * plus précise à la plus générale. L'ordre EST la règle de priorité.
 *
 * La grille raisonne par gabarit : `A3A.700.C2.BTR.IS.BRUT` y est coté sous
 * `A*.700.C2.BRUT`. L'étoile est un caractère stocké tel quel (pas un joker),
 * et les segments BTR, IS et les options R/P/ST peuvent manquer côté grille.
 */
export function gabaritsGrille(code: string): string[] {
  const seg = String(code || '').trim().toUpperCase().split('.');
  const famille = seg[0] || '';
  const reste = seg.slice(1);
  if (!famille) return [];
  const suffixe = (retirer: RegExp | null) => {
    const gardes = retirer ? reste.filter(s => !retirer.test(s)) : reste;
    return gardes.length ? '.' + gardes.join('.') : '';
  };
  const sansOptions = (r: RegExp | null) => {
    const gardes = reste.filter(x => !/^(R|P|ST)$/i.test(x));
    const filtres = r ? gardes.filter(x => !r.test(x)) : gardes;
    return filtres.length ? '.' + filtres.join('.') : '';
  };
  const suffixes = [...new Set([
    suffixe(null),
    suffixe(/^BTR$/i),
    suffixe(/^IS$/i),
    suffixe(/^(BTR|IS)$/i),
    sansOptions(null),
    sansOptions(/^BTR$/i),
    sansOptions(/^IS$/i),
    sansOptions(/^(BTR|IS)$/i),
  ])];
  const out: string[] = [];
  for (const s of suffixes) out.push(famille + s);
  for (let i = famille.length; i >= 1; i--) {
    for (const s of suffixes) out.push(famille.slice(0, i) + '*' + s);
  }
  return [...new Set(out)];
}

/** Prix de la grille pour ce code, et la codification qui l'a donné. */
export function prixDansGrille(
  grille: GrilleTarif | undefined,
  code: string,
): { prix: number; gabarit: string } | null {
  if (!grille || !grille.size) return null;
  for (const g of gabaritsGrille(code)) {
    const l = grille.get(g);
    if (l) return { prix: l.prix, gabarit: g };
  }
  return null;
}

export interface PrixNiveau {
  prix: number;
  source: 'grille' | 'sti';
  /** Ce qui a tarifé : codification de grille, ou « STI public » / « STI net ». */
  detail: string;
}

type ProduitTarifable = Pick<Produit, 'reference' | 'referenceOdoo' | 'catalogue'>;

/** L'article relève-t-il du barème plastique STI ? */
export function estPlastiqueSti(p: ProduitTarifable): boolean {
  return !!(articlePlastique(p.referenceOdoo || '') || articlePlastique(p.reference));
}

/**
 * Prix de l'article au niveau demandé, ou `null` quand le niveau ne le
 * tarife pas — la fiche article reste alors la référence.
 *
 * `grille` peut manquer (pas encore chargée, ou niveau sans contrat chez
 * Odoo, cas du R0) : seul le plastique STI est alors tarifé.
 */
export function prixAuNiveau(
  p: ProduitTarifable,
  niveau: NiveauTarif,
  grille?: GrilleTarif,
): PrixNiveau | null {
  const sti = articlePlastique(p.referenceOdoo || '') || articlePlastique(p.reference);
  if (sti) {
    if (niveau === 'R0') {
      return sti.public > 0 ? { prix: sti.public, source: 'sti', detail: 'STI public' } : null;
    }
    return sti.net > 0 ? { prix: sti.net, source: 'sti', detail: 'STI net' } : null;
  }
  if (String(p.catalogue || '').toUpperCase() !== 'ISOSIGN') return null;
  const code = p.referenceOdoo || p.reference;
  const g = prixDansGrille(grille, code);
  return g ? { prix: Math.round(g.prix * 100) / 100, source: 'grille', detail: g.gabarit } : null;
}
