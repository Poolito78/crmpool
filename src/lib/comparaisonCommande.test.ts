import { describe, expect, it } from 'vitest';
import { comparerCommande, kitsDuCatalogue, partiesDuLibelle, reportDuKit } from './comparaisonCommande';
import { appliquerPrix } from './prixAchatFournisseur';
import type { Produit, ProduitFournisseur } from './store';

const produit = (id: string, description: string, prixAchat: number, o: Partial<Produit> = {}) =>
  ({ id, reference: id, description, prixAchat, prixHT: prixAchat * 2, prixRevendeur: prixAchat * 1.5, ...o }) as Produit;

/* Valeurs du catalogue au 06/11/2026. */
const KIT = produit('FLOWFASTF1', 'FLOWFAST F1 MORTAR (A 2,2 KG + B 17,8 kG)', 59.29, { poids: 20 });
const POUDRE = produit('FLOWFASTF1P', 'FLOWFAST F1 MORTAR POWDER (17,8KG)', 33.18, { poids: 17.8 });
const LIQUIDE = produit('FLOWFASTF1L', 'FLOWFAST F1 MORTAR LIQUID (2,2KG)', 27.45, { poids: 2.2 });
const CATALOGUE = [KIT, POUDRE, LIQUIDE, produit('AUTRE', 'FLOWFAST 107 PRIMER (20 KG)', 90, { poids: 20 })];

const LIGNES = [
  { reference: 'FL800611582', description: 'MA700 FLOWFAST F1 MORTAR POWDER 17,8 KG', quantite: 13, prixUnitaireHT: 27.48 },
  { reference: 'FL800611576', description: 'MA700 FLOWFAST F1 MORTAR LIQUID 2,2 KG', quantite: 13, prixUnitaireHT: 27.93 },
  { reference: 'FREIGHT', description: 'FRAIS DE TRANSPORT', quantite: 1, prixUnitaireHT: 71.21 },
];
const parReference = (i: number) => [POUDRE, LIQUIDE][i];
const comparer = (o: Partial<Parameters<typeof comparerCommande>[0]> = {}) => comparerCommande({
  lignes: LIGNES, produitDe: parReference, kits: kitsDuCatalogue(CATALOGUE), liens: [],
  totalHT: 791.54, portDoc: 71.21, portFiche: 71.21, ...o,
});

describe('partiesDuLibelle', () => {
  it('lit le nom et le poids des parties annoncées', () => {
    expect(partiesDuLibelle('FLOWFAST F1 MORTAR (A 2,2 KG + B 17,8 kG)'))
      .toEqual({ mots: ['FLOWFAST', 'F1', 'MORTAR'], poids: [2.2, 17.8] });
    expect(partiesDuLibelle('Flowshield LXP Soft A 15kg + B 4kg (19kg)'))
      .toEqual({ mots: ['FLOWSHIELD', 'LXP', 'SOFT'], poids: [15, 4] });
  });

  it('ne voit pas de kit dans un simple conditionnement', () => {
    expect(partiesDuLibelle('FLOWFAST 107 PRIMER (20 KG)')).toBeNull();
    expect(partiesDuLibelle('COLLE (10 kg + 5 kg)')).toBeNull();
  });
});

describe('comparerCommande', () => {
  it('rapproche POWDER + LIQUID du kit FLOWFASTF1 et compare son coût', () => {
    const c = comparer();
    expect(c.kits).toHaveLength(1);
    expect(c.kits[0]).toMatchObject({
      nombre: 13, origine: 'libelle', prixDoc: 55.41, prixCRM: 59.29, sommePartiesCRM: 60.63, ecart: -3.88, ecartPct: -6.5,
    });
    expect(c.kits[0].kit.id).toBe('FLOWFASTF1');
    expect(c.lignes).toEqual([]);
  });

  it('garde le détail des parties : la poudre baisse, le liquide monte', () => {
    const [poudre, liquide] = comparer().kits[0].lignes;
    expect(poudre).toMatchObject({ prixDoc: 27.48, prixCRM: 33.18, ecart: -5.7 });
    expect(liquide).toMatchObject({ prixDoc: 27.93, prixCRM: 27.45, ecart: 0.48 });
  });

  it('compare le total, le transport compris', () => {
    const c = comparer();
    expect(c.marchandisesDoc).toBe(720.33);
    expect(c.compareesCRM).toBe(770.77);
    expect(c.totalDoc).toBe(791.54);
    expect(c.totalCRM).toBe(841.98);
    expect(c.ecartTotalEcrit).toBeUndefined();
  });

  it('dit ce que le total écrit a de plus que les lignes lues', () => {
    expect(comparer({ totalHT: 792.79 }).ecartTotalEcrit).toBe(1.25);
  });

  it('ne fait pas de kit si les quantités diffèrent, ou s’il manque une partie', () => {
    const inegal = [{ ...LIGNES[0], quantite: 13 }, { ...LIGNES[1], quantite: 12 }, LIGNES[2]];
    const c = comparer({ lignes: inegal });
    expect(c.kits).toEqual([]);
    expect(c.lignes.map(l => l.prixCRM)).toEqual([33.18, 27.45]);
    expect(comparer({ lignes: [LIGNES[0], LIGNES[2]] }).kits).toEqual([]);
  });

  it('reconnaît un kit à ses composants déclarés, en quantités proportionnelles', () => {
    const a = produit('A', 'RESINE PART A', 40);
    const b = produit('B', 'DURCISSEUR PART B', 10);
    const kit = produit('K', 'SYSTEME 319', 70, { composants: [{ produitId: 'A', quantite: 1 }, { produitId: 'B', quantite: 4 }] });
    const lignes = [
      { description: 'RESINE PART A', quantite: 5, prixUnitaireHT: 40 },
      { description: 'DURCISSEUR PART B', quantite: 20, prixUnitaireHT: 10 },
    ];
    const c = comparer({ lignes, produitDe: i => [a, b][i], kits: kitsDuCatalogue([a, b, kit]), portDoc: 0, portFiche: undefined, totalHT: undefined });
    expect(c.kits[0]).toMatchObject({ nombre: 5, origine: 'composants', prixDoc: 80, prixCRM: 70, ecart: 10 });
    expect(comparer({ lignes: [lignes[0], { ...lignes[1], quantite: 19 }], produitDe: i => [a, b][i], kits: kitsDuCatalogue([a, b, kit]) }).kits).toEqual([]);
  });

  it('une ligne sans article sort de la comparaison, et le total n’est pas annoncé', () => {
    const c = comparer({ lignes: [{ description: 'ARTICLE INCONNU', quantite: 2, prixUnitaireHT: 10 }], produitDe: () => undefined, totalHT: undefined });
    expect(c.horsComparaison).toBe(1);
    expect(c.totalCRM).toBeUndefined();
    expect(c.marchandisesDoc).toBe(20);
  });

  it('montre le prix du lien fournisseur quand il contredit la fiche', () => {
    const liens = [{ produitId: 'FLOWFASTF1', fournisseurId: 'T', prixAchat: 43.8 }] as ProduitFournisseur[];
    expect(comparer({ liens, fournisseurId: 'T' }).kits[0].prixLien).toBe(43.8);
  });
});

describe('reportDuKit', () => {
  it('propose le coût lu, et l’écriture sur la fiche ne touche que l’achat du kit', () => {
    const k = comparer().kits[0];
    const report = reportDuKit(k);
    expect(report).toEqual({ prix: 55.41 });

    const { produits } = appliquerPrix({
      cibles: [{ produitId: k.kit.id, prix: report!.prix!, versArticle: true, versLien: false }],
      fournisseurId: '', liens: [], produits: CATALOGUE, horodate: '2026-11-07T10:00:00Z', nouvelId: () => 'x',
    });
    const apres = produits.find(p => p.id === 'FLOWFASTF1')!;
    expect(apres).toMatchObject({ prixAchat: 55.41, prixAchatMaj: '2026-11-07T10:00:00Z', prixHT: KIT.prixHT, prixRevendeur: KIT.prixRevendeur });
    expect(produits.find(p => p.id === 'FLOWFASTF1P')).toBe(POUDRE);
  });

  it('ne propose plus rien une fois le coût reporté', () => {
    const k = comparer().kits[0];
    expect(reportDuKit({ ...k, kit: { ...KIT, prixAchat: 55.41 } })).toBeNull();
  });

  it('ne propose rien sans coût complet lu sur le document', () => {
    expect(reportDuKit({ kit: KIT, nombre: 13, prixDoc: undefined })).toBeNull();
  });

  it('propose le coût sur une fiche encore sans prix d’achat', () => {
    expect(reportDuKit({ kit: { ...KIT, prixAchat: 0 }, nombre: 13, prixDoc: 55.41 })).toEqual({ prix: 55.41 });
  });

  it('refuse un kit à composants : son coût se recalcule depuis leurs fiches', () => {
    const kit = { ...KIT, composants: [{ produitId: 'A', quantite: 1 }, { produitId: 'B', quantite: 1 }] } as Produit;
    expect(reportDuKit({ kit, nombre: 13, prixDoc: 55.41 })?.raison).toMatch(/composants/);
  });

  it('refuse un kit dont un palier fixe le prix à cette quantité, pas en dessous', () => {
    const kit = { ...KIT, paliersPrix: [{ qteMin: 10, prixAchat: 50, prixRevendeur: 80, prixHT: 120 }] } as Produit;
    expect(reportDuKit({ kit, nombre: 13, prixDoc: 55.41 })?.raison).toMatch(/palier/);
    expect(reportDuKit({ kit, nombre: 5, prixDoc: 55.41 })).toEqual({ prix: 55.41 });
  });
});
