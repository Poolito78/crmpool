import { describe, it, expect } from 'vitest';
import { appliquerDelta, curseurDe } from './cacheCatalogue';

const l = (id: string, updated_at: string, reference = id) => ({ id, updated_at, reference });

describe('appliquerDelta', () => {
  it('remplace, ajoute et retire, puis trie par identifiant', () => {
    const base = [l('a', '2026-10-01T00:00:00+00:00'), l('b', '2026-10-01T00:00:00+00:00'), l('c', '2026-10-01T00:00:00+00:00')];
    const r = appliquerDelta(base, {
      modifies: [l('b', '2026-10-11T00:00:00+00:00', 'B2'), l('0', '2026-10-11T00:00:00+00:00')],
      supprimes: ['c'],
      curseur: '2026-10-11T00:00:00+00:00',
    });
    expect(r.map(x => x.id)).toEqual(['0', 'a', 'b']);
    expect(r.find(x => x.id === 'b')!.reference).toBe('B2');
  });

  it('un article effacé puis recréé revient par les modifiés', () => {
    const r = appliquerDelta([l('a', '2026-10-01T00:00:00+00:00')], {
      modifies: [l('a', '2026-10-11T00:00:00+00:00', 'neuf')], supprimes: ['a'], curseur: 'x',
    });
    expect(r).toHaveLength(1);
    expect(r[0].reference).toBe('neuf');
  });

  it('sans changement, rend le même tableau', () => {
    const base = [l('a', '2026-10-01T00:00:00+00:00')];
    expect(appliquerDelta(base, { modifies: [], supprimes: [], curseur: 'x' })).toBe(base);
  });
});

describe('curseurDe', () => {
  it('prend la plus récente date, et null sans la colonne', () => {
    expect(curseurDe([l('a', '2026-10-01T00:00:00+00:00'), l('b', '2026-10-11T09:00:00+00:00')]))
      .toBe('2026-10-11T09:00:00+00:00');
    expect(curseurDe([{ id: 'a' }])).toBeNull();
  });
});
