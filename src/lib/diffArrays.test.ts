import { describe, it, expect } from 'vitest';
import { diffArrays } from './store';

const a = (id: string, v = 0) => ({ id, v });

describe('ce qui a changé entre deux versions d\'une table', () => {
  it('voit les ajouts, les retraits et les modifications', () => {
    const prev = [a('1'), a('2'), a('3')];
    const next = [prev[0], { id: '2', v: 9 }, a('4')];
    const d = diffArrays(prev, next);
    expect(d.added.map(x => x.id)).toEqual(['4']);
    expect(d.updated.map(x => x.id)).toEqual(['2']);
    expect(d.removed.map(x => x.id)).toEqual(['3']);
  });

  it('ne signale rien quand rien ne bouge', () => {
    const prev = [a('1'), a('2')];
    const d = diffArrays(prev, prev.slice());
    expect(d.added).toEqual([]);
    expect(d.updated).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it('repère une modification même sur un objet reconstruit à l\'identique', () => {
    /* Le raccourci par identité ne doit pas masquer un vrai changement
       quand l'objet a été recréé : on retombe sur la comparaison. */
    const prev = [{ id: '1', v: 1 }];
    const next = [{ id: '1', v: 2 }];
    expect(diffArrays(prev, next).updated.map(x => x.id)).toEqual(['1']);
  });

  it('ignore un objet recréé mais identique', () => {
    const prev = [{ id: '1', v: 1 }];
    const next = [{ id: '1', v: 1 }];
    expect(diffArrays(prev, next).updated).toEqual([]);
  });

  it('tient le catalogue entier sans y passer la seconde', () => {
    /* 22 637 articles, une seule ligne changée : c'est exactement ce que
       fait l'enregistrement d'un produit. L'ancienne version — un `find`
       par ligne et deux sérialisations — mettait 1,9 seconde, dans le corps
       d'un setState, donc écran figé. */
    const prev = Array.from({ length: 22637 }, (_, i) => ({
      id: 'id' + i, reference: 'REF' + i,
      description: 'IS AK5 1000 C2 BTR ST IS BRUT panneau ' + i,
      prixHT: 12.34, paliersPrix: [{ qteMin: 1, prixHT: 3 }],
    }));
    const next = prev.slice();
    next[1000] = { ...prev[1000], prixHT: 99 };
    const t = performance.now();
    const d = diffArrays(prev, next);
    const ms = performance.now() - t;
    expect(d.updated.map(x => x.id)).toEqual(['id1000']);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(ms).toBeLessThan(300);
  });
});
