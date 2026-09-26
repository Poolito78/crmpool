import { describe, it, expect } from 'vitest';
import {
  estPlanKadri, lireEnsemble, lirePlanDirectionnel, lireCotePanneau,
  panneauxAFabriquer, supportsNeufs, bilanPlan, referencePanneau,
  gammeParDefaut, designationPanneau, lignesDuPlan, estGrandFormat, surfaceTasman, titreEnsemble,
  railsLaperouse, sectionSupport, fixationsEnsemble, bridesPal, codificationPal, referenceSupport,
  ancragesEnsemble, avecMatNeuf, matRemplacable,
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
      { designation: 'MAT TRAV MC', longueur: 2.42, longueurTotale: 2.77, moment: 151, existant: true },
      { designation: 'Coulisseau MB', longueur: 0.85, longueurTotale: undefined, moment: 10, existant: true },
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
        '1 D42b1 4151x2474 D3.4200.2550.C1.ST.IS.BRUT',
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
    /* DEM1-47 : mât rehaussé existant, rien à commander. */
    expect(supportsNeufs(ensembles).map(s => s.designation)).toEqual(['TUBE GALV MC 80']);
    expect(bilanPlan(ensembles)).toMatchObject({
      ensembles: 3,
      panneaux: { neuf: 1, remplace: 3, depose: 1, existant: 0, supprime: 1 },
      supportsNeufs: 1, supportsExistants: 3, sansPanneau: [],
    });
  });
});

describe('lignes de la demande', () => {
  it('panneaux, fixations puis supports neufs, chacun avec ce qui reste à vérifier', () => {
    const e = lirePlanDirectionnel([PAGE_CAISSON, PAGE_ALU]);
    const lignes = lignesDuPlan(e, { 'ALU BT/M (NC) CL1': 'urville' }, undefined, 'reference');
    expect(lignes.map(l => [l.reference, l.quantite, l.aVerifier, l.recherche])).toEqual([
      ['DF50.2200.250.C1.50.IS.BRUT', 1, null, ''],
      ['', 1, 'Urville absent de la grille — article Odoo à choisir', 'URVILLE 2200 400 C1'],
      ['', 1, 'Urville absent de la grille — article Odoo à choisir', 'URVILLE 500 150 C1'],
      /* Urville est traversant : pas de collier pour HARF-07. DEM1-47 garde
         son mât rehaussé existant : colliers sur le coulisseau MB, pas de mât. */
      ['CO76SFP50.BRUT', 2, null, ''],
    ]);
    expect(lignes[1].description)
      .toBe('Panneau directionnel Urville caisson traversant D21 2200x400 classe 1 — fond blanc');
  });

  it('un mât neuf à la demande : MC.89 mono à la longueur hors tout, moment vérifié', () => {
    const e = lirePlanDirectionnel([PAGE_CAISSON]);
    expect(matRemplacable(e[0])).toBe(true);
    const lignes = lignesDuPlan(e, {}, undefined, 'reference', null, ['DEM1-47']);
    expect(lignes.map(l => [l.reference, l.quantite, l.aVerifier])).toEqual([
      ['DF50.2200.250.C1.50.IS.BRUT', 1, null],
      /* Le mono porte seul le panneau : colliers Ø89. */
      ['CO89SFP50.BRUT', 2, null],
      /* MAT TRAV MC + coulisseau MB, 2,77 m hors tout : moment 151 ≤ 500. */
      ['MC.89.2800.IS.BRUT', 1, null],
    ]);
    expect(lignes[2].description)
      .toBe('MAT TRAV MC — longueur 2,77 m (plan Kadri) — mono, sans coulisseau — moment 151 ≤ 500 daN.m');
  });
});

describe('Tasman PAL : les grands formats', () => {
  it('au-delà de 2500 × 1200, Lapérouse ne fabrique plus', () => {
    expect(estGrandFormat({ largeur: 2500, hauteur: 1200 })).toBe(false);
    expect(estGrandFormat({ largeur: 3000, hauteur: 2100 })).toBe(true);
    expect(estGrandFormat({ largeur: 4151, hauteur: 2474 })).toBe(true);
    expect(gammeParDefaut('PAL CL2')).toBe('tasman');
  });

  it('se chiffre au m² fabriqué, lames de 150 entières', () => {
    expect(surfaceTasman({ largeur: 4151, hauteur: 2474 }))
      .toEqual({ largeur: 4200, hauteur: 2550, lames: 9, lames300: 8, lames150: 1, surface: 10.71, horsGamme: false });
    expect(surfaceTasman({ largeur: 3000, hauteur: 2100 }))
      .toEqual({ largeur: 3000, hauteur: 2100, lames: 7, lames300: 7, lames150: 0, surface: 6.3, horsGamme: false });
    /* Au-delà des dimensions d'Odoo : cote du plan, à vérifier. */
    expect(surfaceTasman({ largeur: 9000, hauteur: 2100 }).horsGamme).toBe(true);
  });

  it('part sous la variante Odoo IS D3 du format fabriqué', () => {
    const [l] = lignesDuPlan(lirePlanDirectionnel([PAGE_NEUF]), {});
    expect(l).toMatchObject({
      reference: 'D3.4200.2550.C1.ST.IS.BRUT', quantite: 1, unite: 'u',
      aVerifier: null, recherche: '',
    });
    expect(l.description).toBe('Panneau Tasman PAL D42b1 4151x2474 classe 1 — fond blanc'
      + ' — fabriqué 4200x2550 (8 latte(s) de 300 + 1 de 150), 10,71 m²');
  });

  it('même hors grille, la variante D3 reste : Odoo seul dit si elle existe', () => {
    expect(referencePanneau({ code: 'D42b', largeur: 3000, hauteur: 2100 }, 'tasman', 2, () => false))
      .toEqual({ reference: 'D3.3000.2100.C2.ST.IS.BRUT' });
    /* 2940 → 3000 : la dimension IS D3 supérieure. */
    expect(referencePanneau({ code: 'D42b', largeur: 2940, hauteur: 2000 }, 'tasman', 2))
      .toEqual({ reference: 'D3.3000.2100.C2.ST.IS.BRUT' });
    expect(referencePanneau({ code: 'D42b', largeur: 9000, hauteur: 2000 }, 'tasman', 2))
      .toEqual({ raison: 'hors-grille' });
  });
});

describe('chiffrage par ensemble', () => {
  const e = lirePlanDirectionnel([PAGE_CAISSON, PAGE_ALU, PAGE_NEUF]);

  it("suit l'ordre du plan, chaque ligne sous son ensemble", () => {
    const lignes = lignesDuPlan(e, {});
    expect(lignes.map(l => `${l.ensemble?.nom} ${l.reference || l.description.slice(0, 22)}`)).toEqual([
      'DEM1-47 DF50.2200.250.C1.50.IS.BRUT',
      'DEM1-47 CO76SFP50.BRUT',
      'HARF-07 DF50.2200.400.C1.50.IS.BRUT',
      'HARF-07 DR50.500.150.C1.50.IS.BRUT',
      'HARF-07 CO114SFP50.BRUT',
      'HARF-06 D3.4200.2550.C1.ST.IS.BRUT',
      'HARF-06 BR.PAL.H10X60.BRUT',
      'HARF-06 SG80802.5000.IS.BRUT',
    ]);
    expect(titreEnsemble(lignes[0].ensemble!)).toBe('Ensemble 0001/DEM1-47');
    expect(titreEnsemble(lignes[7].ensemble!)).toBe('Ensemble 0003/HARF-06');
  });

  it('par référence, les quantités se cumulent et il n\'y a plus d\'ensemble', () => {
    const lignes = lignesDuPlan(e, {}, undefined, 'reference');
    expect(lignes.every(l => !l.ensemble)).toBe(true);
    expect(lignes.length).toBe(8);
  });
});

describe('fixations des panneaux P50', () => {
  it('les rails se lisent dans la table Lapérouse, jamais devinés', () => {
    expect([150, 250, 600, 750, 900, 1200].map(railsLaperouse)).toEqual([2, 2, 2, 3, 3, 4]);
    expect(railsLaperouse(175)).toBeNull();
    expect(railsLaperouse(1000)).toBeNull();
  });

  it('la section du support se lit dans sa désignation Kadri', () => {
    expect(sectionSupport('MAT TRAV MC')).toEqual({ rond: 89 });
    expect(sectionSupport('MAT ANCRE MD')).toEqual({ rond: 114 });
    expect(sectionSupport('MAT TRAV MF')).toEqual({ rond: 140 });
    expect(sectionSupport('Coulisseau MCrenf')).toEqual({ rond: 89 });
    expect(sectionSupport('MAT ANCRE MC_g')).toEqual({ rond: 89 });
    expect(sectionSupport('MAT TRAV 114E')).toEqual({ rond: 114 });
    expect(sectionSupport('MAT TRAV 76Alu')).toEqual({ rond: 76 });
    expect(sectionSupport('TUBE GALV 40x27')).toEqual({ carre: [40, 27] });
    expect(sectionSupport('TUBE GALV MC 80')).toEqual({ carre: [80, 80] });
    expect(sectionSupport('CANDELABRE')).toBeNull();
  });

  it('une fixation par rail et par support, du diamètre de la section', () => {
    /* Le cas du devis Odoo AF035742 : 2 panneaux de 250 et 300 sur un
       MC.89 → 4 CO89SFP50. */
    const e = lireEnsemble(`Plan avec détails
Hauteur de base 100 mm
D
D
S
TZ_001
CAISSON CL2
MAT ANCRE
Pose
D43 1300x250=0.325m²
Blanc 3290
Pose
D43 1300x300=0.390m²
Blanc 3290
MAT ANCRE MC
Mt : 200 m.daN
Lg : 3.10 m
${PIED}`, 1)!;
    expect(fixationsEnsemble(e, {})).toEqual({
      reference: 'CO89SFP50.BRUT', quantite: 4, aVerifier: null,
      description: 'Collier Ø89 simple face P50 — 1 par rail : 4 rail(s) × 1 support(s) (MAT ANCRE MC)',
    });
  });

  it("sur un coulisseau, c'est sa section qui compte — sauf sous un mât neuf", () => {
    const e = lireEnsemble(PAGE_CAISSON, 3)!;
    expect(fixationsEnsemble(e, {})).toMatchObject({ reference: 'CO76SFP50.BRUT', quantite: 2 });
    /* Mât neuf à la demande : MC.89 mono, colliers en Ø89. */
    expect(fixationsEnsemble(avecMatNeuf(e), {})).toMatchObject({ reference: 'CO89SFP50.BRUT', quantite: 2 });
  });

  it('une section illisible ou une hauteur hors table reste à vérifier', () => {
    const tube = lireEnsemble(PAGE_CAISSON.replace('MAT TRAV MC', 'CANDELABRE')
      .replace('Existant\nCoulisseau MB\nMt : 10 m.daN\nLg : 0.85 m\n', ''), 3)!;
    expect(fixationsEnsemble(tube, {})).toMatchObject({ reference: null });
    const vasco = fixationsEnsemble(lireEnsemble(PAGE_CAISSON, 3)!, { 'CAISSON CL1': 'vasco' });
    expect(vasco).toMatchObject({ reference: 'CO76SFP50.BRUT' });
    expect(fixationsEnsemble(lireEnsemble(PAGE_CAISSON, 3)!, { 'CAISSON CL1': 'urville' })).toBeNull();
  });
});

describe('section malgré les espaces de pdf.js', () => {
  it('lit « Coulisseau M Crenf » et « M AT ANCRE M C »', () => {
    expect(sectionSupport('Coulisseau M Crenf')).toEqual({ rond: 89 });
    expect(sectionSupport('M AT ANCRE M C')).toEqual({ rond: 89 });
    expect(sectionSupport('M AT TRAV 160G')).toEqual({ rond: 160 });
  });
});

describe('brides PAL des panneaux Tasman', () => {
  it('lattes × supports + 2 + 4 par ml de hauteur', () => {
    /* D42b1 4151x2474 → 2550 = 8 × 300 + 1 × 150, 9 lattes, sur l'unique
       TUBE GALV de l'extrait : 9 × 1 + 2 + round(4 × 2,55) = 11 + 10 = 21. */
    expect(bridesPal(lireEnsemble(PAGE_NEUF, 1)!, {})).toEqual({
      reference: 'BR.PAL.H10X60.BRUT', quantite: 21, aVerifier: null,
      description: 'Bride PAL H10x60 — 9 lattes × 1 + 2 + 10',
    });
  });

  it("l'exemple du chargé d'affaires : 2100 sur 2 supports → 24", () => {
    const deux = PAGE_NEUF.replace('D42b1   4151x2474=10.270m ²', 'D42b 3000x2100=6.300m²')
      .replace('Lg : 5.00   m', 'Lg : 5.00   m\nDéblai (butée 100%)\nTUBE GALV MC 80\nMt : 1341 m.daN\nLg : 5.00 m');
    expect(bridesPal(lireEnsemble(deux, 1)!, {})).toMatchObject({ quantite: 24 });
    /* 1950 de haut : 6 × 300 + 1 × 150 = 7 lattes → 14 + 2 + 8 = 24,
       comme le devis AF036471. */
    const bas = deux.replace('D42b 3000x2100=6.300m²', 'D42b 3100x1950=6.045m²');
    expect(bridesPal(lireEnsemble(bas, 1)!, {})).toMatchObject({ quantite: 24 });
  });

  it('sans support lu, le compte reste à vérifier', () => {
    const e = lireEnsemble(PAGE_NEUF.replace(/Déblai[\s\S]*Lg : 5\.00 {3}m\n/, ''), 1)!;
    expect(e.supports).toEqual([]);
    expect(bridesPal(e, {})).toMatchObject({ reference: null });
  });

  it('bi-section : la plus petite section porte les panneaux', () => {
    const e = lireEnsemble(PAGE_CAISSON, 3)!;
    /* MAT TRAV MC (Ø89) + Coulisseau MB (Ø76) → Ø76, un seul support. */
    expect(fixationsEnsemble(e, {})).toMatchObject({ reference: 'CO76SFP50.BRUT', quantite: 2 });
  });
});

describe('classe imposée et prix PAL', () => {
  const e = lirePlanDirectionnel([PAGE_CAISSON, PAGE_NEUF]);

  it('une classe imposée remplace celle du plan, références comprises', () => {
    const lignes = lignesDuPlan(e, {}, undefined, 'reference', 2);
    expect(lignes.map(l => l.reference).filter(r => /^(DF|DR|D3)/.test(r))).toEqual([
      'DF50.2200.250.C2.50.IS.BRUT', 'D3.4200.2550.C2.ST.IS.BRUT',
    ]);
    expect(lignesDuPlan(e, {}, undefined, 'reference')[0].reference).toBe('DF50.2200.250.C1.50.IS.BRUT');
  });

  it('un Tasman porte sa surface et sa classe, pour le taux PAL au m² du contrat', () => {
    const t = lignesDuPlan(e, {}, undefined, 'reference', 2).find(l => l.tasman);
    expect(t?.tasman).toEqual({ surface: 10.71, classe: 2 });
    expect(codificationPal(2)).toBe('PMSD.C2');
    expect(codificationPal(null)).toBeNull();
  });
});

describe('supports neufs', () => {
  it('TUBE GALV MC 80 de 5 m : SG80802.5000, la ligne 5651 des contrats cadres', () => {
    expect(referenceSupport({ designation: 'TUBE   GALV   MC 80', longueur: 5, rehausse: false }))
      .toEqual({ reference: 'SG80802.5000.IS.BRUT' });
  });

  it('un mât droit prend sa famille, longueur hors tout aux 100 mm supérieurs', () => {
    expect(referenceSupport({ designation: 'MAT ANCRE MC', longueur: 2.4, longueurTotale: 3.06, rehausse: false }))
      .toEqual({ reference: 'MC.89.3100.IS.BRUT' });
    expect(referenceSupport({ designation: 'MAT TRAV MF', longueur: 4.2, rehausse: false }))
      .toEqual({ reference: 'MF.140.4200.IS.BRUT' });
  });

  it('rehaussé : le mono de son type à la longueur hors tout, si le moment tient', () => {
    expect(referenceSupport({ designation: 'MAT TRAV MC', longueur: 2.42, longueurTotale: 2.77, rehausse: true, moment: 151 }))
      .toEqual({ reference: 'MC.89.2800.IS.BRUT' });
    expect(referenceSupport({ designation: 'MAT TRAV MC', longueur: 2.42, longueurTotale: 2.77, rehausse: true, moment: 620 }))
      .toEqual({ raison: "moment 620 daN.m au-delà des 500 admissibles d'un MC : mât plus fort à choisir" });
  });

  it('sans correspondance ou hors grille : à choisir', () => {
    expect(referenceSupport({ designation: 'CANDELABRE', longueur: 4, rehausse: false }))
      .toMatchObject({ raison: expect.any(String) });
    expect(referenceSupport({ designation: 'TUBE GALV MC 80', longueur: 6, rehausse: false }, () => false))
      .toEqual({ raison: 'SG80802.6000.IS.BRUT absent de la grille' });
  });

  it('le tube 80×80 reçoit des brides 80×80', () => {
    const e = lireEnsemble(PAGE_CAISSON.replace('CAISSON CL1\nMAT TRAV REHAUSSE', 'CAISSON CL1\nTUBE GALV')
      .replace('MAT TRAV MC', 'TUBE GALV MC 80').replace(/Existant\nCoulisseau MB\nMt : 10 m\.daN\nLg : 0\.85 m\n/, ''), 3)!;
    expect(fixationsEnsemble(e, {})).toMatchObject({ reference: 'BR8080SFP50.BRUT', quantite: 2 });
  });
});

describe('ancrage des mâts neufs sur embase', () => {
  it('embase, tiges et gabarit au diamètre du mât, pas du coulisseau', () => {
    const e = lireEnsemble(PAGE_CAISSON.replace(PIED, `Socle d'ancrage avec embase\n${PIED}`), 3)!;
    expect(e.embase).toBe(true);
    /* Mât rehaussé existant : rien. Mât neuf à la demande : Ø89, pas Ø76. */
    expect(ancragesEnsemble(e)).toEqual([]);
    expect(ancragesEnsemble(avecMatNeuf(e)).map(a => a.reference)).toEqual(['EMBASE.89', 'TIGE.89.M22.500', 'SFGAB60.140']);
  });

  it('rien sans « avec embase », ni pour un mât existant', () => {
    expect(ancragesEnsemble(lireEnsemble(PAGE_CAISSON, 3)!)).toEqual([]);
    expect(ancragesEnsemble(lireEnsemble(PAGE_NEUF, 1)!)).toEqual([]);
    expect(ancragesEnsemble(lireEnsemble(PAGE_ALU, 43)!)).toEqual([]);
  });

  it('lit « avec em base » coupé par pdf.js', () => {
    const e = lireEnsemble(PAGE_CAISSON.replace(PIED, `Socle d'ancrage avec em base\n${PIED}`), 3)!;
    expect(e.embase).toBe(true);
  });
});
