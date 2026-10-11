import { describe, it, expect } from 'vitest';
import {
  CLE_COMPO, achatVarianteCompo, designationAvecVariante, prixComposant, prixVarianteCompo, valeursVisibles,
  varianteDeLigne, type VarianteCompo,
  cleSousCompo, resoudreAvecSousVariantes, sousVariantesRetenues, dimensionsDesComposants,
  detailCompo, prixDetailCompo, prixLigneCompo, prixForces, avecPrixForce,
  aPlat, avecComposants, composantsPersonnalises,
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
    expect(designationAvecVariante('FLOWFAST 107 Primer (20 kg)', V)).toBe('FLOWFAST 107 Primer (20 kg) - avec primaire');
  });

  it('les morceaux vides sont sautés (variante sans nom, article « . »)', () => {
    // Le cas réel : FLOWFAST319R sans nom de variante, SNLR+P désigné « . ».
    expect(designationAvecVariante('KIT FLOWFAST 319 ROAD (45,8 kg)', { nom: '' },
      [{ article: '.', nom: '**2 Kits de 22,65 kg** - SNLR (2 x 11,65 kg)' }]))
      .toBe('KIT FLOWFAST 319 ROAD (45,8 kg) - **2 Kits de 22,65 kg** - SNLR (2 x 11,65 kg)');
    expect(designationAvecVariante('IS A', { nom: '  ' })).toBe('IS A');
    expect(designationAvecVariante('IS A', { nom: 'kit' }, [{ article: '.', nom: 'x' }])).toBe('IS A - kit (x)');
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
      .toBe('IS 319R - kit (SNLR : avec pigment)');
  });

  it('la clé de cascade reste interne', () => {
    expect(valeursVisibles({ [cleSousCompo('snlr')]: 's1', dim: 'RAL 1015' })).toEqual(['RAL 1015']);
  });

  it('la teinte du pigment est demandée, une fois par nom, même dans une sous-variante', () => {
    const teinte = (id: string) => ({ id, nom: 'Teinte', options: [{ id: `${id}-1`, label: 'RAL 1015' }, { id: `${id}-2`, label: 'RAL 7040' }] });
    const SNLRP: VarianteCompo = { id: 'sp', nom: '2 kits', composants: [
      ligne({ produitId: 'snlr11', quantite: 2 }), ligne({ produitId: 'pigkg', quantite: 2 }),
    ] };
    const R: VarianteCompo = { id: 'r', nom: 'kit', composants: [
      ligne({ produitId: 'ff319', quantite: 1 }), ligne({ produitId: 'snlrp', quantite: 1 }), ligne({ produitId: 'pig02', quantite: 1 }),
    ] };
    const cat = [
      { id: 'ff319', prixAchat: 1 }, { id: 'snlr11', prixAchat: 1 },
      { id: 'snlrp', prixAchat: 1, variantesCompo: [SNLRP] },
      { id: 'pigkg', prixAchat: 1, variantes: [teinte('dkg')] },
      { id: 'pig02', prixAchat: 1, variantes: [teinte('d02')] },
    ];
    const t = (id: string) => cat.find(p => p.id === id);
    // SNLR+P non déplié : seul le pigment direct (PIGMENT02) est vu.
    expect(dimensionsDesComposants(R, t, { [CLE_COMPO]: 'r' }).flatMap(g => g.dimensions.map(d => d.id))).toEqual(['d02']);
    // Déplié : les deux pigments, regroupés sous « Teinte ».
    const g = dimensionsDesComposants(R, t, { [CLE_COMPO]: 'r', [cleSousCompo('snlrp')]: 'sp' });
    expect(g).toHaveLength(1);
    expect(g[0].nom).toBe('Teinte');
    expect(g[0].dimensions.map(d => d.id).sort()).toEqual(['d02', 'dkg']);
  });

  it('le détail mis à plat redonne le prix de la cascade, et un prix forcé le change', () => {
    const vc = { [CLE_COMPO]: 'k', [cleSousCompo('snlr')]: 's1' };
    const d = detailCompo(KIT, prixArticle, trouver, vc);
    // 319 + base + pigment (SNLR déplié à sa place), quantités multipliées.
    expect(d.map(x => [x.composant.produitId, x.quantite])).toEqual([['319', 1], ['base', 2], ['pig', 2]]);
    expect(prixDetailCompo(d)).toBe(170);
    expect(prixLigneCompo(KIT, prixArticle, trouver, vc)).toBe(170);
    // Pigment forcé à 8 € au lieu de 5 : 100 + 2×30 + 2×8 = 176.
    const vc2 = avecPrixForce(vc, d[2].cle, 8);
    expect(prixForces(vc2)).toEqual({ [d[2].cle]: 8 });
    expect(prixLigneCompo(KIT, prixArticle, trouver, vc2)).toBe(176);
    expect(valeursVisibles(vc2)).toEqual([]);                     // clé interne
    expect(prixLigneCompo(KIT, prixArticle, trouver, avecPrixForce(vc2, d[2].cle, null))).toBe(170);
  });

  it('la composition propre à la ligne : quantité retouchée, composant dupliqué (deux RAL)', () => {
    const vc = { [CLE_COMPO]: 'k', [cleSousCompo('snlr')]: 's1' };
    const plat = aPlat(KIT, prixArticle, trouver, vc);
    expect(plat.map(c => c.produitId)).toEqual(['319', 'base', 'pig']);
    // Le pigment dupliqué en deux teintes, 1 de chaque au lieu de 2 du même.
    const perso = [plat[0], plat[1], { ...plat[2], quantite: 1, teinte: 'RAL 1015' }, { ...plat[2], quantite: 1, teinte: 'RAL 7040' }];
    const vc2 = avecComposants(vc, perso);
    expect(composantsPersonnalises(vc2)).toHaveLength(4);
    expect(prixLigneCompo(KIT, prixArticle, trouver, vc2)).toBe(170);   // 100 + 2×30 + 1×5 + 1×5
    expect(achatVarianteCompo(KIT, produits, vc2)).toBe(100);           // 60 + 2×18 + 2×2
    expect(valeursVisibles(vc2)).toEqual([]);
    // Quantité de SNL retouchée à 3 : 100 + 3×30 + 5 + 5 = 200.
    expect(prixLigneCompo(KIT, prixArticle, trouver, avecComposants(vc, perso.map((c, i) => (i === 1 ? { ...c, quantite: 3 } : c))))).toBe(200);
    // Rétablir : la variante reprend.
    expect(prixLigneCompo(KIT, prixArticle, trouver, avecComposants(vc2, null))).toBe(170);
    expect(composantsPersonnalises(avecComposants(vc2, null))).toBeNull();
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
