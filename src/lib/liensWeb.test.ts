import { describe, it, expect } from 'vitest';
import { normaliserUrl, libelleParDefaut } from './liensWeb';

describe('liens web du menu', () => {
  it('ajoute https:// à une adresse tapée sans', () => {
    expect(normaliserUrl('isofloor.fr/aide-applicateurs')).toBe('https://isofloor.fr/aide-applicateurs');
    expect(normaliserUrl('  https://www.isofloor.fr ')).toBe('https://www.isofloor.fr/');
  });

  it('refuse ce qui n\'est pas une page web', () => {
    expect(normaliserUrl('')).toBeNull();
    expect(normaliserUrl('tarif pochoirs')).toBeNull();
    expect(normaliserUrl('javascript:alert(1)')).toBeNull();
    expect(normaliserUrl('pochoirs')).toBeNull();
  });

  it('nomme un lien par son domaine', () => {
    expect(libelleParDefaut('https://www.isofloor.fr/calcul')).toBe('isofloor.fr');
  });
});
