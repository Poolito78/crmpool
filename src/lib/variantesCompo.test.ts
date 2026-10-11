import { describe, it, expect } from 'vitest';
import {
  CLE_COMPO, achatVarianteCompo, designationAvecVariante, prixComposant, prixVarianteCompo, valeursVisibles,
  varianteDeLigne, type VarianteCompo,
  cleSousCompo, resoudreAvecSousVariantes, sousVariantesRetenues,
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

describe('variantes en cascade (SNLR dans 319R)', () => {
  // SNLR a ses propres variantes ; 319R en prend 2 dans sa variante « kit ».
  const SNLR_V: VarianteCompo = { id: 's1', nom: 'avec pigment', composants: [
    ligne({ produitId: 'base', quantite: 1, prixUnitaireHT: 30 }),
    ligne({ produitId: 'pig', quantite: 1, prixUnitaireHT: 5 }),
  ] };
  const KIT: VarianteCompo = { id: 'k', nom: 'kit', composants: [
    ligne({ produitId: '319', quantite: 1, prixUnitaireHT: 100 }),
    ligne({ produitId: 'snlr', quantite: 2, prixUnitaireHT: 20 }),
  ] };
  const produits = [
    { id: '319', prixAchat: 60 },
    { id: 'snlr', prixAchat: 12, variantesCompo: [SNLR_V] },
    { id: 'base', prixAchat: 18 },
    { id: 'pig', prixAchat: 2 },
  ];
  const trouver = (id: string) => produits.find(p => p.id === id);
  const prixArticle = (c: { produitId?: string; prixUnitaireHT: number }) => c.prixUnitaireHT;

  it("sans sous-variante choisie, SNLR vaut le prix de l'article", () => {
    const vc = { [CLE_COMPO]: 'k' };
    expect(prixVarianteCompo(KIT, resoudreAvecSousVariantes(prixArticle, trouver, vc))).toBe(140); // 100 + 2×20
    expect(achatVarianteCompo(KIT, produits, vc)).toBe(84);                                       // 60 + 2×12
  });

  it('la sous-variante retenue fait le prix, le coût et l’intitulé', () => {
    const vc = { [CLE_COMPO]: 'k', [cleSousCompo('snlr')]: 's1' };
    expect(prixVarianteCompo(KIT, resoudreAvecSousVariantes(prixArticle, trouver, vc))).toBe(170); // 100 + 2×(30+5)
    expect(achatVarianteCompo(KIT, produits, vc)).toBe(100);                                      // 60 + 2×(18+2)
    const sous = sousVariantesRetenues(KIT, trouver, vc);
    expect(sous.map(s => s.variante.nom)).toEqual(['avec pigment']);
    expect(designationAvecVariante('IS 319R', KIT, [{ article: 'SNLR', nom: 'avec pigment' }]))
      .toBe('IS 319R — kit (SNLR : avec pigment)');
  });

  it('la clé de cascade reste interne', () => {
    expect(valeursVisibles({ [cleSousCompo('snlr')]: 's1', dim: 'RAL 1015' })).toEqual(['RAL 1015']);
  });

  it('une boucle de fiches ne fige pas le calcul', () => {
    const A: VarianteCompo = { id: 'a1', nom: 'a', composants: [ligne({ produitId: 'B', quantite: 1, prixUnitaireHT: 1 })] };
    const B: VarianteCompo = { id: 'b1', nom: 'b', composants: [ligne({ produitId: 'A', quantite: 1, prixUnitaireHT: 1 })] };
    const boucle = [{ id: 'A', prixAchat: 1, variantesCompo: [A] }, { id: 'B', prixAchat: 1, variantesCompo: [B] }];
    const t = (id: string) => boucle.find(p => p.id === id);
    const vc = { [cleSousCompo('A')]: 'a1', [cleSousCompo('B')]: 'b1' };
    expect(prixVarianteCompo(A, resoudreAvecSousVariantes(prixArticle, t, vc))).toBe(1);
    expect(sousVariantesRetenues(A, t, vc).length).toBeLessThanOrEqual(5);
  });
});
