import { describe, expect, it } from 'vitest';
import { destinationDuDevis, portReelParFournisseur } from './portReel';
import { normaliserDept, fusionnerPaliers } from './transportFournisseur';
import { departementDeCodePostal, palettesDesLignes, portFournisseur } from './store';
import type { Fournisseur, LigneDevis, Produit, ProduitFournisseur } from './store';

const four = (id: string, o: Partial<Fournisseur> = {}) =>
  ({ id, nom: id, societe: id, francoPort: 0, coutTransport: 0, ...o }) as Fournisseur;
const prod = (id: string, poids: number) => ({ id, poids }) as Produit;
const pf = (produitId: string, fournisseurId: string, o: Partial<ProduitFournisseur> = {}) =>
  ({ id: `${produitId}-${fournisseurId}`, produitId, fournisseurId, estPrioritaire: false, ...o }) as ProduitFournisseur;
const ligne = (id: string, produitId: string | undefined, quantite: number, type?: LigneDevis['type']) =>
  ({ id, produitId, quantite, type }) as LigneDevis;

const produits = [prod('a', 20), prod('b', 25)];
const base = (over: object) => ({
  produitParId: (id: string) => produits.find(p => p.id === id),
  achatDeLigne: (l: LigneDevis) => l.quantite * 100,
  choix: {},
  ...over,
}) as Parameters<typeof portReelParFournisseur>[0];

describe('portReelParFournisseur', () => {
  it('un port par fournisseur, lu sur le total de ses lignes', () => {
    const r = portReelParFournisseur(base({
      lignes: [ligne('1', 'a', 2), ligne('2', 'b', 4)],
      produitFournisseurs: [pf('a', 'F1'), pf('b', 'F1')],
      fournisseurs: [four('F1', { paliersPortPoids: [{ poidsMin: 100, coutTransport: 38 }, { poidsMin: 0, coutTransport: 20 }] })],
    }));
    // 2×20 + 4×25 = 140 kg → palier 100 kg, une seule fois
    expect(r.fournisseurs).toHaveLength(1);
    expect(r.fournisseurs[0]).toMatchObject({ poidsKg: 140, montantAchat: 600, montant: 38, source: 'palier' });
    expect(r.total).toBe(38);
  });

  it('franco atteint = 0 ; fiche muette = à vérifier, hors du total', () => {
    const r = portReelParFournisseur(base({
      lignes: [ligne('1', 'a', 10), ligne('2', 'b', 1)],
      produitFournisseurs: [pf('a', 'F1'), pf('b', 'F2')],
      fournisseurs: [four('F1', { francoPort: 500 }), four('F2')],
    }));
    expect(r.fournisseurs.find(f => f.fournisseurId === 'F1')).toMatchObject({ montant: 0, source: 'franco' });
    expect(r.fournisseurs.find(f => f.fournisseurId === 'F2')?.montant).toBeNull();
    expect(r.total).toBe(0);
    expect(r.incomplet).toBe(true);
  });

  it('ignore groupes, textes, sous-totaux ; compte les lignes sans fournisseur', () => {
    const r = portReelParFournisseur(base({
      lignes: [ligne('g', undefined, 0, 'groupe'), ligne('t', undefined, 0, 'texte'), ligne('1', 'a', 1), ligne('2', 'b', 1)],
      produitFournisseurs: [pf('a', 'F1')],
      fournisseurs: [four('F1', { coutTransport: 12 })],
    }));
    expect(r.sansFournisseur).toBe(1);
    expect(r.total).toBe(12);
    expect(r.connu).toBe(true);
  });

  it('des paliers de lien tous à 0 € n’écrasent pas la fiche fournisseur', () => {
    const r = portReelParFournisseur(base({
      lignes: [ligne('1', 'a', 1)],
      produitFournisseurs: [pf('a', 'F1', { paliersPort: [{ montantMin: 0, coutTransport: 0 }, { montantMin: 3000, coutTransport: 0 }] })],
      fournisseurs: [four('F1', { francoPort: 3000, paliersPortPoids: [{ poidsMin: 0, coutTransport: 38.11 }] })],
    }));
    expect(r.fournisseurs[0]).toMatchObject({ montant: 38.11, source: 'palier' });
  });

  it('suit le fournisseur choisi à la ligne, sinon le prioritaire', () => {
    const r = portReelParFournisseur(base({
      lignes: [ligne('1', 'a', 1), ligne('2', 'b', 1)],
      produitFournisseurs: [pf('a', 'F1'), pf('a', 'F2', { estPrioritaire: true }), pf('b', 'F1'), pf('b', 'F2', { estPrioritaire: true })],
      fournisseurs: [four('F1', { coutTransport: 10 }), four('F2', { coutTransport: 30 })],
      choix: { '1': 'F1' },
    }));
    expect(r.fournisseurs.map(f => [f.fournisseurId, f.montant]).sort()).toEqual([['F1', 10], ['F2', 30]]);
  });
});

describe('port selon la destination', () => {
  const f = four('F1', {
    paliersPortPoids: [
      { poidsMin: 0, coutTransport: 40 },
      { poidsMin: 100, coutTransport: 90, dept: '13' },
      { poidsMin: 100, coutTransport: 60 },
    ],
  });

  it('le tarif relevé pour le département passe devant le tarif valable partout', () => {
    expect(portFournisseur(f, 150, 0, '13')).toMatchObject({ montant: 90, dept: '13' });
    expect(portFournisseur(f, 150, 0, '76')).toMatchObject({ montant: 60 });
    expect(portFournisseur(f, 150, 0, '76')?.approximatif).toBeUndefined();
  });

  it('sans tarif générique, un autre département sert d’estimation signalée', () => {
    const seul = four('F2', { paliersPortPoids: [{ poidsMin: 0, coutTransport: 55, dept: '13' }] });
    expect(portFournisseur(seul, 80, 0, '76')).toMatchObject({ montant: 55, dept: '13', approximatif: true });
  });

  it('sans département, les tarifs d’avant se lisent comme avant', () => {
    expect(portFournisseur(four('F3', { paliersPortPoids: [{ poidsMin: 0, coutTransport: 20 }, { poidsMin: 50, coutTransport: 30 }] }), 60, 0)).toMatchObject({ montant: 30 });
  });

  it('portReel transmet la destination', () => {
    const r = portReelParFournisseur(base({
      lignes: [ligne('1', 'a', 8)], // 160 kg
      produitFournisseurs: [pf('a', 'F1')], fournisseurs: [f], dept: '13',
    }));
    expect(r.fournisseurs[0]).toMatchObject({ montant: 90, dept: '13' });
  });

  it('départements : codes postaux, Corse, DOM, saisie libre', () => {
    expect(departementDeCodePostal('78000')).toBe('78');
    expect(departementDeCodePostal('20000')).toBe('2A');
    expect(departementDeCodePostal('20200')).toBe('2B');
    expect(departementDeCodePostal('97100')).toBe('971');
    expect(departementDeCodePostal('7800')).toBeUndefined();
    expect(['7', '07', '013', '2a', 'abc'].map(normaliserDept)).toEqual(['07', '07', '13', '2A', undefined]);
  });

  it('un palier relevé remplace celui du même poids ET de la même destination', () => {
    const r = fusionnerPaliers(
      [{ poidsMin: 100, coutTransport: 60 }, { poidsMin: 100, coutTransport: 90, dept: '13' }],
      [{ poidsMin: 100, coutTransport: 95, dept: '13' }],
    );
    expect(r).toEqual([{ poidsMin: 100, coutTransport: 60 }, { poidsMin: 100, coutTransport: 95, dept: '13' }]);
  });

  it('destination du devis : livraison choisie, sinon défaut, sinon facturation', () => {
    const client = {
      codePostal: '78000',
      adressesLivraison: [
        { id: 'a1', libelle: 'Chantier Lyon', adresse: '', ville: 'Lyon', codePostal: '69003', parDefaut: false, type: 'livraison' as const },
        { id: 'a2', libelle: 'Dépôt', adresse: '', ville: 'Rouen', codePostal: '76000', parDefaut: true, type: 'livraison' as const },
      ],
    };
    expect(destinationDuDevis(client, 'a1')?.dept).toBe('69');
    expect(destinationDuDevis(client)?.dept).toBe('76');
    expect(destinationDuDevis({ ...client, adressesLivraison: [] })?.dept).toBe('78');
    expect(destinationDuDevis(undefined)).toBeNull();
  });
});

describe("grille d'affrètement (QRM : dépt × palettes)", () => {
  const grille = {
    dateImport: '2026-10-24', kgParPalette: 1000,
    tarifs: [{ dept: '13', service: 'T3', paliers: [1, 2, 3].map((n, i) => ({ palettes: n, prix: [246, 375, 495][i] })) }],
  };
  const qrm = four('QRM', { coutTransport: 90, paliersPortPoids: [{ poidsMin: 0, coutTransport: 60 }], grilleAffretement: grille });

  it('prend le prix du département pour poids ÷ kg par palette, arrondi au-dessus', () => {
    expect(portFournisseur(qrm, 1500, 2000, '13')).toMatchObject({ montant: 375, source: 'affretement', palettes: 2, service: 'T3', dept: '13' });
    expect(portFournisseur(qrm, 1000, 2000, '13')).toMatchObject({ montant: 246, palettes: 1 });
  });

  it('franco prioritaire ; sans dépt, sans kg par palette ou hors grille : paliers puis fixe, et la raison est dite', () => {
    expect(portFournisseur({ ...qrm, francoPort: 1000 }, 1500, 2000, '13')).toMatchObject({ montant: 0, source: 'franco' });
    expect(portFournisseur(qrm, 1500, 2000)).toMatchObject({ source: 'palier', montant: 60 });
    expect(portFournisseur(qrm, 3500, 2000, '13')).toMatchObject({ source: 'palier' });
    const sansKg = { ...qrm, grilleAffretement: { ...grille, kgParPalette: undefined } };
    expect(portFournisseur(sansKg, 1500, 2000, '13')).toMatchObject({ source: 'palier' });

    const r = portReelParFournisseur(base({
      lignes: [ligne('1', 'a', 50)],
      produitFournisseurs: [pf('a', 'QRM')],
      fournisseurs: [sansKg],
      dept: '13',
    }));
    expect(r.fournisseurs[0].sansGrille).toMatch(/poids par palette/);
  });

  it('au devis : 50 × 20 kg = 1 000 kg livrés dans le 13 → 1 palette, 246 €', () => {
    const r = portReelParFournisseur(base({
      lignes: [ligne('1', 'a', 50)],
      produitFournisseurs: [pf('a', 'QRM')],
      fournisseurs: [qrm],
      dept: '13',
    }));
    expect(r.fournisseurs[0]).toMatchObject({ montant: 246, source: 'affretement', palettes: 1 });
    expect(r.fournisseurs[0].sansGrille).toBeUndefined();
  });
});

describe('palettes comptées article par article', () => {
  it('additionne les fractions de palette, poids par palette de l’article sinon de la fiche', () => {
    // 600 kg de quartz (fiche : 1 000 kg/pal.) + 300 kg de seaux (article : 600 kg/pal.) = 0,6 + 0,5 → 2
    expect(palettesDesLignes([{ poidsKg: 600 }, { poidsKg: 300, kgParPalette: 600 }], 1000)).toBe(2);
    expect(palettesDesLignes([{ poidsKg: 1000 }], 1000)).toBe(1);
    expect(palettesDesLignes([{ poidsKg: 600 }, { poidsKg: 300, kgParPalette: 600 }])).toBeUndefined();
    expect(palettesDesLignes([{ poidsKg: 0 }, { poidsKg: 300, kgParPalette: 600 }])).toBe(1);
  });

  it('le devis compte les palettes avec le poids par palette de chaque article', () => {
    const grille = {
      dateImport: '2026-10-24', kgParPalette: 1000,
      tarifs: [{ dept: '13', paliers: [{ palettes: 1, prix: 246 }, { palettes: 2, prix: 375 }] }],
    };
    const seau = { id: 's', poids: 20, kgParPalette: 600 } as Produit;
    const quartz = { id: 'q', poids: 25 } as Produit;
    const r = portReelParFournisseur({
      ...base({}),
      produitParId: (id: string) => [seau, quartz].find(p => p.id === id),
      lignes: [ligne('1', 'q', 24), ligne('2', 's', 15)], // 600 kg + 300 kg
      produitFournisseurs: [pf('q', 'QRM'), pf('s', 'QRM')],
      fournisseurs: [four('QRM', { grilleAffretement: grille })],
      dept: '13',
    });
    // au poids seul : 900 kg → 1 palette (246 €) ; article par article : 2 palettes
    expect(r.fournisseurs[0]).toMatchObject({ poidsKg: 900, source: 'affretement', palettes: 2, montant: 375 });
  });
});

describe('transport choisi sur le devis', () => {
  const messagerie = {
    dateImport: '2026-10-24', tranches: [{ min: 0, max: 99 }], zones: [{ zone: '10', prix: [41] }],
    departements: { '13': '10' }, supplementParEnvoi: 3.3,
  };
  const affretement = {
    dateImport: '2026-10-24', kgParPalette: 1000,
    tarifs: [{ dept: '13', service: 'T3', paliers: [{ palettes: 1, prix: 246 }, { palettes: 2, prix: 375 }] }],
  };
  const qrm = four('QRM', { grilleMessagerie: messagerie, grilleAffretement: affretement });
  const entree = (choixTransport?: Record<string, string>) => base({
    lignes: [ligne('1', 'a', 4)], // 80 kg
    produitFournisseurs: [pf('a', 'QRM')],
    fournisseurs: [qrm],
    dept: '13',
    choixTransport,
  });

  it('propose la messagerie (poids dans ses tranches) et chaque palier d’affrètement du département', () => {
    const r = portReelParFournisseur(entree());
    expect(r.fournisseurs[0].options.map(o => [o.cle, o.montant])).toEqual([
      ['messagerie', 44.3], ['affretement:1', 246], ['affretement:2', 375],
    ]);
    expect(r.fournisseurs[0]).toMatchObject({ source: 'messagerie', montant: 44.3 });
    expect(r.fournisseurs[0].choisi).toBeUndefined();
  });

  it('le transport choisi fait le coût du port', () => {
    const r = portReelParFournisseur(entree({ QRM: 'affretement:2' }));
    expect(r.fournisseurs[0]).toMatchObject({ source: 'affretement', montant: 375, palettes: 2, service: 'T3', choisi: 'affretement:2' });
    expect(r.total).toBe(375);
  });

  it('un choix qui ne correspond plus à aucune option retombe sur le calcul', () => {
    const r = portReelParFournisseur(entree({ QRM: 'affretement:6' }));
    expect(r.fournisseurs[0]).toMatchObject({ source: 'messagerie', montant: 44.3 });
  });

  it('sans département, aucune option', () => {
    const r = portReelParFournisseur({ ...entree({ QRM: 'affretement:2' }), dept: undefined });
    expect(r.fournisseurs[0].options).toEqual([]);
  });
});
