import { describe, it, expect } from 'vitest';
import { fusionnerColonnesLourdes, type Produit } from './store';

const dim = [{ id: 'd1', nom: 'Teinte', options: [{ id: 'o1', label: 'RAL 1000' }] }];
const courant = { id: 'p1', reference: 'PIGMENT', prixHT: 10, variantes: dim } as unknown as Produit;

describe('message temps réel d\'un article', () => {
  it('une colonne lourde absente du message garde sa valeur en mémoire (variantes RAL)', () => {
    const recu = { id: 'p1', reference: 'PIGMENT', prixHT: 12, variantes: undefined } as unknown as Produit;
    const r = fusionnerColonnesLourdes(courant, recu, { id: 'p1', prix_ht: 12 });
    expect(r.prixHT).toBe(12);
    expect(r.variantes).toBe(dim);
  });

  it('une colonne présente dans le message l\'emporte, même vide', () => {
    const recu = { id: 'p1', reference: 'PIGMENT', prixHT: 12, variantes: undefined } as unknown as Produit;
    const r = fusionnerColonnesLourdes(courant, recu, { id: 'p1', variantes: null });
    expect(r.variantes).toBeUndefined();
  });
});
