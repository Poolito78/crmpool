import { describe, it, expect } from 'vitest';
import {
  chiffrerTransport, coutMessagerie, coutAffretement, articlePlastique,
  departement, ARTICLES_PLASTIQUE,
} from './transportPlastique';

const PLASTOBLOC = 'Plastobloc 24Kg GM (80x40-60x60-40x40-80x80-Ø42)';

describe('transport des produits plastique', () => {
  it("reproduit l'exemple du classeur au dix-millième près", () => {
    /* Feuille « Calcul frais transport » : 60 Plastobloc 24 kg vers le 62.
       Le classeur affiche 587,7867707 en messagerie, 213,75 en affrètement,
       et retient l'affrètement. */
    const a = articlePlastique(PLASTOBLOC)!;
    expect(a).not.toBeNull();
    const d = chiffrerTransport(a, 60, 62)!;
    expect(d.poids).toBe(1440);
    expect(d.palettes).toBe(2);
    expect(d.metresLineaires).toBe(1);
    expect(d.messagerie!).toBeCloseTo(587.7868, 3);
    expect(d.affretement!).toBeCloseTo(213.75, 4);
    expect(d.mode).toBe('affretement');
    expect(d.montant).toBeCloseTo(213.75, 4);
  });

  it('facture au forfait jusqu’à 100 kg, aux 100 kg au-delà', () => {
    const petit = coutMessagerie('01', 50)!;
    const gros = coutMessagerie('01', 500)!;
    /* Sous 100 kg le tarif ne dépend pas du poids exact : c'est un forfait,
       donc 50 et 59 kg coûtent la même chose. */
    expect(coutMessagerie('01', 59)).toBeCloseTo(petit, 6);
    /* Au-delà, il en dépend : 500 et 590 kg diffèrent. */
    expect(coutMessagerie('01', 590)).not.toBeCloseTo(gros, 2);
  });

  it('arrondit le poids au palier supérieur, comme le tableur', () => {
    /* 101 et 110 kg tombent dans la même tranche mais pas sur le même
       multiplicateur : 110 contre 110. 101 → CEILING(102,10) = 110. */
    expect(coutMessagerie('01', 101)).toBeCloseTo(coutMessagerie('01', 109)!, 6);
    expect(coutMessagerie('01', 111)).toBeGreaterThan(coutMessagerie('01', 101)!);
  });

  it('arrondit les mètres linéaires au demi-mètre supérieur', () => {
    /* 0,8 ml doit être facturé 1 ml, pas 0,5. */
    expect(coutAffretement('62', 1)).toBeCloseTo(213.75, 4);
    const a = articlePlastique(PLASTOBLOC)!;
    expect(chiffrerTransport(a, 60, 62)!.metresLineaires).toBe(1);
    /* 31 pièces = 2 palettes également : la palette entamée compte. */
    expect(chiffrerTransport(a, 31, 62)!.palettes).toBe(2);
    expect(chiffrerTransport(a, 30, 62)!.palettes).toBe(1);
  });

  it('normalise le département, Corse comprise', () => {
    expect(departement(1)).toBe('01');
    expect(departement('7')).toBe('07');
    expect(departement('62')).toBe('62');
    expect(departement('2a')).toBe('2A');
  });

  it('refuse plutôt que d’inventer', () => {
    const a = articlePlastique(PLASTOBLOC)!;
    expect(chiffrerTransport(a, 0, 62)).toBeNull();
    expect(coutMessagerie('999', 100)).toBeNull();
    expect(articlePlastique('article qui n’existe pas')).toBeNull();
  });

  it('retrouve un article par sa référence autant que par son libellé', () => {
    expect(articlePlastique('PLASTOBLOC24GM')?.net).toBe(14);
    expect(articlePlastique(PLASTOBLOC)?.reference).toBe('PLASTOBLOC24GM');
  });

  it('porte le prix net du devis Odoo : 30 % sur le prix public', () => {
    /* Devis AF035816, ligne 8 : PLASTOBLOC24GM à 14,000 €. Le classeur cote
       20 € public, remise 30 %, net 14 €. */
    const a = articlePlastique('PLASTOBLOC24GM')!;
    expect(a.public).toBe(20);
    expect(a.remise).toBeCloseTo(0.3, 6);
    expect(a.net).toBe(14);
    expect(a.public * (1 - a.remise)).toBeCloseTo(a.net, 6);
  });

  it('a chargé le catalogue en entier', () => {
    expect(Object.keys(ARTICLES_PLASTIQUE).length).toBeGreaterThan(400);
  });
});
