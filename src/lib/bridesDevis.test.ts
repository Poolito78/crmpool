import { describe, it, expect } from 'vitest';
import { compterBrides, familleRails, railsDuPanneau } from '@/lib/bridesDevis';

describe('familleRails', () => {
  it('reconnait les familles dans le bon ordre', () => {
    expect(familleRails('AB4')).toBe('AB4');   // STOP avant les « A »
    expect(familleRails('AB3a')).toBe('AB3');
    expect(familleRails('AB6')).toBe('AB6');
    expect(familleRails('A13a')).toBe('A');
    expect(familleRails('B21a1')).toBe('B21A'); // avant les « B »
    expect(familleRails('B14')).toBe('B');
    expect(familleRails('B30')).toBe('ZONE');
    expect(familleRails('CE15a')).toBe('CE');
    expect(familleRails('M9z')).toBe('PANONCEAU');
  });

  it('ecarte la signalisation temporaire', () => {
    expect(familleRails('KD22a')).toBeNull();
    expect(familleRails('AK5')).toBeNull();
    expect(familleRails('KC1')).toBeNull();
  });
});

describe('railsDuPanneau', () => {
  it('lit la table, taille par taille', () => {
    expect(railsDuPanneau('A', 'A13A.700.C1.BTR.IS.BRUT').rails).toBe(2);
    expect(railsDuPanneau('A', 'A13A.1250.C1.BTR.IS.BRUT').rails).toBe(3);
    expect(railsDuPanneau('B', 'B14.1250.C2.BTR').rails).toBe(3);
  });

  it('rend null hors table plutot que de deviner', () => {
    expect(railsDuPanneau('A', 'A13A.850.C1.BTR').rails).toBeNull();
    expect(railsDuPanneau('A', 'A13A sans cote').rails).toBeNull();
  });

  it('B21a1 porte 4 rails a toutes les tailles', () => {
    expect(railsDuPanneau('B21A', 'B21A1.450').rails).toBe(4);
    expect(railsDuPanneau('B21A', 'B21A1.850').rails).toBe(4);
  });

  it('les panonceaux se lisent au format', () => {
    expect(railsDuPanneau('PANONCEAU', 'M9z 700x200').rails).toBe(1);
    expect(railsDuPanneau('PANONCEAU', 'M9z 900x500').rails).toBe(2);
    expect(railsDuPanneau('PANONCEAU', 'M9z 900x900').rails).toBe(3);
  });

  it('G1 porte 3 rails, sans cote', () => {
    expect(railsDuPanneau('G1', 'G1b 1150x750').rails).toBe(3);
  });
});

describe('compterBrides', () => {
  it('une bride par rail, quantite comprise', () => {
    const c = compterBrides([
      { texte: 'A13A.700.C1.BTR.IS.BRUT', quantite: 3 },   // 2 rails x 3
      { texte: 'M9z 700x200 panonceau', quantite: 3 },     // 1 rail  x 3
    ]);
    expect(c.brides).toBe(9);
    expect(c.aVerifier).toHaveLength(0);
  });

  it('ne compte pas ce qui n a pas de rail', () => {
    const c = compterBrides([
      { texte: 'PLASTOBLOC16 plot PVC', quantite: 14 },
      { texte: 'KC1.800.600 chantier mobile', quantite: 7 },
      { texte: 'SG80401_5.2500 mat', quantite: 4 },
    ]);
    expect(c.brides).toBe(0);
    expect(c.aVerifier).toHaveLength(0);
  });

  it('signale au lieu de deviner quand la cote manque a la table', () => {
    const c = compterBrides([{ texte: 'A13A.850.C1.BTR.IS.BRUT', quantite: 2 }]);
    expect(c.brides).toBe(0);
    expect(c.aVerifier).toHaveLength(1);
    expect(c.aVerifier[0].raison).toBe('cote absente de la table');
    expect(c.aVerifier[0].famille).toBe('A');
  });

  it('ignore une ligne a quantite nulle', () => {
    expect(compterBrides([{ texte: 'A13A.700', quantite: 0 }]).brides).toBe(0);
  });
});
