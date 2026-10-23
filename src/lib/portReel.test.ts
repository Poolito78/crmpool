import { describe, expect, it } from 'vitest';
import { portReelParFournisseur } from './portReel';
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
