import { describe, it, expect } from 'vitest';
import { libelleTeinte } from './ralColors';

describe('libelleTeinte', () => {
  it('nomme une teinte RAL explicite', () => {
    expect(libelleTeinte('RAL 7042')).toBe('RAL 7042 Gris signalisation A');
    expect(libelleTeinte('RAL7016')).toBe('RAL 7016 Gris anthracite');
  });

  it('préfère le RAL cité au code Quartz qui le précède', () => {
    expect(libelleTeinte('2012 (RAL 7040, Window Grey)')).toBe('RAL 7040 Gris fenêtre');
  });

  it('rend tel quel un code Quartz sans RAL', () => {
    expect(libelleTeinte('340 (Pastel Yellow)')).toBe('340 (Pastel Yellow)');
  });

  it("ne prend pas un nombre quelconque pour une teinte", () => {
    expect(libelleTeinte('Seau 1000 ml')).toBeUndefined();
    expect(libelleTeinte('0,7-1,2 mm')).toBeUndefined();
  });

  it("ne nomme pas un RAL absent de la table", () => {
    expect(libelleTeinte('RAL 9999')).toBeUndefined();
  });
});
