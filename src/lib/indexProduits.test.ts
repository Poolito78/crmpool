import { describe, it, expect } from 'vitest';
import { chercherProduits } from '@/lib/indexProduits';
import type { Produit } from '@/lib/store';

/** Article minimal : la recherche ne lit que ces quatre champs. */
function art(reference: string, description = '', categorie = '', descriptionVariante = ''): Produit {
  return { id: reference, reference, description, categorie, descriptionVariante } as Produit;
}

const RALS = ['L7003', 'L5010', 'L7016', 'L7012', 'L3020'];

/** Le catalogue range les laquées AVANT la brute — c'est le cas réel. */
const BSP: Produit[] = [
  ...RALS.map(r => art(`BSP.650.C2.BTR.IS.${r}`, 'IS BSP')),
  art('BSP.650.C2.BTR.IS.BRUT', 'IS BSP'),
];

describe('chercherProduits — classement des finitions', () => {
  it('remonte la finition BRUT quand aucun RAL n’est demandé', () => {
    const { resultats } = chercherProduits(BSP, 'BSP.650.C2.BTR');
    expect(resultats[0].reference).toBe('BSP.650.C2.BTR.IS.BRUT');
  });

  it('ne relègue pas la laquée que la saisie nomme', () => {
    const { resultats } = chercherProduits(BSP, 'BSP.650.C2.BTR.IS.L7016');
    expect(resultats[0].reference).toBe('BSP.650.C2.BTR.IS.L7016');
  });

  it('laisse remonter toutes les laquées quand on tape un RAL seul', () => {
    const { resultats } = chercherProduits(BSP, 'L5010');
    expect(resultats.map(p => p.reference)).toEqual(['BSP.650.C2.BTR.IS.L5010']);
  });

  it('ne perd pas la BRUT sous le plafond d’affichage', () => {
    // 80 laquées avant la brute, plafond à 10 : sans seaux séparés, la brute
    // serait coupée par le plafond au lieu d’être classée première.
    const beaucoup: Produit[] = [
      ...Array.from({ length: 80 }, (_, i) =>
        art(`A13A.700.C2.BTR.IS.L${1000 + i}`, 'IS A13A')),
      art('A13A.700.C2.BTR.IS.BRUT', 'IS A13A'),
    ];
    const { resultats, total } = chercherProduits(beaucoup, 'A13A.700', 10);
    expect(resultats[0].reference).toBe('A13A.700.C2.BTR.IS.BRUT');
    expect(resultats).toHaveLength(10);
    expect(total).toBe(81);
  });

  it('laisse intact le classement des articles sans finition', () => {
    const plasto: Produit[] = [
      art('PLASTOBLOCPM6060', 'PLASTOBLOC15 (STI)'),
      art('PLASTOBLOC16.4040.6060.8040', 'PLASTOBLOC16PM (STI)'),
      art('PLASTOBLOC24GM', 'PLASTOBLO24GMSTI'),
    ];
    const { resultats, total } = chercherProduits(plasto, 'PLASTO');
    expect(resultats.map(p => p.reference)).toEqual(plasto.map(p => p.reference));
    expect(total).toBe(3);
  });

  it('trouve une declinaison quand les mots sont separes par des points', () => {
    const a13a: Produit[] = [
      art('A13A.500.C1.BTR.IS.BRUT', 'IS A13A', '', 'A13A 500 C1 BTR BRUT (MAGELLAN)'),
      art('A13A.700.C1.BTR.IS.BRUT', 'IS A13A', '', 'A13A 700 C1 BTR BRUT (MAGELLAN)'),
      art('A13A.700.C2.BTR.IS.BRUT', 'IS A13A', '', 'A13A 700 C2 BTR BRUT (MAGELLAN)'),
    ];
    const { resultats } = chercherProduits(a13a, 'A13A 700');
    expect(resultats.map(p => p.reference)).toEqual([
      'A13A.700.C1.BTR.IS.BRUT', 'A13A.700.C2.BTR.IS.BRUT',
    ]);
  });

  it('cherche aussi dans la designation de la declinaison', () => {
    const p = [art('X.1.IS.BRUT', 'IS X', '', 'X 700 C2 BTR BRUT (MAGELLAN)')];
    expect(chercherProduits(p, 'MAGELLAN').resultats).toHaveLength(1);
  });

  it('ne prend pas une cote pour un RAL', () => {
    // « 1000 » est la dimension ; L1000 est un laquage, il reste derriere.
    const a11: Produit[] = [
      art('A11.1000.C1.BTR.IS.L1000', 'IS A11'),
      art('A11.1000.C1.BTR.IS.BRUT', 'IS A11'),
    ];
    const { resultats } = chercherProduits(a11, 'A11 1000');
    expect(resultats[0].reference).toBe('A11.1000.C1.BTR.IS.BRUT');
  });

  it('garde la priorité de la référence sur la description', () => {
    const mixte: Produit[] = [
      art('BALISE.J11', 'balise conforme J11'),
      art('J11C2', 'IS J11'),
    ];
    const { resultats } = chercherProduits(mixte, 'J11');
    expect(resultats[0].reference).toBe('J11C2');
  });
});
