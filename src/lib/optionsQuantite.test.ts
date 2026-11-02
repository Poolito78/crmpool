import { describe, expect, it } from 'vitest';
import { quantiteOption, quantitePourTeinte, teinteCorrespond } from './optionsQuantite';

describe('teinteCorrespond', () => {
  it('compare les numéros RAL', () => {
    expect(teinteCorrespond('1023', 'RAL 1023 Jaune signalisation')).toBe(true);
    expect(teinteCorrespond('RAL 1023', 'RAL1023')).toBe(true);
    expect(teinteCorrespond('1023', 'RAL 1021')).toBe(false);
    expect(teinteCorrespond('1023', 'RAL 10230')).toBe(false);
  });
  it('sinon le libellé entier', () => {
    expect(teinteCorrespond(' Blanc ', 'blanc')).toBe(true);
    expect(teinteCorrespond('Blanc', 'Blanc cassé')).toBe(false);
    expect(teinteCorrespond('', 'Blanc')).toBe(false);
  });
});

describe('pigment : 1 kg par kit, 2 kg pour le RAL 1023', () => {
  const regle = { quantite: 1, parUnite: true, quantitesParTeinte: [{ teinte: 'RAL 1023', quantite: 2 }] };

  it('quantité de base sans exception', () => {
    expect(quantitePourTeinte(1, regle.quantitesParTeinte, { t: 'RAL 7037' })).toBe(1);
    expect(quantitePourTeinte(1, regle.quantitesParTeinte, undefined)).toBe(1);
    expect(quantitePourTeinte(1, regle.quantitesParTeinte, { t: 'RAL 1023' })).toBe(2);
  });

  it('× les kits de l\'article', () => {
    expect(quantiteOption(regle, { t: 'RAL 7037' }, 5)).toBe(5);
    expect(quantiteOption(regle, { t: 'RAL 1023' }, 5)).toBe(10);
    expect(quantiteOption({ ...regle, parUnite: undefined }, { t: 'RAL 1023' }, 5)).toBe(2);
  });
});
