import { describe, it, expect } from 'vitest';
import { deplacer } from './ordre';

describe('deplacer', () => {
  it('monte et descend d\'un cran', () => {
    expect(deplacer(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(deplacer(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });
  it('ne bouge pas aux extrémités et ne modifie pas la liste d\'origine', () => {
    const l = ['a', 'b'];
    expect(deplacer(l, 0, -1)).toBe(l);
    expect(deplacer(l, 1, 1)).toBe(l);
    deplacer(l, 0, 1);
    expect(l).toEqual(['a', 'b']);
  });
});
