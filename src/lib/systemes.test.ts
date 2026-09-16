import { describe, it, expect } from 'vitest';
import { declinerSysteme, kitsPour, chiffrerZones, type Systeme, type SystemeComposant } from './systemes';

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

/* Flowfast 319 Concrete, fiche du dossier « Fiches système » : kits de 5 m²
   (2,5 kg de 319, 1,255 kg de SNL Concrete, 0,2 kg de pigments), petits
   mélanges jusqu'à 50 m² — et toujours pour une bande. */
const CONCRETE: Systeme = {
  id: 's3', nom: 'Flowfast 319 Concrete', support: 'tous', actif: true,
  surfaceKitM2: 5, kitSurfaceMaxM2: 50,
  composants: [
    composant({ id: 'pr', libelle: 'Primaire Flowfast 107', role: 'primaire', consommation: 0.5, produitId: 'p107' }),
    composant({ id: 'r', libelle: 'Flowfast 319 Unpigmented', role: 'couche teintée - liant', consommation: 0.5, auKit: true, produitId: 'p319' }),
    composant({ id: 'c', libelle: 'SNL Concrete', role: 'couche teintée - charge', consommation: 0.251, auKit: true, conditionnementKg: 1.255 }),
    composant({ id: 'g', libelle: 'Pigments', role: 'couche teintée - pigment', consommation: 0.04, auKit: true, conditionnementKg: 0.2 }),
  ],
};
const poids = (id?: string) => (id === 'p107' || id === 'p319' ? 20 : undefined);

describe('petits mélanges', () => {
  it('une bande jaune de 965 ml × 0,10 m se prépare en 20 kits', () => {
    const l = declinerSysteme(CONCRETE, 96.5, { bande: true, poidsParProduit: poids });
    const par = (id: string) => l.find(x => x.composant.id === id)!;
    expect(kitsPour(CONCRETE, 96.5, true)).toBe(20);
    expect(par('r').quantiteKg).toBeCloseTo(50);     // 20 × 2,5 kg
    expect(par('r').contenants).toBe(3);             // en seaux de 20 kg
    expect(par('c').contenants).toBe(20);            // un sac de 1,255 kg par kit
    expect(par('g').contenants).toBe(20);            // un sachet de 0,2 kg par kit
    expect(par('pr').quantiteKg).toBeCloseTo(48.25); // le primaire reste au m²
  });

  it('une surface pleine au-delà de 50 m² revient au kilo', () => {
    expect(kitsPour(CONCRETE, 96.5)).toBeUndefined();
    const l = declinerSysteme(CONCRETE, 96.5, { poidsParProduit: poids });
    expect(l.find(x => x.composant.id === 'r')!.quantiteKg).toBeCloseTo(48.25);
  });

  it('50 m² tout rond font 10 kits, pas 11', () => {
    expect(kitsPour(CONCRETE, 50)).toBe(10);
    const l = declinerSysteme(CONCRETE, 50);
    expect(l.find(x => x.composant.id === 'c')!.contenants).toBe(10);
  });
});

/* Le devis AF037640, tel que la fiche le chiffre : quatre zones d'un même
   Flowfast 319 Concrete, le jaune avec son pigment propre. */
describe('un système, plusieurs zones', () => {
  const AVEC_JAUNE: Systeme = {
    ...CONCRETE,
    composants: [
      ...CONCRETE.composants,
      composant({
        id: 'j', libelle: 'Pigment de teinte complémentaire (jaune)', role: 'couche teintée - pigment jaune',
        consommation: 0.1, auKit: true, obligatoire: false, produitId: 'p-jaune', ordre: 1,
      }),
    ],
  };
  const poidsZ = (id?: string) => (id === 'p107' || id === 'p319' ? 20 : id === 'p-jaune' ? 0.5 : undefined);
  const zones = [
    { id: 'z1', libelle: 'Ligne jaune', surfaceM2: 96.5, bande: true, couleur: 'jaune' },
    { id: 'z2', libelle: 'Ligne blanche', surfaceM2: 48.5, bande: true, couleur: 'blanc' },
    { id: 'z3', libelle: 'Ligne verte', surfaceM2: 5, bande: true, couleur: 'vert' },
    { id: 'z4', libelle: 'Flèches bleues', surfaceM2: 67.2, bande: false, couleur: 'bleu' },
  ];
  const l = chiffrerZones(AVEC_JAUNE, zones, { poidsParProduit: poidsZ });
  const par = (cle: string) => l.find(x => x.cle === cle)!;

  it('additionne la résine avant de la mettre en seaux', () => {
    // 20 + 10 + 1 kits en bande, puis 67,2 m² au kilo : 77,5 + 33,6 kg
    expect(par('r').quantiteKg).toBeCloseTo(111.1);
    expect(par('r').contenants).toBe(6);
  });

  it('compte le SNL Concrete en sacs de 1,255 kg', () => {
    expect(par('c').contenants).toBe(Math.ceil((31 * 1.255 + 67.2 * 0.251) / 1.255 - 1e-9));
  });

  it('dose le primaire sur la surface totale', () => {
    expect(par('pr').quantiteKg).toBeCloseTo(0.5 * 217.2);
  });

  it('donne à chaque teinte son pigment, le jaune le sien', () => {
    expect(par('j:z1').contenants).toBe(20);         // 20 kits × 0,5 kg
    expect(l.find(x => x.cle === 'g:z1')).toBeUndefined();
    expect(par('g:z2').contenants).toBe(10);
    expect(par('g:z3').contenants).toBe(1);
    expect(par('g:z2').libelle).toBe('Pigments — blanc');
    expect(l.find(x => x.cle === 'j:z2')).toBeUndefined();
  });
});
