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
    expect(r.lignes[0].description).toContain('18 sachets SNLR11');
    expect(r.aVerifier).toEqual([]);
    // sans client : prix public de la fiche
    expect(r.lignes.find(l => l.produitId === 'SNLR11')!.prixUnitaireHT).toBe(44.29);
  });

  it('résine 319 en seaux de 20 kg seulement, même si le 10 kg est au catalogue', () => {
    const r = lignesDepuisCalculateur({ ...ROAD, prep: { ...ROAD.prep!, resine: 25 } }, CATALOGUE, null, id);
    expect(r.lignes.filter(l => /^FLOWFAST319/.test(l.produitId || '')).map(l => [l.produitId, l.quantite]))
      .toEqual([['FLOWFAST319', 2]]);
  });

  it('note récap : nombre de kits et détail d\'un kit (un seau de 20 kg)', () => {
    const r = lignesDepuisCalculateur(ROAD, CATALOGUE, null, id);
    const note = r.lignes[1];
    expect(note.type).toBe('texte');
    expect(note.description.split('\n')).toEqual([
      'Récapitulatif : 9 kits — 1 kit = 1 seau de résine de 20 kg (180 kg de résine nécessaires).',
      "Détail d'un kit :",
      '• Résine 319 Flexible Seal : 20 kg (1 seau)',
      '• Pigment jaune 20 % : 4 kg à rajouter par seau (2 sachets de 2 kg)',
      '• Catalyst C2 : 300 g par seau à 20 °C (à prélever sur un seau de 2 kg)',
      '• Charge SNLR : 23,3 kg (2 sachets SNLR11)',
      "Mélange d'un kit : 47,6 kg, soit 47,6 m² à 1 kg/m² (476 ml en bande de 10 cm).",
    ]);
    // 178 kg de résine : le 9e seau n'est pas entier
    const r2 = lignesDepuisCalculateur({ ...ROAD, prep: { ...ROAD.prep!, resine: 178 } }, CATALOGUE, null, id);
    expect(r2.lignes[1].description).toContain("Le dernier seau n'est utilisé qu'à 18 kg.");
  });

  it('un article absent du catalogue part à vérifier, jamais deviné', () => {
    const r = lignesDepuisCalculateur({ ...ROAD, kits: [{ code: 'SNLR2', kg: 2.91, n: 3 }] }, CATALOGUE, null, id);
    expect(r.aVerifier).toEqual(['3 sachets SNLR2 (2,91 kg)']);
    expect(r.lignes.some(l => /SNLR2.*à vérifier/.test(l.description) && !l.produitId)).toBe(true);
  });

  it('sans kit, le besoin fait foi', () => {
    const r = lignesDepuisCalculateur({ ...ROAD, kits: [], prep: null, sachets: [] }, CATALOGUE, null, id);
    expect(r.lignes.find(l => l.produitId === 'CATALYST2')!.quantite).toBe(2); // 2,68 kg → 2 pots
    expect(r.aVerifier).toEqual(['Pigment 20 % : 35,8 kg', 'Charge SNLR : 208,52 kg']);
  });

  it('catalyst : pot de 2 kg par défaut, sachets de 80 / 150 g sans article', () => {
    const pot = lignesDepuisCalculateur({ ...ROAD, catW: 2000 }, CATALOGUE, null, id);
    expect(pot.lignes.find(l => l.produitId === 'CATALYST2')!.quantite).toBe(2);
    const sachets = lignesDepuisCalculateur({ ...ROAD, catW: 150 }, CATALOGUE, null, id);
    expect(sachets.lignes.some(l => l.produitId === 'CATALYST2')).toBe(false);
    expect(sachets.aVerifier).toEqual(['Catalyst C2 en sachet de 150 g × 18 (2,7 kg)']);
  });
});
