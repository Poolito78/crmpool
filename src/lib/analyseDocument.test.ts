import { describe, it, expect, vi } from 'vitest';

vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));
vi.mock('./modelesIA', () => ({ appelerGemini: vi.fn(), texteGemini: vi.fn() }));

import { verifierTotaux, nombreLu, sansFauxConseille, redresserMilliers, lignesParPosition, avecKits, type DocumentAnalysis } from './analyseDocument';

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

describe('sansFauxConseille — un brut égal au net n’est pas un prix conseillé', () => {
  it('retire le « Brut ht » de COM’ROAD qui répète le PU', () => {
    const l = sansFauxConseille({ reference: 'IMP/MESURE', description: 'Support Dia 80', quantite: 1,
      prixUnitaireHT: 50, prixConseille: 50, remise: 0 });
    expect(l.prixConseille).toBeUndefined();
    expect(l.remise).toBeUndefined();
  });

  it('garde un vrai prix conseillé remisé (TTS : 1 295 € − 40 % = 777 €)', () => {
    const l = sansFauxConseille({ reference: '0015339', description: 'PPRF', quantite: 1,
      prixUnitaireHT: 777, prixConseille: 1295, remise: 40 });
    expect(l.prixConseille).toBe(1295);
  });
});

describe('redresserMilliers — « 1 160,57 » n’est pas 160,57', () => {
  const TREMCO = `FL107611526
MA107 FLOWFAST CRAMIC-METAL PRIMER 180KG
1 180,57 €
6,56 €
FL101611517
MA101 FLOWFAST 101 STAND PRIMER 180KG
1 160,57 €
6,45 €
FL101611516
MA101 FLOWFAST 101 STAND PRIMER 20 KG
148,08 €`;
  const doc = (prix: number[]): DocumentAnalysis => ({
    typeDocument: 'devis_fournisseur',
    lignes: prix.map(p => ({ reference: '', description: '', quantite: 1, prixUnitaireHT: p })),
  });

  it('rend le millier perdu par la lecture', () => {
    const a = doc([1180.57, 160.57, 148.08]);
    expect(redresserMilliers(a, TREMCO)).toBe(1);
    expect(a.lignes.map(l => l.prixUnitaireHT)).toEqual([1180.57, 1160.57, 148.08]);
  });

  it('laisse un montant qui figure aussi seul dans le texte', () => {
    const a = doc([160.57]);
    expect(redresserMilliers(a, TREMCO + '\nRemise 160,57 €')).toBe(0);
    expect(a.lignes[0].prixUnitaireHT).toBe(160.57);
  });

  it('lit l’espace insécable comme séparateur de milliers', () => {
    const a = doc([160.57]);
    redresserMilliers(a, 'Prix net 1\u202f160,57 €');
    expect(a.lignes[0].prixUnitaireHT).toBe(1160.57);
  });
});

describe('lignesParPosition — le tableau relu ligne par ligne', () => {
  it('remet le code devant sa désignation, malgré l’ordre du PDF', () => {
    const items = [
      { str: '! OPTIQUE KIT', x: 80, y: 500, page: 1 },
      { str: '3,000', x: 400, y: 500, page: 1 },
      { str: '861,00', x: 500, y: 500, page: 1 },
      { str: '0046062', x: 20, y: 501, page: 1 },
      { str: '0055887', x: 20, y: 480, page: 1 },
      { str: 'Optique noire', x: 80, y: 480, page: 1 },
      { str: '9,000', x: 400, y: 480, page: 1 },
    ];
    expect(lignesParPosition(items)).toBe('0046062 ! OPTIQUE KIT 3,000 861,00\n0055887 Optique noire 9,000');
  });

  it('ne mêle pas deux pages à la même hauteur', () => {
    expect(lignesParPosition([
      { str: 'B', x: 0, y: 100, page: 2 },
      { str: 'A', x: 0, y: 100, page: 1 },
    ])).toBe('A\nB');
  });

  it('écarte les cellules vides', () => {
    expect(lignesParPosition([{ str: '  ', x: 0, y: 10, page: 1 }, { str: 'X', x: 5, y: 10, page: 1 }])).toBe('X');
  });
});

describe('avecKits — seul un devis reçu se regroupe', () => {
  const lignes = [
    { reference: 'K', description: '! Kit', quantite: 3, prixUnitaireHT: 861 },
    { reference: 'C', description: 'Composant', quantite: 9 },
  ];

  it('range les composants sous le kit, et le total se contrôle sur les kits', () => {
    const a = avecKits(doc({ lignes, totalHT: 2583 }));
    expect(a.lignes).toHaveLength(1);
    expect(a.lignes[0].composants![0]).toMatchObject({ reference: 'C', quantite: 3 });
    expect(a.totalHT).toBe(2583);
  });

  it('laisse les autres documents tels quels', () => {
    expect(avecKits(doc({ typeDocument: 'commande_client', lignes })).lignes).toHaveLength(2);
  });
});
