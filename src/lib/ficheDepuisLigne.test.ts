import { describe, it, expect, beforeEach } from 'vitest';
import { champsFiche, demandeDepuisLigne, lierLigneAuProduit, memoriserLiaison, prendreLiaison } from './ficheDepuisLigne';
import type { LigneDevis, Produit } from './store';

const ligne = (p: Partial<LigneDevis> = {}): LigneDevis => ({
  id: 'l1', description: 'Plot PVC 300 mm', quantite: 4, unite: 'pièce', prixUnitaireHT: 100, tva: 20, remise: 5, ...p,
});

describe('champsFiche', () => {
  it('pré-remplit désignation, prix et coût ; le code reste à saisir', () => {
    const f = champsFiche(demandeDepuisLigne('d1', ligne({ prixAchatLigne: 35 }), false));
    expect(f.reference).toBe('');
    expect(f.description).toBe('Plot PVC 300 mm');
    expect(f.prixHT).toBe(100);
    expect(f.prixRevendeur).toBe(70);
    expect(f.prixAchat).toBe(35);
    expect(f.coefficient).toBe(2);
  });

  it('client revendeur : le prix de la ligne est le revendeur', () => {
    const f = champsFiche(demandeDepuisLigne('d1', ligne({ prixUnitaireHT: 70 }), true));
    expect(f.prixRevendeur).toBe(70);
    expect(f.prixHT).toBe(100);
  });

  it('la suite du texte devient la description détaillée ; la référence Odoo propose le code', () => {
    const f = champsFiche(demandeDepuisLigne('d1', ligne({ description: '**Plot PVC**\nhauteur 300', referenceOdoo: 'PLOT300' }), false));
    expect(f.description).toBe('Plot PVC');
    expect(f.descriptionDetaillee).toBe('hauteur 300');
    expect(f.reference).toBe('PLOT300');
  });

  it('sans prix ni coût, rien n’est inventé', () => {
    const f = champsFiche(demandeDepuisLigne('d1', ligne({ prixUnitaireHT: 0 }), false));
    expect(f.prixHT).toBe(0);
    expect(f.prixRevendeur).toBe(0);
    expect(f.prixAchat).toBe(0);
    expect('coefficient' in f).toBe(false);
  });
});

describe('lierLigneAuProduit', () => {
  const p = { id: 'p1', reference: 'PLOT300', description: 'Plot PVC 300', unite: 'pièce', tva: 20 } as Produit;

  it('relie l’article, garde prix, quantité et remise, prend sa désignation', () => {
    const l = lierLigneAuProduit(ligne({ prixAchatLigne: 35, referenceOdoo: 'X' }), p, 50);
    expect(l.produitId).toBe('p1');
    expect(l.description).toBe('Plot PVC 300');
    expect(l.prixUnitaireHT).toBe(100);
    expect(l.quantite).toBe(4);
    expect(l.remise).toBe(5);
    expect(l.prixAchatLigne).toBeUndefined();
    expect(l.referenceOdoo).toBeUndefined();
  });

  it('une ligne sans prix prend celui de la fiche ; un texte sur plusieurs lignes reste', () => {
    const l = lierLigneAuProduit(ligne({ prixUnitaireHT: 0, description: 'Plot\nposé sur dalle' }), p, 50);
    expect(l.prixUnitaireHT).toBe(50);
    expect(l.description).toBe('Plot\nposé sur dalle');
  });
});

describe('liaison', () => {
  beforeEach(() => sessionStorage.clear());
  it('ne se prend que pour son devis, une seule fois', () => {
    memoriserLiaison({ devisId: 'd1', ligneId: 'l1', produitId: 'p1' });
    expect(prendreLiaison('d2')).toBeNull();
    expect(prendreLiaison('d1')?.produitId).toBe('p1');
    expect(prendreLiaison('d1')).toBeNull();
  });
});
