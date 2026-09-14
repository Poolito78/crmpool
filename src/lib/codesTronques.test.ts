import { describe, it, expect } from 'vitest';
import { normaliserCodes, codeDansTexte, panonceauDansTexte, prixPanneau } from './tarifPanneaux';

/* ⚠️ « B6- + M6i stationnement interdit sauf véhicules électriques » : seul le
   M6I était reconnu, et le devis sortait sans panneau. */
describe('code B6 écrit sans sa lettre', () => {
  it('donne B6D quand le M6i accompagne, et garde le panonceau', () => {
    const t = normaliserCodes(
      'B6- + M6i stationnement interdit sauf véhicules électriques pendant la durée de recharge');
    expect(t.startsWith('B6D + M6i')).toBe(true);
    expect(codeDansTexte(t)?.code).toBe('B6D');
    expect(panonceauDansTexte(t, 'B6D')?.code).toBe('M6I');
    expect(prixPanneau('B6D')).not.toBeNull();
  });

  it('sans M6i, le libellé décide', () => {
    expect(normaliserCodes('B6 arrêt et stationnement interdits'))
      .toBe('B6D arrêt et stationnement interdits');
    expect(normaliserCodes('B6- stationnement interdit')).toBe('B6A1 stationnement interdit');
  });

  it('ne devine pas sans libellé, et ne touche pas un code complet', () => {
    expect(normaliserCodes('B6 panneau rond')).toBe('B6 panneau rond');
    expect(normaliserCodes('B6A1 stationnement interdit')).toBe('B6A1 stationnement interdit');
    expect(normaliserCodes('B6D + M6i')).toBe('B6D + M6i');
    expect(normaliserCodes('M6IE2 sauf B6')).toBe('M6IE2 sauf B6');
  });
});
