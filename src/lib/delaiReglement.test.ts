import { describe, it, expect } from 'vitest';
import { normalizeDelaiReglement, calculerDateEcheance } from './store';

describe('normalizeDelaiReglement', () => {
  it('ramène les saisies anciennes à la valeur du sélecteur', () => {
    expect(normalizeDelaiReglement('45j FDM')).toBe('45J FDM');
    expect(normalizeDelaiReglement('45J FDM')).toBe('45J FDM');
    expect(normalizeDelaiReglement('30j net')).toBe('30J');
    expect(normalizeDelaiReglement('30j Fin de mois')).toBe('30J FDM');
    expect(normalizeDelaiReglement('60j FDM')).toBe('60J FDM');
    expect(normalizeDelaiReglement('comptant')).toBe('Comptant');
  });

  it('laisse intact ce qu’elle ne reconnaît pas', () => {
    expect(normalizeDelaiReglement('à réception')).toBe('à réception');
  });

  it('la forme canonique se calcule toujours en échéance', () => {
    expect(calculerDateEcheance('2026-10-10', '30J').getTime())
      .toBe(calculerDateEcheance('2026-10-10', '30j net').getTime());
    expect(calculerDateEcheance('2026-10-10', '45J FDM').getTime())
      .toBe(calculerDateEcheance('2026-10-10', '45j FDM').getTime());
  });
});
