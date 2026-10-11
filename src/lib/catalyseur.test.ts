import { describe, it, expect } from 'vitest';
import {
  calculerCatalyse, familleResine, pourcentageCatalyse, estCatalyseur, ligneDuTableau, dosageA,
  contenanceCatalyseur, repartirCatalyseur,
} from './catalyseur';
import { CLE_COMPO } from './variantesCompo';
import type { LigneDevis } from './store';

const art = (id: string, reference: string, description: string, poids: number, extra: object = {}) =>
  ({ id, reference, description, poids, ...extra });

const CATALYST2 = art('cat', 'CATALYST2', 'Catalyst (2 kg)', 2);
const F107 = art('107', 'FLOWFAST107', 'FLOWFAST 107 Primer (20 kg)', 20);
const F319 = art('319', 'FLOWFAST319', 'FLOWFAST 319 Flexible Seal Unpigmented (20 kg)', 20);
const F319C = art('319c', 'FLOWFAST319C', 'FLOWFAST 319 Flexible Seal CLear (20 kg)', 20);
const F215KIT = art('215k', 'FLOWFAST21535', 'FLOWFAST 215 Flexible Binder (Kit 35kg 10kg+ SNL 25kg)', 35);
const SNLR = art('snlr', 'SNLR11', 'SNL 319 ROAD (11,65Kg)', 11.65);
const KIT319R = art('319r', 'FLOWFAST319R', 'KIT FLOWFAST 319 ROAD (45,8 kg)', 45.8, {
  typeVariantesCompo: true,
  variantesCompo: [{ id: 'k', nom: '', composants: [
    { description: '', quantite: 1, unite: 'U', prixUnitaireHT: 0, remise: 0, produitId: '319' },
    { description: '', quantite: 2, unite: 'U', prixUnitaireHT: 0, remise: 0, produitId: 'snlr' },
  ] }],
});
const cat = [CATALYST2, F107, F319, F319C, F215KIT, SNLR, KIT319R];
const trouver = (id: string) => cat.find(p => p.id === id);
const ligne = (produitId: string, quantite: number, extra: Partial<LigneDevis> = {}): LigneDevis =>
  ({ id: produitId + quantite, produitId, description: trouver(produitId)?.description ?? '', quantite, unite: 'U', prixUnitaireHT: 0, tva: 20, remise: 0, ...extra });

describe('catalyseur Flowfast', () => {
  it('lit le tableau ISOFLOOR', () => {
    expect(pourcentageCatalyse('107', 20)).toBe(2);
    expect(pourcentageCatalyse('208_319', 15)).toBe(2.3);
    expect(pourcentageCatalyse('319clear', 30)).toBe(0.9);
    expect(pourcentageCatalyse('215', 5)).toBe(4.5);
    expect(pourcentageCatalyse('405', 0)).toBe(10);
  });

  it('entre deux points, le plus prudent (le plus froid) de SA fiche', () => {
    expect(dosageA('107', 18)).toEqual({ pct: 3, point: 15 });     // tableau ISOFLOOR, 7 points
    expect(dosageA('107', 24.9)).toEqual({ pct: 2, point: 20 });
    expect(dosageA('107', 35)).toEqual({ pct: 1, point: 30 });
    expect(dosageA('108', 18)).toEqual({ pct: 4, point: 10 });     // fiche Flowcrete, 4 points
    expect(dosageA('230', 20)).toEqual({ pct: 1.4, point: 20 });
    expect(dosageA('203', 0)).toEqual({ pct: 5, point: 0 });
    expect(dosageA('216', -1)).toBeNull();                         // accélérateur 404 : hors calcul
    expect(ligneDuTableau(-3)).toBeNull();
    expect(ligneDuTableau(undefined)).toBe(20);
  });

  it('les trois conditionnements du catalyseur, et leur contenance', () => {
    const dose = art('d', 'DUR50FT150', 'DURCISSEUR NOVIPER BP50 FT (DOSE DE 150G)', 0.15);
    const euro = art('e', 'DURFLOWFASTEURO', 'DURCISSEUR CATALYST (400G)', 0);
    expect([CATALYST2, dose, euro].map(estCatalyseur)).toEqual([true, true, true]);
    expect(contenanceCatalyseur(CATALYST2)).toBe(2);
    expect(contenanceCatalyseur(dose)).toBe(0.15);
    expect(contenanceCatalyseur(euro)).toBe(0.4);       // poids 0 en base : la désignation fait foi
    expect(familleResine(dose)).toBeNull();             // pas une résine à doser
  });

  it('les sacs d’abord, les doses ensuite', () => {
    const c = [{ id: 'sac', kg: 2 }, { id: '400', kg: 0.4 }, { id: 'dose', kg: 0.15 }];
    expect(repartirCatalyseur(12.42, c)).toEqual({ sac: 6, '400': 1, dose: 1 });   // 12 + 0,4 + 0,15
    expect(repartirCatalyseur(12.42, [c[0], c[2]])).toEqual({ sac: 6, dose: 3 });  // 12 + 0,45
    expect(repartirCatalyseur(12.42, [c[0]])).toEqual({ sac: 7 });                 // seul : il couvre tout
    expect(repartirCatalyseur(1.1, [c[0], c[2]])).toEqual({ sac: 0, dose: 8 });    // 1,2 kg en doses
    // Sacs forcés à 7 à la main : les doses n'ont plus rien à couvrir.
    expect(repartirCatalyseur(12.42, [{ ...c[0], fixe: 7 }, c[2]])).toEqual({ sac: 7, dose: 0 });
  });

  it('les résines des fiches Flowcrete sont reconnues', () => {
    expect(familleResine(art('x', 'FLOWFASTPRIMER108.20', 'FLOWFAST 108 DAMP PRIMER (20KG)', 20))).toBe('108');
    expect(familleResine(art('x', 'FLOWFAST203', 'FLOWFAST 203 HOT BINDER (20KG)', 20))).toBe('203');
    expect(familleResine(art('x', 'FLOWFAST205', 'FLOWFAST 205 STANDARD SEAL (20KG)', 20))).toBe('205');
    expect(familleResine(art('x', 'FLOWFAST230', 'FLOWFAST 230 MENBRANE (20KG)', 0))).toBe('230');
  });

  it('un poids absent ne se devine pas (FLOWFAST230 à 0 kg en base)', () => {
    const m = art('230', 'FLOWFAST230', 'FLOWFAST 230 MENBRANE (20KG)', 0);
    const c = calculerCatalyse([{ id: 'a', produitId: '230', description: m.description, quantite: 2, unite: 'U', prixUnitaireHT: 0, tva: 20, remise: 0 }],
      id => (id === '230' ? m : undefined), 20, 2);
    expect(c.resines).toHaveLength(0);
    expect(c.aVerifier).toEqual([m.description]);
  });

  it('reconnaît les familles, et ne devine pas', () => {
    expect(familleResine(F107)).toBe('107');
    expect(familleResine(F319)).toBe('208_319');
    expect(familleResine(F319C)).toBe('319clear');
    expect(familleResine(art('x', 'FLOWFASTPRIMER107.20', 'FLOWFAST 107 CERAMIC PRIMER (20KG)', 20))).toBe('107');
    expect(familleResine(F215KIT)).toBe('a_verifier');                      // kit : poids ≠ résine
    expect(familleResine(art('x', 'FLOWFAST216', 'FLOWFAST 216 FLEXIBLE BINDER R (20KG)', 20))).toBe('216');
    expect(familleResine(art('x', 'FLOWFASTF1', 'FLOWFAST F1 MORTAR (A 2,2 KG + B 17,8 kG)', 0))).toBe('a_verifier'); // sans fiche
    expect(familleResine(art('x', 'FLOWFASTSNLFILLER', 'SNL Filler (25 kg)', 25))).toBeNull();
    expect(familleResine(art('x', 'DURFLOWFASTEURO', 'DURCISSEUR CATALYST (400G)', 0))).toBeNull();
    expect(familleResine(SNLR)).toBeNull();
    expect(estCatalyseur(CATALYST2)).toBe(true);
  });

  it('20 °C : 2 × 107 (40 kg à 2 %) + 1 × 319 unpig. (20 kg à 1,5 %) = 1,1 kg → 1 sac de 2 kg', () => {
    const c = calculerCatalyse([ligne('107', 2), ligne('319', 1), ligne('cat', 1)], trouver, 20, 2);
    expect(c.kgCatalyseur).toBe(1.1);
    expect(c.quantite).toBe(1);
    expect(c.aVerifier).toEqual([]);
  });

  it('plus froid, plus de catalyseur : 0 °C → 2,4 + 0,8 = 3,2 kg → 2 sacs', () => {
    const c = calculerCatalyse([ligne('107', 2), ligne('319', 1)], trouver, 0, 2);
    expect(c.kgCatalyseur).toBe(3.2);
    expect(c.quantite).toBe(2);
  });

  it('un kit à variante composée compte SA résine, pas son poids (le granulat est écarté)', () => {
    const c = calculerCatalyse([ligne('319r', 3, { variantesChoisies: { [CLE_COMPO]: 'k' } })], trouver, 20, 2);
    expect(c.resines).toHaveLength(1);
    expect(c.resines[0].kg).toBe(60);       // 3 kits × 20 kg de 319, pas 3 × 45,8
    expect(c.kgCatalyseur).toBe(0.9);       // 60 × 1,5 %
  });

  it('un kit sans composition lisible est signalé, pas compté', () => {
    const c = calculerCatalyse([ligne('215k', 2), ligne('319r', 1)], trouver, 20, 2);
    expect(c.kgCatalyseur).toBe(0);
    expect(c.aVerifier.length).toBe(2);
  });
});
