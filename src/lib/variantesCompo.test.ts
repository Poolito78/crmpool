import { describe, it, expect } from 'vitest';
import {
  CLE_COMPO, achatVarianteCompo, designationAvecVariante, prixComposant, prixVarianteCompo, valeursVisibles,
  varianteDeLigne, type VarianteCompo,
} from './variantesCompo';

const ligne = (p: object) => ({ description: '', quantite: 1, unite: 'pièce', prixUnitaireHT: 0, remise: 0, ...p });

const V: VarianteCompo = {
  id: 'v1', nom: 'avec primaire',
  composants: [
    ligne({ produitId: 'a', quantite: 2, prixUnitaireHT: 10 }),
    ligne({ produitId: 'b', quantite: 1, prixUnitaireHT: 50, remise: 10 }),
  ],
};

describe('variantes composées', () => {
  it('le prix est la somme des composants, remise comprise', () => {
    expect(prixVarianteCompo(V)).toBe(65); // 2×10 + 50×0,9
  });

  it('le coût d\'achat n\'est donné que si tous les composants sont au catalogue', () => {
    const produits = [{ id: 'a', prixAchat: 4 }, { id: 'b', prixAchat: 20 }];
    expect(achatVarianteCompo(V, produits)).toBe(28);
    expect(achatVarianteCompo(V, [produits[0]])).toBeUndefined();
    expect(achatVarianteCompo({ ...V, composants: [ligne({ description: 'libre' })] }, produits)).toBeUndefined();
  });

  it('un composant suit le prix courant de son article, sauf prix saisi à la main ou article sans prix', () => {
    const c = ligne({ produitId: 'a', prixUnitaireHT: 10 });
    expect(prixComposant(c, () => 12.86)).toBe(12.86);
    expect(prixComposant({ ...c, prixFige: true }, () => 12.86)).toBe(10);
    expect(prixComposant(c, () => 0)).toBe(10);
    expect(prixComposant(c, () => undefined)).toBe(10);
    expect(prixVarianteCompo({ id: 'v', nom: 'x', composants: [ligne({ produitId: 'a', quantite: 2, prixUnitaireHT: 10 })] }, () => 15)).toBe(30);
  });

  it("pas de coût d'achat si le prix d'achat d'un article n'est pas renseigné", () => {
    expect(achatVarianteCompo(V, [{ id: 'a', prixAchat: 4 }, { id: 'b', prixAchat: 0 }])).toBeUndefined();
  });

  it('la désignation reprend l\'article de base puis la variante', () => {
    expect(designationAvecVariante('FLOWFAST 107 Primer (20 kg)', V)).toBe('FLOWFAST 107 Primer (20 kg) — avec primaire');
  });

  it('la variante d\'une ligne se retrouve par la clé interne, et celle-ci ne s\'affiche pas', () => {
    const vc = { [CLE_COMPO]: 'v1', 'dim1': 'RAL 9010' };
    expect(varianteDeLigne({ variantesCompo: [V] }, vc)?.nom).toBe('avec primaire');
    expect(varianteDeLigne({ variantesCompo: [] }, vc)).toBeUndefined();
    expect(valeursVisibles(vc)).toEqual(['RAL 9010']);
  });
});
