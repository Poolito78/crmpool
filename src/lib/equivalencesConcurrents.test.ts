import { describe, it, expect, vi } from 'vitest';

vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));
vi.mock('./modelesIA', () => ({ appelerGemini: vi.fn(), texteGemini: vi.fn() }));

import { familleConcurrente, indexEquivalences, equivalentsPour, kgDuLibelle, applicateurAuKg, ecartPrix } from './equivalencesConcurrents';
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

  it('le conditionnement le plus proche passe devant', () => {
    const refs = equivalentsPour('Diluant AC, 20KG', index)!.articles.map(a => a.reference);
    expect(refs[0]).toBe('DILACETYL22');
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

describe('applicateurAuKg (leur net face à notre applicateur)', () => {
  it('ISOMARK H1 : 50 % sur le public, ramené au kg', () => {
    const r = applicateurAuKg(catalogue[0])!; // 312,86 € public, 25 kg, H1
    expect(r.public).toBeCloseTo(12.51, 2);
    expect(r.prix).toBeCloseTo(6.26, 2);
    expect(r.libelle).toBe('ISOMARK H1');
  });

  it('écart à leur net : 6,26 €/kg contre 4,77 €/kg = +31 %', () => {
    expect(Math.round(ecartPrix(6.26, 4.77)! * 100)).toBe(31);
    expect(ecartPrix(6.26, 0)).toBeUndefined();
  });

  it('sans poids connu, pas de prix au kg', () => {
    expect(applicateurAuKg(catalogue[9])).toBeUndefined(); // DILACETYL5, 5 L sans poids
  });
});
