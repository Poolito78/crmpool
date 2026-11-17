import { describe, it, expect } from 'vitest';
import { seauxPour, lignesDepuisCalculateur, type EtatCalculateur } from './devisCalculateur';
import type { Produit } from './store';

const art = (reference: string, prixHT: number, poids: number): Produit =>
  ({ id: reference, reference, description: reference, prixHT, prixAchat: 0, prixRevendeur: 0, poids, unite: 'U', tva: 20 }) as unknown as Produit;
const CATALOGUE = [
  art('FLOWFAST319', 392.86, 20), art('FLOWFAST31910', 280, 10), art('PIGMENT2KG', 102.86, 2),
  art('CATALYST2', 112.14, 2), art('SNLR11', 44.29, 11.65), art('SNLR5', 24.79, 5.825),
];
let n = 0;
const id = () => `l${++n}`;

/* 319 Road, jaune 20 %, 178,99 kg de résine, kit SNLR11 choisi (relevé du calculateur). */
const ROAD: EtatCalculateur = {
  resine: '319', mode: 'u', nomResine: '319 Flexible Seal', q: 178.99, pig: 20, pigNom: 'jaune', talc: false,
  pk: 35.8, ck: 2.68, charge: 'SNLR', chargeTag: '319 Road (319r enrobé)', isC: false, isR: true, fk: 208.52,
  total: 426, area: 426, um: true, larg: 10, rate: 1, temp: 20, longueur: 4260,
  kits: [{ code: 'SNLR11', kg: 11.65, n: 18 }],
  sachets: [{ kg: 2, n: 18, libre: false }],
  prep: { resine: 180, pigment: 36, catalyseur: 2.7, charge: 209.7, total: 428.4, kits: 18 },
};

describe('Calculateur Flowfast → devis', () => {
  it('seaux : le moins de surplus, puis le moins de seaux', () => {
    expect(seauxPour(180, [20, 10])).toEqual([{ kg: 20, n: 9 }]);
    expect(seauxPour(25, [20, 10])).toEqual([{ kg: 20, n: 1 }, { kg: 10, n: 1 }]);
    expect(seauxPour(8, [20, 10])).toEqual([{ kg: 10, n: 1 }]);
    expect(seauxPour(0, [20])).toEqual([]);
  });

  it('les quantités suivent les kits retenus', () => {
    const r = lignesDepuisCalculateur(ROAD, CATALOGUE, null, id);
    const q = Object.fromEntries(r.lignes.filter(l => l.produitId).map(l => [l.produitId, l.quantite]));
    expect(q).toEqual({ FLOWFAST319: 9, PIGMENT2KG: 18, CATALYST2: 2, SNLR11: 18 });
    expect(r.lignes[0].type).toBe('texte');
    expect(r.lignes[0].description).toContain('18 × SNLR11');
    expect(r.aVerifier).toEqual([]);
    // sans client : prix public de la fiche
    expect(r.lignes.find(l => l.produitId === 'SNLR11')!.prixUnitaireHT).toBe(44.29);
  });

  it('un article absent du catalogue part à vérifier, jamais deviné', () => {
    const r = lignesDepuisCalculateur({ ...ROAD, kits: [{ code: 'SNLR2', kg: 2.91, n: 3 }] }, CATALOGUE, null, id);
    expect(r.aVerifier).toEqual(['Kit SNLR2 (2,91 kg) × 3']);
    expect(r.lignes.some(l => /SNLR2.*à vérifier/.test(l.description) && !l.produitId)).toBe(true);
  });

  it('sans kit, le besoin fait foi', () => {
    const r = lignesDepuisCalculateur({ ...ROAD, kits: [], prep: null, sachets: [] }, CATALOGUE, null, id);
    expect(r.lignes.find(l => l.produitId === 'CATALYST2')!.quantite).toBe(2); // 2,68 kg → 2 pots
    expect(r.aVerifier).toEqual(['Pigment 20 % : 35,8 kg', 'Charge SNLR : 208,52 kg']);
  });
});
