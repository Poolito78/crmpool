import { describe, expect, it } from 'vitest';
import type { Fournisseur } from './store';
import { fournisseurNomme, lireGrilleAffretement, prixAffretement, ressembleTarifTransport, type ItemPDF } from './grilleAffretement';

/* Cellules relevées sur « TARIFS AFFRETEMENT 2026 - ISOSIGN.pdf » (QRM),
   dans l'ordre où pdf.js les rend : les prix d'abord, les libellés après. */
const ligne = (page: number, y: number, valeurs: string[], x0: number) =>
  valeurs.map((str, i) => ({ str, x: x0 + i * 48.7, y, page }));
const palettes = ['1', '2', '3', '4', '5', '6'];
const ITEMS: ItemPDF[] = [
  ...ligne(1, 624, palettes, 261), ...ligne(1, 610, ['222 €', '317 €', '393 €', '458 €', '534 €', '590 €'], 251),
  ...ligne(1, 591, palettes, 261), ...ligne(1, 578, ['168 €', '224 €', '279 €', '318 €', '366 €', '407 €'], 251),
  ...ligne(3, 262, palettes, 261), ...ligne(3, 249, ['173 €', '228 €', '279 €', '341 €', '392 €', '440 €'], 251),
  ...ligne(3, 295, palettes, 261), ...ligne(3, 282, ['197 €', '260 €', '305 €', '375 €', '431 €', '474 €'], 251),
  ...ligne(5, 722, palettes, 261), ...ligne(5, 708, ['188 €', '267 €', '329 €', '381 €', '444 €', '489 €'], 251),
  { str: 'AIN 01', x: 144, y: 624, page: 1 }, { str: 'T3', x: 153, y: 611, page: 1 },
  { str: 'AISNE 02', x: 137, y: 592, page: 1 }, { str: 'T3', x: 153, y: 578, page: 1 },
  { str: 'ADR = +30€ par transport', x: 249, y: 660, page: 1 },
  { str: 'TARIFS HT AFFRETEMENT 2026', x: 175, y: 713, page: 1 },
  { str: 'MAYENNE 53', x: 127, y: 263, page: 3 }, { str: 'TPO', x: 149, y: 249, page: 3 },
  { str: 'HAUTE MARNE 52', x: 75, y: 295, page: 3 }, { str: 'T3', x: 153, y: 282, page: 3 },
  { str: 'DEUX SEVRES79', x: 114, y: 722, page: 5 }, { str: 'T3', x: 153, y: 708, page: 5 },
  { str: 'Page 5-5', x: 487, y: 160, page: 5 },
  { str: "Prix HT, hors ADR, hors SG - en € - au départ d'ALIZAY (27)", x: 103, y: 80, page: 5 },
  { str: '01/07/2026 au 31/12/2026', x: 404, y: 80, page: 5 },
];

describe('lireGrilleAffretement', () => {
  const g = lireGrilleAffretement(ITEMS)!;

  it('lit un prix par département et par nombre de palettes, à la position des cellules', () => {
    expect(g.tarifs.map(t => t.dept)).toEqual(['01', '02', '52', '53', '79']);
    expect(g.tarifs[0]).toEqual({
      dept: '01', nom: 'AIN', service: 'T3',
      paliers: [222, 317, 393, 458, 534, 590].map((prix, i) => ({ palettes: i + 1, prix })),
    });
  });

  it('garde le code service écrit (TPO) et le libellé collé au numéro', () => {
    expect(g.tarifs.find(t => t.dept === '53')?.service).toBe('TPO');
    expect(g.tarifs.find(t => t.dept === '79')?.nom).toBe('DEUX SEVRES');
  });

  it('relève validité, départ et suppléments', () => {
    expect(g.titre).toBe('TARIFS HT AFFRETEMENT 2026');
    expect(g.validite).toBe('01/07/2026 au 31/12/2026');
    expect(g.depart).toBe('ALIZAY (27)');
    expect(g.conditions).toContain('ADR = +30€ par transport');
  });

  it("n'y voit pas de grille sous trois départements", () => {
    expect(lireGrilleAffretement(ITEMS.filter(i => i.page === 1))).toBeNull();
  });
});

describe('prixAffretement', () => {
  const g = lireGrilleAffretement(ITEMS)!;
  it('prend le palier égal ou supérieur, jamais au-delà de la grille', () => {
    expect(prixAffretement(g, '1', 2)).toEqual({ prix: 317, palettes: 2, service: 'T3' });
    expect(prixAffretement(g, '01', 2.5)?.prix).toBe(393);
    expect(prixAffretement(g, '01', 7)).toBeNull();
    expect(prixAffretement(g, '13', 1)).toBeNull();
  });
});

describe('fournisseurNomme', () => {
  const qrm = { id: 'q', nom: 'Yohan Patte', societe: 'QRM' } as Fournisseur;
  const iso = { id: 'i', nom: 'Achats', societe: 'ISOSIGN' } as Fournisseur;
  it('retrouve le fournisseur nommé dans la consigne, en mot entier, jamais ISOSIGN', () => {
    expect(fournisseurNomme([iso, qrm], ['TARIF TRANSPORT QRM'])).toBe(qrm);
    expect(fournisseurNomme([iso, qrm], ['TARIFS AFFRETEMENT 2026 - ISOSIGN.pdf'])).toBeUndefined();
    expect(fournisseurNomme([qrm], ['QRMX'])).toBeUndefined();
  });
});

it('ressembleTarifTransport', () => {
  expect(ressembleTarifTransport('TARIFS AFFRETEMENT 2026 - ISOSIGN.pdf')).toBe(true);
  expect(ressembleTarifTransport('Fiche technique FLOWFAST 107.pdf')).toBe(false);
});
