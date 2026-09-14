import { describe, it, expect } from 'vitest';
import { gabaritsGrille, indexerGrille, prixDansGrille, prixAuNiveau, estNiveauTarif } from '@/lib/grilleTarif';

const grille = indexerGrille([
  { codification: 'A*.700.C2.BRUT', prix: 36.01, priorite: 150 },
  { codification: 'SG80401_5.3000.IS.BRUT', prix: 22, priorite: 60 },
  { codification: 'M*.1200.400.C2.IS.BRUT', prix: 40, priorite: 150 },
  { codification: 'BOUCHON8040', prix: 1.4, priorite: 60 },
  // Deux lignes pour la même codification : la priorité tranche.
  { codification: 'BOUCHON8080', prix: 1.2, priorite: 10 },
  { codification: 'bouchon8080', prix: 1.9, priorite: 90 },
]);

describe('gabaritsGrille', () => {
  it('essaie le code exact avant les formes étoilées', () => {
    const g = gabaritsGrille('A3A.700.C2.BTR.IS.BRUT');
    expect(g[0]).toBe('A3A.700.C2.BTR.IS.BRUT');
    expect(g).toContain('A*.700.C2.BRUT');
    expect(g.indexOf('A3A.700.C2.BRUT')).toBeLessThan(g.indexOf('A*.700.C2.BRUT'));
  });

  it('retire les options R/P/ST', () => {
    expect(gabaritsGrille('KD22A.1000.300.C2.BTR.R.IS.BRUT')).toContain('KD22A.1000.300.C2.BRUT');
  });
});

describe('prixDansGrille', () => {
  it('trouve un panneau par son gabarit', () => {
    expect(prixDansGrille(grille, 'A14.700.C2.BTR.IS.BRUT')).toEqual({ prix: 36.01, gabarit: 'A*.700.C2.BRUT' });
  });

  it('garde IS quand la grille le garde (panonceaux)', () => {
    expect(prixDansGrille(grille, 'M9C.1200.400.C2.BTR.IS.BRUT')?.prix).toBe(40);
  });

  it('retient la priorité la plus haute', () => {
    expect(prixDansGrille(grille, 'BOUCHON8080')?.prix).toBe(1.9);
  });

  it('ne devine rien hors grille', () => {
    expect(prixDansGrille(grille, 'A14.1000.C3.BRUT')).toBeNull();
    expect(prixDansGrille(undefined, 'BOUCHON8040')).toBeNull();
  });
});

describe('prixAuNiveau', () => {
  const isosign = (reference: string) => ({ reference, catalogue: 'ISOSIGN' });

  it('signalisation ISOSIGN : la grille du niveau', () => {
    expect(prixAuNiveau(isosign('SG80401_5.3000.IS.BRUT'), 'R4', grille))
      .toEqual({ prix: 22, source: 'grille', detail: 'SG80401_5.3000.IS.BRUT' });
  });

  it('la référence Odoo prime sur la référence locale', () => {
    expect(prixAuNiveau({ reference: 'LOCAL', referenceOdoo: 'BOUCHON8040', catalogue: 'ISOSIGN' }, 'R4', grille)?.prix).toBe(1.4);
  });

  it('article absent de la grille, ou grille non chargée : null', () => {
    expect(prixAuNiveau(isosign('INCONNU.500'), 'R4', grille)).toBeNull();
    expect(prixAuNiveau(isosign('BOUCHON8040'), 'R0', undefined)).toBeNull();
  });

  it('plastique STI : public −30 % à tous les niveaux, R0 compris', () => {
    const p = { reference: 'ISOFAB4400C2SF', catalogue: 'ISOSIGN' };
    const attendu = { prix: 103.88, source: 'sti', detail: 'STI public −30 %' };
    expect(prixAuNiveau(p, 'R0')).toEqual(attendu);
    expect(prixAuNiveau(p, 'R3')).toEqual(attendu);
  });

  it('catégorie PLASTIQUE hors barème : public de la fiche −30 %', () => {
    const p = { reference: 'BUTEE182NJ.ALTER', catalogue: 'ISOSIGN', categorie: 'PLASTIQUE / Equipements de sécurité au sol', prixHT: 92.86 };
    expect(prixAuNiveau(p, 'R0')).toEqual({ prix: 65, source: 'sti', detail: 'fiche publique −30 %' });
  });

  it('plastique sans aucun prix public : rien, jamais deviné', () => {
    const p = { reference: 'PLOTALUDF', catalogue: 'ISOSIGN', categorie: 'PLASTIQUE / Balisage permanent', prixHT: 0 };
    expect(prixAuNiveau(p, 'R2', grille)).toBeNull();
  });

  it('police en R0 : R4 ÷ 0,65 faute de grille R0', () => {
    const r4 = indexerGrille([{ codification: 'B*.650.C2.BRUT', prix: 46.618, priorite: 150 }]);
    const b14 = { reference: 'B14.650.C2.BTR.IS.BRUT', catalogue: 'ISOSIGN', categorie: 'SIGNALISATION POLICE / Cercle' };
    expect(prixAuNiveau(b14, 'R0', undefined, r4))
      .toEqual({ prix: 71.72, source: 'grille', detail: 'B*.650.C2.BRUT (R4 ÷ 0,65)' });
  });

  it('R0 : ni les rails ni ce qui n’est pas police ne se déduisent de R4', () => {
    const r4 = indexerGrille([
      { codification: 'RailBTR.800.Sans.IS.BRUT', prix: 10, priorite: 50 },
      { codification: 'BOUCHON8040', prix: 1.4, priorite: 60 },
    ]);
    expect(prixAuNiveau({ reference: 'RailBTR.800.Sans.IS.BRUT', catalogue: 'ISOSIGN', categorie: 'SIGNALISATION POLICE' }, 'R0', undefined, r4)).toBeNull();
    expect(prixAuNiveau({ reference: 'BOUCHON8040', catalogue: 'ISOSIGN', categorie: 'ELEMENTS DE FIXATION / Accessoires Mats' }, 'R0', undefined, r4)).toBeNull();
  });

  it('ISOMARK / ISOFLOOR : le niveau ne tarife pas', () => {
    expect(prixAuNiveau({ reference: 'BOUCHON8040', catalogue: 'ISOMARK' }, 'R4', grille)).toBeNull();
  });
});

describe('estNiveauTarif', () => {
  it('reconnaît R0 à R4 seulement', () => {
    expect(estNiveauTarif('R0')).toBe(true);
    expect(estNiveauTarif('R5')).toBe(false);
    expect(estNiveauTarif('')).toBe(false);
  });
});
