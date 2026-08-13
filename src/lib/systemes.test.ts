import { describe, it, expect } from 'vitest';
import { declinerSysteme, type Systeme, type SystemeComposant } from './systemes';

function composant(p: Partial<SystemeComposant>): SystemeComposant {
  return {
    id: p.libelle || 'c', systemeId: 's', ordre: 0, libelle: 'x',
    role: 'base', obligatoire: true, ...p,
  } as SystemeComposant;
}

/* ALPES sous l'homologation 1 RH 1216 S1, telle que la donne la fiche :
   440 g/m² de peinture et 345 g/m² de billes MB1 A2 TP7. */
const ALPES: Systeme = {
  id: 's1', nom: 'ALPES', variante: '1 RH 1216 S1', support: 'tous', actif: true,
  composants: [
    composant({ id: 'p', libelle: 'ALPES', role: 'base', consommation: 0.44 }),
    composant({ id: 'b', libelle: 'MB1 A2 TP7', role: 'billes', consommation: 0.345 }),
  ],
};

/* Flowfast 319 : la charge vaut 1,5 fois la résine, le pigment 10 %, et le
   catalyseur se dose à la température du support. */
const FLOWFAST: Systeme = {
  id: 's2', nom: 'Flowfast 319 Route', support: 'tous', actif: true,
  composants: [
    composant({ id: 'r', libelle: 'Flowfast 319', role: 'base', consommation: 1.0 }),
    composant({ id: 'c', libelle: 'Charge SNL Filler', role: 'charge', ratioBase: 1.5 }),
    composant({ id: 'g', libelle: 'Pigment', role: 'pigment', pourcentage: 10 }),
    composant({
      id: 'k', libelle: 'Catalyseur BP50 C2', role: 'catalyseur',
      dosageTemperature: [
        { de: 30, a: 99, pourcentage: 1.0 },
        { de: 20, a: 30, pourcentage: 1.5 },
        { de: 10, a: 20, pourcentage: 3.0 },
      ],
    }),
    composant({
      id: 'pr', libelle: 'Primaire Flowfast 101', role: 'primaire',
      consommation: 0.4, obligatoire: false, condition: 'support béton',
    }),
  ],
};

describe('déclinaison d’un système sur une surface', () => {
  it('applique chaque dosage à la surface', () => {
    const l = declinerSysteme(ALPES, 200);
    expect(l).toHaveLength(2);
    expect(l[0].quantiteKg).toBeCloseTo(88);    // 0,44 × 200
    expect(l[1].quantiteKg).toBeCloseTo(69);    // 0,345 × 200
  });

  it('convertit en contenants entiers — on n’achète pas un demi-seau', () => {
    // 88 kg de peinture en seaux de 25 kg → 4 seaux, pas 3,52.
    const l = declinerSysteme(ALPES, 200, { poidsParProduit: () => 25 });
    expect(l[0].contenants).toBe(4);
  });

  it('calcule la charge et le pigment à partir de la base', () => {
    const l = declinerSysteme(FLOWFAST, 100, { temperatureSupport: 25 });
    const par = (id: string) => l.find(x => x.composant.id === id)!;
    expect(par('r').quantiteKg).toBeCloseTo(100);   // 1 kg/m² × 100
    expect(par('c').quantiteKg).toBeCloseTo(150);   // 1,5 × 100
    expect(par('g').quantiteKg).toBeCloseTo(10);    // 10 % de 100
  });

  it('dose le catalyseur selon la température du support', () => {
    const a25 = declinerSysteme(FLOWFAST, 100, { temperatureSupport: 25 })
      .find(x => x.composant.id === 'k')!;
    const a15 = declinerSysteme(FLOWFAST, 100, { temperatureSupport: 15 })
      .find(x => x.composant.id === 'k')!;
    expect(a25.quantiteKg).toBeCloseTo(1.5);        // 1,5 % à 25 °C
    expect(a15.quantiteKg).toBeCloseTo(3.0);        // 3 % à 15 °C
  });

  it("ne dose pas le catalyseur quand la température manque, et le dit", () => {
    // Choisir un palier au hasard reviendrait a livrer trop ou trop peu de
    // catalyseur : le produit ne prendrait pas, ou prendrait trop vite.
    const k = declinerSysteme(FLOWFAST, 100)
      .find(x => x.composant.id === 'k')!;
    expect(k.quantiteKg).toBe(0);
    expect(k.explication).toMatch(/température/);
  });

  it('écarte les composants conditionnels non retenus', () => {
    const sans = declinerSysteme(FLOWFAST, 100, { temperatureSupport: 25 });
    expect(sans.find(x => x.composant.id === 'pr')).toBeUndefined();

    const avec = declinerSysteme(FLOWFAST, 100, {
      temperatureSupport: 25,
      conditionnelsRetenus: new Set(['pr']),
    });
    expect(avec.find(x => x.composant.id === 'pr')!.quantiteKg).toBeCloseTo(40);
  });

  it('ne renvoie rien sans surface', () => {
    expect(declinerSysteme(ALPES, 0)).toEqual([]);
  });
});
