import { describe, it, expect } from 'vitest';
import { lireReponsePlanImage } from './planImage';
import {
  aLireSurImage, avecPanneauxLus, lireEnsemble, panneauxDesAnnotations, surfaceDiscordante,
} from './planDirectionnel';

/* Page 1 du carnet NMP850 : le dessin est une image, le texte ne porte que le cartouche. */
const PAGE_IMAGE = `Plan avec détails
Echelle : 1/30
Sol Correct (Cat B)
Surface totale 0,88 m²
Gabarit : 2 300 mm
Hauteur de base 100 mm
LHSM_SIG_DIRECTIONNELLE
DEM-01
Demidoff - Portion 1
DEM1-48
CAISSON CL1
MAT TRAV UNIFORME   47 av. de LUGO - 94600 Choisy-le-Roi
Ex istant
MAT   TRAV   76Alu
Mt : 260m .daN
Lg : 3.10   m(3.10)
Signal 'Projet et Patrimoine' V 9.6.4 © Kadri Signal 2020 4`;

describe('plan Kadri dessiné en image', () => {
  const e = lireEnsemble(PAGE_IMAGE, 2)!;

  it('la surface du cartouche annonce des panneaux que le texte ne porte pas', () => {
    expect(e.panneaux).toEqual([]);
    expect(e.surfaceTotale).toBe(0.88);
    expect(aLireSurImage(e)).toBe(true);
  });

  it('les annotations recopiées deviennent des panneaux, la surface concorde', () => {
    const lu = avecPanneauxLus(e, [
      { sort: 'Existant Pose Depose', cote: 'D21 1600x250=0.400m²', fond: 'Blanc 3290' },
      { sort: 'Existant Pose Depose', cote: 'D21 1900 x 250 = 0.475 m2', fond: 'Blanc 3290' },
    ]);
    expect(lu.panneaux.map(p => [p.code, p.largeur, p.hauteur, p.sort, p.fond])).toEqual([
      ['D21', 1600, 250, 'remplace', 'Blanc'],
      ['D21', 1900, 250, 'remplace', 'Blanc'],
    ]);
    expect(surfaceDiscordante(lu)).toBe(false);
  });

  it('une cote qui ne tombe pas juste est écartée, et la page signalée', () => {
    const lu = avecPanneauxLus(e, [
      { sort: 'Existant Pose Depose', cote: 'D21 1900x250=0.400m²' },
      { sort: 'Existant Pose Depose', cote: 'D21 1900x250=0.475m²' },
    ]);
    expect(lu.panneaux).toHaveLength(1);
    expect(surfaceDiscordante(lu)).toBe(true);
  });

  it('sans sort recopié, le panneau n’est pas chiffré', () => {
    expect(panneauxDesAnnotations([{ cote: 'D21 2200x250=0.550m²' }])[0].sort).toBe('existant');
    expect(panneauxDesAnnotations([{ sort: 'A Supprimer', cote: 'D21 2200x250=0.550m²' }])[0].sort).toBe('supprime');
  });
});

describe('lireReponsePlanImage', () => {
  it('une liste d’annotations par image, dans l’ordre', () => {
    const r = lireReponsePlanImage('```json\n[{"panneaux":[{"sort":"Pose","cote":"D21 2200x250=0.550m²","fond":"Blanc 3290"}]},{"panneaux":[]}]\n```');
    expect(r).toEqual([[{ sort: 'Pose', cote: 'D21 2200x250=0.550m²', fond: 'Blanc 3290' }], []]);
  });
  it('une réponse illisible ne rend rien', () => {
    expect(lireReponsePlanImage('désolé')).toEqual([]);
  });
});
