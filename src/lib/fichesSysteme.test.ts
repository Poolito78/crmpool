import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { noterChemin, ressembleASysteme, normaliserExtraction } from './fichesSysteme';

/* Le dossier Fiches système, tel qu'il est en septembre 2026. */
const CONCRETE = 'Flowfast 319 Concrete/FS_Flowfast-319-Concrete_fr.pdf';
const ROAD = 'FS_Flowfast 319 Road fiche système.pdf';
const BC = 'FS_Flowfast-bc-uni_fr_20220118-1.pdf';
const DEMANDE = 'FLowfast 319 Concrete (319 + SNLC) ligne jaune 0,10 m de largeur x 965ml';

describe('recherche d’une fiche système dans le dossier', () => {
  it('retient la fiche du 319 Concrete avant celle du 319 Road', () => {
    expect(noterChemin(DEMANDE, CONCRETE)).toBeGreaterThan(noterChemin(DEMANDE, ROAD));
  });

  it('ne retient pas une fiche de la gamme qui ne partage que la gamme', () => {
    expect(noterChemin(DEMANDE, BC)).toBe(0);
  });

  it('exige la gamme nommée : « ligne jaune » ne trouve pas une fiche Peran', () => {
    expect(noterChemin(DEMANDE, 'FS_Peran STB.pdf')).toBe(0);
  });

  it('ne compte pas une longueur comme un mot du système', () => {
    expect(noterChemin('Flowcoat ligne 9650 ml', 'FS_Flowcoat SK 9650.pdf')).toBe(0);
  });
});

describe('une ligne parle-t-elle d’un système ?', () => {
  it('oui quand elle nomme une gamme Flowcrete, même sans le mot', () => {
    expect(ressembleASysteme(DEMANDE)).toBe(true);
  });
  it('oui quand elle dit « système »', () => {
    expect(ressembleASysteme('Système Machin 3 mm')).toBe(true);
  });
  it('non pour un panneau', () => {
    expect(ressembleASysteme('B14 limitation de vitesse 30')).toBe(false);
  });
});

describe('lecture d’une fiche par le modèle', () => {
  it('garde les dosages, écarte le vide, ne met jamais zéro à la place d’un inconnu', () => {
    const e = normaliserExtraction({
      nom: 'Système Flowfast 319 Concrete',
      surface_kit_m2: '5',
      composants: [
        { libelle: 'SNL Concrete', role: 'charge', consommation: '0,251', au_kit: true, conditionnement_kg: 1.255 },
        { libelle: 'Catalyseur', role: 'catalyseur', consommation: null },
        { libelle: '' },
      ],
    });
    expect(e?.nom).toBe('Flowfast 319 Concrete');
    expect(e?.surfaceKitM2).toBe(5);
    expect(e?.kitSurfaceMaxM2).toBe(50);
    expect(e?.composants).toHaveLength(2);
    expect(e?.composants[0]).toMatchObject({ consommation: 0.251, auKit: true, conditionnementKg: 1.255 });
    expect(e?.composants[1].consommation).toBeUndefined();
  });

  it('ne rend rien sans nom de système', () => {
    expect(normaliserExtraction({ composants: [] })).toBeNull();
  });
});
