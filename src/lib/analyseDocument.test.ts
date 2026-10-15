import { describe, it, expect, vi } from 'vitest';

vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));
vi.mock('./modelesIA', () => ({ appelerGemini: vi.fn(), texteGemini: vi.fn() }));

import { verifierTotaux, nombreLu, type DocumentAnalysis } from './analyseDocument';

const doc = (a: Partial<DocumentAnalysis>): DocumentAnalysis =>
  ({ typeDocument: 'devis_fournisseur', lignes: [], ...a });

describe('verifierTotaux', () => {
  /* Devis TTS 73974 : 19 958,50 HT, 23 950,20 TTC. Le modèle rendait
     23 950,20 en HT et un TTC inventé. */
  const lignes = [
    { reference: '0015339', description: 'PPRF BTR A13a', quantite: 1, prixUnitaireHT: 18918 },
    { reference: '0068752', description: 'Majoration 5,5 %', quantite: 1, prixUnitaireHT: 1040.5 },
  ];

  it('un « HT » qui vaut la somme × 1,2 est le TTC', () => {
    const r = verifierTotaux(doc({ lignes, totalHT: 23950.2, totalTTC: 27941.9 }));
    expect(r.totalHT).toBe(19958.5);
    expect(r.totalTTC).toBe(23950.2);
  });

  it('un total juste ne bouge pas', () => {
    const r = verifierTotaux(doc({ lignes, totalHT: 19958.5, totalTTC: 23950.2 }));
    expect(r).toMatchObject({ totalHT: 19958.5, totalTTC: 23950.2 });
  });

  it('des lignes non chiffrées ne corrigent rien', () => {
    const r = verifierTotaux(doc({
      lignes: [...lignes, { reference: '', description: 'x', quantite: 1 }],
      totalHT: 23950.2, totalTTC: 27941.9,
    }));
    expect(r.totalHT).toBe(23950.2);
  });

  it('un TTC plus petit que le HT est inversé', () => {
    const r = verifierTotaux(doc({ totalHT: 120, totalTTC: 100 }));
    expect(r).toMatchObject({ totalHT: 100, totalTTC: 120 });
  });
});

describe('nombreLu', () => {
  it('lit un montant à la française', () => {
    expect(nombreLu('19 958,50')).toBe(19958.5);
    expect(nombreLu(777)).toBe(777);
    expect(nombreLu(null)).toBeUndefined();
    expect(nombreLu('n/a')).toBeUndefined();
  });
});
