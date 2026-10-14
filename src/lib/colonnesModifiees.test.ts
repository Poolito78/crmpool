import { describe, it, expect } from 'vitest';
import { colonnesModifiees, type Produit } from './store';

const base: Produit = {
  id: 'p1', reference: 'FLOWFASTF1', description: 'FLOWFAST F1 MORTAR',
  prixAchat: 10, coefficient: 1.6, prixHT: 20, coeffRevendeur: 1.6, remiseRevendeur: 30,
  prixRevendeur: 16, tva: 20, unite: 'kit', stock: 0, stockMin: 0,
  dateCreation: '2026-01-01T00:00:00Z', ficheType: 'isofloor',
};

describe('colonnesModifiees', () => {
  it('n’envoie que la fiche ajoutée', () => {
    const apres = { ...base, ficheUrl: 'https://x/f.pdf', ficheLinkLabel: 'f.pdf' };
    expect(colonnesModifiees(base, apres, 'u1')).toEqual({ fiche_url: 'https://x/f.pdf', fiche_link_label: 'f.pdf' });
  });

  it('une relecture du stock ne réécrit pas la fiche d’une copie périmée', () => {
    const apres = { ...base, stockOdoo: 4, stockOdooMaj: '2026-10-14T16:10:33Z' };
    const patch = colonnesModifiees(base, apres, 'u1');
    expect(Object.keys(patch).sort()).toEqual(['stock_odoo', 'stock_odoo_maj']);
    expect(patch).not.toHaveProperty('fiche_url');
  });

  it('rien de changé, rien à écrire — ni l’auteur de l’article', () => {
    expect(colonnesModifiees(base, { ...base }, 'autre')).toEqual({});
  });
});
