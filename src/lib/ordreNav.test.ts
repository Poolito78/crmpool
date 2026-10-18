import { describe, it, expect } from 'vitest';
import { ordonner, deplacerCle } from './ordreNav';

const id = (s: string) => s;

describe('ordonner', () => {
  it('suit l\'ordre enregistré', () => {
    expect(ordonner(['a', 'b', 'c'], id, ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });
  it('sans ordre, rend la liste telle quelle', () => {
    expect(ordonner(['a', 'b'], id, undefined)).toEqual(['a', 'b']);
  });
  it('une entrée nouvelle garde sa place d\'origine', () => {
    expect(ordonner(['a', 'n', 'b', 'c'], id, ['c', 'b', 'a'])).toEqual(['c', 'n', 'b', 'a']);
  });
  it('ignore une clé qui ne désigne plus rien', () => {
    expect(ordonner(['a', 'b'], id, ['x', 'b', 'a'])).toEqual(['b', 'a']);
  });
});

describe('deplacerCle', () => {
  it('en descendant, se place après la cible', () => {
    expect(deplacerCle(['a', 'b', 'c'], 'a', 'b')).toEqual(['b', 'a', 'c']);
    expect(deplacerCle(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
  });
  it('en montant, se place avant la cible', () => {
    expect(deplacerCle(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
  });
  it('clé inconnue : rien ne bouge', () => {
    expect(deplacerCle(['a', 'b'], 'x', 'a')).toEqual(['a', 'b']);
  });
});
