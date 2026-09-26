import { describe, it, expect } from 'vitest';
import {
  estPlanKadri, lireEnsemble, lirePlanDirectionnel, lireCotePanneau,
  panneauxAFabriquer, supportsNeufs, bilanPlan, referencePanneau,
  gammeParDefaut, designationPanneau, lignesDuPlan,
} from './planDirectionnel';

/* Extraits de pages telles que pdf.js les rend (`extrairePagesPDF`), espaces
   parasites compris — « D 212200x400 », « Ex istant », « D epose ». Le
   concepteur est remplacé. */
const PIED = `xx Concepteur
Signal 'Projet et Patrimoine' V 9.6.4 © Kadri Signal 2020 3   09/10/2024 16:32:32`;

const PAGE_CAISSON = `Sec on
Dossier   Ensemble
Base des calculs   Produit
Plan avec détails
Echelle : 1/30
Sol Correct (Cat B)
Surface totale 0,55 m²
Hauteur de base 100 mm
LHSM_SIG_DIRECTIONNELLE
DEM-01
Demidoff - Portion 1
DEM1-47
CAISSON CL1
MAT TRAV REHAUSSE   47 av. de Nulle Part
2300
Existant   Pose Depose
D21 2200x250=0.550m²
Blanc 3290
L4 100 106%   (1738)
MAT TRAV MC
Mt : 151 m.daN
Lg : 2.42 m (2.77)
Existant
Coulisseau MB
Mt : 10 m.daN
Lg : 0.85 m
${PIED}`;

const PAGE_ALU = `Plan avec détails
Hauteur de base 100 mm
LHSM_SIG_DIRECTIONNELLE
DEM-01
Harfleur - Ech. Brèque
HARF-07
ALU BT/M (NC) CL1
MAT ANCRE   47 av. de Nulle Part
Existant   Pose   Depose
E43   500x150=0.075m ²
Jaune   3271
Existant Pose   D epose
D 212200x400= 0.880m²
Blanc   3290
Existant   Depose
D21 1600x250=0.400m²
A Supprimer
D21 1900x250=0.475m²
Ex istant
MAT   ANCRE   MD
Mt : 562m .daN
Lg : 2.40   m(3.60)
${PIED}`;

const PAGE_NEUF = `Plan avec détails
Hauteur de base 100 mm
LHSM_SIG_DIRECTIONNELLE
DEM-01
DIAG_GIRATOIRES
HARF-06
ALU BT (Decaux) (NC) CL1
TUBE GALV   47 av. de Nulle Part
Pose
D42b1   4151x2474=10.270m ²
Blanc 3290
Déblai (butée 100%)
TUBE   GALV   MC 80
Mt : 1341   m .daN
Lg : 5.00   m
${PIED}`;

describe('reconnaissance', () => {
  it('reconnaît un plan Kadri, pas un devis', () => {
    expect(estPlanKadri(['page de garde', PAGE_CAISSON])).toBe(true);
    expect(estPlanKadri(['Devis n° 12 — Plan avec détails'])).toBe(false);
  });
});

describe('cote de panneau', () => {
  it('sépare le code de la largeur par la surface', () => {
    expect(lireCotePanneau('D 212200x400= 0.880m²'))
      .toEqual({ code: 'D21', largeur: 2200, hauteur: 400, surface: 0.88 });
    expect(lireCotePanneau('D42b1   4151x2474=10.270m ²'))
      .toMatchObject({ code: 'D42b1', largeur: 4151, hauteur: 2474 });
    expect(lireCotePanneau('E43   500x150=0.075m ²'))
      .toMatchObject({ code: 'E43', largeur: 500 });
    expect(lireCotePanneau('EB_20 900x250=0.225m²')).toMatchObject({ code: 'EB_20', largeur: 900 });
    expect(lireCotePanneau('plaque 1900x250=0.475m²')).toMatchObject({ code: 'plaque', largeur: 1900 });
  });

  it("ne devine pas quand la surface ne tombe juste sur aucune découpe", () => {
    expect(lireCotePanneau('D212200x400=0.123m²')).toBeNull();
    expect(lireCotePanneau('Bleu 3275 781x376')).toBeNull();
  });
});

describe('lecture d\'un ensemble', () => {
  it('lit le cartouche, la classe et les panneaux', () => {
    const e = lireEnsemble(PAGE_CAISSON, 3)!;
    expect(e).toMatchObject({
      ensemble: 'DEM1-47', section: 'Demidoff - Portion 1',
      produit: 'CAISSON CL1', classe: 1, support: 'MAT TRAV REHAUSSE',
    });
    expect(e.panneaux).toEqual([{
      code: 'D21', largeur: 2200, hauteur: 250, surface: 0.55, sort: 'remplace', fond: 'Blanc',
    }]);
  });

  it('lit le sort malgré les espaces parasites', () => {
    const e = lireEnsemble(PAGE_ALU, 43)!;
    expect(e.panneaux.map(p => `${p.code} ${p.largeur} ${p.sort}`)).toEqual([
      'E43 500 remplace', 'D21 2200 remplace', 'D21 1600 depose', 'D21 1900 supprime',
    ]);
    expect(lireEnsemble(PAGE_NEUF, 1)!.panneaux[0].sort).toBe('neuf');
  });

  it('distingue le support neuf de l\'existant', () => {
    expect(lireEnsemble(PAGE_CAISSON, 3)!.supports).toEqual([
      { designation: 'MAT TRAV MC', longueur: 2.42, longueurTotale: 2.77, existant: false },
      { designation: 'Coulisseau MB', longueur: 0.85, longueurTotale: undefined, existant: true },
    ]);
    expect(lireEnsemble(PAGE_ALU, 43)!.supports[0])
      .toMatchObject({ longueur: 2.4, longueurTotale: 3.6, existant: true });
    /* Deux lignes au-dessus : « Déblai », pas « Existant ». */
    expect(lireEnsemble(PAGE_NEUF, 1)!.supports[0])
      .toMatchObject({ designation: 'TUBE GALV MC 80', longueur: 5, existant: false });
  });
});

describe('références', () => {
  it('Lapérouse P50 : flèche en DF50, rectangle en DR50, classe du plan', () => {
    expect(referencePanneau({ code: 'D21', largeur: 1900, hauteur: 250 }, 'laperouse', 1))
      .toEqual({ reference: 'DF50.1900.250.C1.50.IS.BRUT' });
    expect(referencePanneau({ code: 'E43', largeur: 500, hauteur: 150 }, 'laperouse', 1))
      .toEqual({ reference: 'DR50.500.150.C1.50.IS.BRUT' });
  });

  it('Vasco de Gama : la même en dos fermé, option F', () => {
    expect(referencePanneau({ code: 'D43', largeur: 2500, hauteur: 400 }, 'vasco', 2))
      .toEqual({ reference: 'DR50.2500.400.C2.F.50.IS.BRUT' });
  });

  it('Lapérouse par défaut ; Vasco et Urville seulement quand ils sont dits', () => {
    expect(gammeParDefaut('CAISSON (NC) CL1')).toBe('laperouse');
    expect(gammeParDefaut('ALU BT/M CL1')).toBe('laperouse');
    expect(gammeParDefaut('ALU DOS FERMÉ CL1')).toBe('vasco');
    expect(gammeParDefaut('VASCO DE GAMA CL2')).toBe('vasco');
    expect(gammeParDefaut('CAISSON TRAVERSANT CL1')).toBe('urville');
  });

  it("n'invente ni la classe, ni un format, ni une référence Urville", () => {
    const d21 = { code: 'D21', largeur: 1900, hauteur: 250 };
    expect(referencePanneau(d21, 'laperouse', null)).toEqual({ raison: 'classe' });
    expect(referencePanneau(d21, 'urville', 1)).toEqual({ raison: 'urville' });
    expect(referencePanneau({ code: 'D42b', largeur: 3000, hauteur: 2100 }, 'laperouse', 1, () => false))
      .toEqual({ raison: 'hors-grille' });
  });
});

describe('carnet', () => {
  const ensembles = lirePlanDirectionnel(['garde', PAGE_CAISSON, PAGE_ALU, PAGE_NEUF]);

  it('saute la page de garde et numérote les pages', () => {
    expect(ensembles.map(e => e.page)).toEqual([2, 3, 4]);
  });

  it('ne chiffre que ce qui se fabrique, en Lapérouse P50 par défaut', () => {
    const lignes = panneauxAFabriquer(ensembles, {});
    expect(lignes.map(l => `${l.quantite} ${l.code} ${l.largeur}x${l.hauteur} ${l.reference ?? l.raison}`))
      .toEqual([
        '1 D21 2200x250 DF50.2200.250.C1.50.IS.BRUT',
        '1 D21 2200x400 DF50.2200.400.C1.50.IS.BRUT',
        '1 D42b1 4151x2474 DR50.4151.2474.C1.50.IS.BRUT',
        '1 E43 500x150 DR50.500.150.C1.50.IS.BRUT',
      ]);
    expect(designationPanneau(lignes[0]))
      .toBe('Panneau directionnel Lapérouse P50 D21 2200x250 classe 1 — fond blanc');
  });

  it('une gamme choisie à l\'écran donne sa référence', () => {
    const vasco = panneauxAFabriquer(ensembles, { 'ALU BT/M (NC) CL1': 'vasco' });
    expect(vasco.find(l => l.code === 'E43')!.reference).toBe('DR50.500.150.C1.F.50.IS.BRUT');
    const urville = panneauxAFabriquer(ensembles, { 'ALU BT/M (NC) CL1': 'urville' });
    expect(urville.find(l => l.code === 'E43')).toMatchObject({ reference: null, raison: 'urville' });
  });

  it('regroupe deux gammes Kadri qui donnent la même référence', () => {
    const bis = lireEnsemble(PAGE_CAISSON.replace('CAISSON CL1', 'CAISSON (NC) CL1'), 9)!;
    const lignes = panneauxAFabriquer([...ensembles, bis], {});
    const l = lignes.find(x => x.reference === 'DF50.2200.250.C1.50.IS.BRUT')!;
    expect(l.quantite).toBe(2);
    expect(l.produits).toEqual(['CAISSON CL1', 'CAISSON (NC) CL1']);
  });

  it('relève les supports neufs et fait le bilan', () => {
    expect(supportsNeufs(ensembles).map(s => s.designation)).toEqual(['MAT TRAV MC', 'TUBE GALV MC 80']);
    expect(bilanPlan(ensembles)).toMatchObject({
      ensembles: 3,
      panneaux: { neuf: 1, remplace: 3, depose: 1, existant: 0, supprime: 1 },
      supportsNeufs: 2, supportsExistants: 2, sansPanneau: [],
    });
  });
});

describe('lignes de la demande', () => {
  it('panneaux puis supports neufs, chacun avec ce qui reste à vérifier', () => {
    const e = lirePlanDirectionnel([PAGE_CAISSON, PAGE_ALU]);
    const lignes = lignesDuPlan(e, { 'ALU BT/M (NC) CL1': 'urville' });
    expect(lignes.map(l => [l.reference, l.quantite, l.aVerifier, l.recherche])).toEqual([
      ['DF50.2200.250.C1.50.IS.BRUT', 1, null, ''],
      ['', 1, 'Urville absent de la grille — article Odoo à choisir', 'URVILLE 2200 400 C1'],
      ['', 1, 'Urville absent de la grille — article Odoo à choisir', 'URVILLE 500 150 C1'],
      ['', 1, 'support neuf : article de mât à choisir', ''],
    ]);
    expect(lignes[1].description)
      .toBe('Panneau directionnel Urville caisson traversant D21 2200x400 classe 1 — fond blanc');
    expect(lignes[3].description).toBe('MAT TRAV MC — longueur 2,77 m (plan Kadri)');
  });
});
