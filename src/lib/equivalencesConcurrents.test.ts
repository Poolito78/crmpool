import { describe, it, expect, vi } from 'vitest';

vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));
vi.mock('./modelesIA', () => ({ appelerGemini: vi.fn(), texteGemini: vi.fn() }));

import { familleConcurrente, indexEquivalences, equivalentsPour, kgDuLibelle, applicateurPour, uniteComparable, ecartPrix } from './equivalencesConcurrents';
import { prixDuTexte, type DocumentAnalysis } from './analyseDocument';
import type { Produit } from './store';

const art = (reference: string, description: string, categorie: string, poids = 0, prixHT = 100): Produit =>
  ({ id: reference, reference, description, categorie, poids, prixHT } as unknown as Produit);

const catalogue = [
  art('PSTTEMPO25P ISO', 'ISOMARK TEMPORAIRE ISOSIGN 25KG (AVEC SACHE)', 'ISOMARK / H1', 25, 312.86),
  art('PSTJAUNE25P ISO', 'ISOMARK JAUNE ISOSIGN 25KG (AVEC SACHE)', 'ISOMARK / H1', 25),
  art('PSTJAUNE5 ISO', 'ISOMARK JAUNE ISOSIGN 5KG', 'ISOMARK / H1', 5),
  art('PSTSANCY25', 'PEINTURE BLANCHE SANCY 25KG (AVEC SACHE)', 'ISOMARK / H1', 25),
  art('EAFEVEREST8 ISO', 'ENDUIT EVEREST ISOSIGN 7.85KG', 'ISOMARK / H1', 7.85),
  art('EAFHIMAL8 ISO', 'ENDUIT HIMALAYA ISOSIGN 7.85KG', 'ISOMARK / H1', 7.85),
  art('ELONYXNEUTRE', 'ENDUIT LIQUIDE ONYX NEUTRE (15KG)', 'ISOMARK / H1', 15),
  art('EAFEMERAUDE20', 'RESINE GRAVILLONNEE ISOSIGN EMERAUDE 20KG (AVEC SACHE)', 'ISOMARK / H1', 20),
  art('DILACETYL22', 'DILUANT ACETYL (BIDON DE 22L/20KG)', 'ISOMARK / H1', 20),
  art('DILACETYL5', 'DILUANT ACETYL (BIDON DE 5L)', 'ISOMARK / H1'),
  art('EACMERCURE20', 'THERMOLIT MERCURE 20KG (PALETTE DE 56 SACS)', 'ISOMARK / H1', 1120),
  art('A13A.700.C1.BTR.IS.BRUT', 'PANNEAU A13A', 'ISOSIGN / PANNEAUX'),
];
const index = indexEquivalences(catalogue);

describe('familleConcurrente (gammes GEVEKO)', () => {
  it.each([
    ['3SRoute™ ECO TEMPO 20.00KG', 'Peinture solvantée'],
    ['3SRoute™ NEVA 25.00KG', 'Peinture solvantée'],
    ['MMARoute™ Enduit Urbain 8.00KG', 'Enduit à froid (MMA bi-composant)'],
    ['MMARoute™ Nordik Kit 8.00KG', 'Enduit à froid (MMA bi-composant)'],
    ['Diluant AC, 25L', 'Diluant'],
    ['PREMARK™ Cédez-le-passage', 'Préfabriqué thermocollé'],
    ['TacPad™ éveil de vigilance', 'Bande podotactile / guidage'],
  ])('%s → %s', (texte, libelle) => {
    expect(familleConcurrente(texte)?.libelle).toBe(libelle);
  });

  it('un produit inconnu n’a pas de famille', () => {
    expect(familleConcurrente('Gant de protection taille 9')).toBeUndefined();
  });
});

describe('equivalentsPour', () => {
  it('Eco Tempo (jaune temporaire) → ISOMARK TEMPORAIRE d’abord', () => {
    const r = equivalentsPour('3SRoute™ ECO TEMPO 20.00KG', index)!;
    expect(r.articles[0].reference).toBe('PSTTEMPO25P ISO');
    expect(r.articles.map(a => a.reference)).not.toContain('EAFEVEREST8 ISO');
  });

  it('Neva (blanche routière) → peinture blanche Sancy', () => {
    expect(equivalentsPour('3SRoute™ NEVA 25.00KG', index)!.articles[0].reference).toBe('PSTSANCY25');
  });

  it('enduit urbain → enduits ISOSIGN, pas la résine gravillonnée', () => {
    const refs = equivalentsPour('MMARoute™ Enduit Urbain 8.00KG', index)!.articles.map(a => a.reference);
    expect(refs[0]).toBe('EAFEVEREST8 ISO');
    expect(refs).toContain('ELONYXNEUTRE');
    expect(refs).not.toContain('EAFEMERAUDE20');
  });

  it('parmi les articles au tarif, le conditionnement le plus proche passe devant', () => {
    const refs = equivalentsPour('3SRoute™ Quasar 5.00KG', index)!.articles.map(a => a.reference);
    expect(refs[0]).toBe('PSTJAUNE5 ISO');
  });

  it('kgDuLibelle lit « 20.00KG » et « 7,85 kg »', () => {
    expect(kgDuLibelle('ECO TEMPO 20.00KG')).toBe(20);
    expect(kgDuLibelle('enduit 7,85 kg')).toBe(7.85);
    expect(kgDuLibelle('Diluant 25L')).toBeUndefined();
  });
});

describe('prixDuTexte (tarif GEVEKO CS ROUTE)', () => {
  const texte = [
    'Désignation Référence Unité Quantité Prix Net',
    '3SRoute™ ECO TEMPO 20.00KG 1000779 Kg 1 9999 4.77 €',
    '3SRoute™ NEVA 25.00KG 1000528 Kg 1 9999 2.85 €',
    'Diluant AC, 25L 1000579 Ltr 1 9999 5.19 €',
    'Article spécial 1 234,50 € la palette ARTSP1',
  ].join('\n');
  const lu = (reference: string, prix: number) => ({ reference, description: '', quantite: 1, prixUnitaireHT: prix });
  const doc = (lignes: ReturnType<typeof lu>[]): DocumentAnalysis => ({ typeDocument: 'devis_concurrent', lignes });

  it('la borne de quantité 9999 n’est pas un prix : le net en euros la remplace', () => {
    const r = prixDuTexte(doc([lu('1000779', 9999), lu('1000528', 9999), lu('1000579', 9999)]), texte);
    expect(r.lignes.map(l => l.prixUnitaireHT)).toEqual([4.77, 2.85, 5.19]);
  });

  it('un prix juste reste tel quel', () => {
    expect(prixDuTexte(doc([lu('1000779', 4.77)]), texte).lignes[0].prixUnitaireHT).toBe(4.77);
  });

  it('les milliers séparés par une espace restent un seul montant', () => {
    expect(prixDuTexte(doc([lu('ARTSP1', 1)]), texte).lignes[0].prixUnitaireHT).toBe(1234.5);
  });

  it('une référence absente du texte garde sa lecture', () => {
    expect(prixDuTexte(doc([lu('999999', 12)]), texte).lignes[0].prixUnitaireHT).toBe(12);
  });
});

describe('applicateurPour (tarif net applicateur ISOMARK du 15/07/2026)', () => {
  it('SANCY : 73,75 € le seau de 25 kg, soit 2,95 €/kg — pas 50 % du public de la fiche', () => {
    const r = applicateurPour(catalogue[3])!; // PSTSANCY25, public fiche 100 €
    expect(r.prixUnite).toBe(2.95);
    expect(r.prixConditionnement).toBe(73.75);
    expect(r.code).toBe('70109');
  });

  it('ISOMARK TEMPORAIRE est hors tarif : aucun prix supposé', () => {
    expect(applicateurPour(catalogue[0])).toBeUndefined();
  });

  it('diluant au litre', () => {
    const r = applicateurPour(catalogue[9])!; // DILACETYL5
    expect(r.unite).toBe('L');
    expect(r.prixUnite).toBe(8.34);
  });

  it('unités du concurrent ramenées à celles du tarif', () => {
    expect(uniteComparable('Kg')).toBe('kg');
    expect(uniteComparable('Ltr')).toBe('L');
    expect(uniteComparable('seau')).toBeUndefined();
  });

  it('écart : NEVA 2,85 €/kg face à SANCY 2,95 €/kg = +4 %', () => {
    expect(Math.round(ecartPrix(2.95, 2.85)! * 100)).toBe(4);
    expect(ecartPrix(2.95, 0)).toBeUndefined();
  });

  it('les articles au tarif passent devant ceux qui n’y sont pas', () => {
    const refs = equivalentsPour('3SRoute™ Quasar 25.00KG', index)!.articles.map(a => a.reference);
    expect(refs.indexOf('PSTSANCY25')).toBeLessThan(refs.indexOf('PSTTEMPO25P ISO'));
  });
});

describe('tarif H2 (préfabriqués, BEV, BAO, pavés)', () => {
  const h2 = [
    art('THERMOCDP500500', 'LIGNES "CEDEZ LE PASSAGE" 500x500 THERMOPLASTIQUE (LOT DE 10)', 'ISOMARK / H2'),
    art('THERMOFLE1600300', 'FLECHES TOUT DROIT 1600x300 THERMOPLASTIQUE (LOT DE 5)', 'ISOMARK / H2'),
    art('THERMOLASER', 'THERMOMETRE LASER (1599562)', 'ISOMARK / FLOORING / ACCESSOIRES'),
    art('BEVGRANITE', 'BEV GRANITE 600x400  BLANCHE', 'ISOMARK / H2'),
    art('GUIDGRIP4BLANC', "GUID'GRIP4 BLANC 1000x215 A COLLER (PAR 15)", 'ISOMARK / H2'),
    art('CLOUBRI100', 'CLOUS INOX ASPECT BRILLANT DIA 100', 'ISOMARK / H2'),
    art('CLOUACIERZB', 'CLOUS PODOTACTILES ACIER ZINGUE BLANC A SCELLER Ø25 (BOITE DE 250)', 'ISOMARK / H2'),
    art('PAVPREF152030', 'm² Pavés préfabriqués à coller 15x20 (<30m²)', 'ISOMARK / H2'),
  ];
  const idx = indexEquivalences(h2);

  it('cédez-le-passage 500 x 500 : 5,95 € l’unité, carton de 10 à 59,50 €', () => {
    const r = applicateurPour(h2[0])!;
    expect([r.prixUnite, r.prixConditionnement, r.unite, r.code]).toEqual([5.95, 59.5, 'u', '73351']);
  });

  it('un PREMARK se compare à nos préfabriqués thermo, jamais au thermomètre laser', () => {
    const refs = equivalentsPour('PREMARK™ Cédez-le-passage 500x500', idx)!.articles.map(a => a.reference);
    expect(refs).toContain('THERMOCDP500500');
    expect(refs).not.toContain('THERMOLASER');
  });

  it('TacPad / BEV → BEV, BAO, clous podotactiles ; pas les clous de chaussée', () => {
    const refs = equivalentsPour('TacPad™ BEV 600x400', idx)!.articles.map(a => a.reference);
    expect(refs).toEqual(expect.arrayContaining(['BEVGRANITE', 'GUIDGRIP4BLANC', 'CLOUACIERZB']));
    expect(refs).not.toContain('CLOUBRI100');
  });

  it('pavés synthétiques au m²', () => {
    expect(familleConcurrente('PaveSmart™ pavés à coller 15x20')?.libelle).toBe('Pavés synthétiques à coller');
    expect(applicateurPour(h2[7])).toMatchObject({ prixUnite: 47.5, unite: 'm²' });
  });

  it('lettres de 250 : les 36 références au même prix', () => {
    expect(applicateurPour(art('THERMO250Q', 'LETTRE Q', 'ISOMARK / H2'))?.prixUnite).toBe(9.3);
    expect(applicateurPour(art('THERMO250C7', 'CHIFFRE 7', 'ISOMARK / H2'))?.prixUnite).toBe(9.3);
  });

  it('unités « U », « pce », « m2 »', () => {
    expect(uniteComparable('U')).toBe('u');
    expect(uniteComparable('pce')).toBe('u');
    expect(uniteComparable('m2')).toBe('m²');
  });
});
