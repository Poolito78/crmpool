import { describe, it, expect } from 'vitest';
import { calculerTotalDevis, totalPourMemoire, estPourMemoire, type LigneDevis } from './store';

const ligne = (id: string, pu: number, qte: number, extra: Partial<LigneDevis> = {}): LigneDevis => ({
  id, description: id, quantite: qte, unite: 'u', prixUnitaireHT: pu, tva: 20, remise: 0, ...extra,
});

describe('lignes « Pour mémoire »', () => {
  const lignes = [ligne('a', 100, 2), ligne('pm', 50, 3, { pourMemoire: true }), ligne('b', 10, 1)];

  it('le montant PM n\'entre pas dans le total du devis', () => {
    const t = calculerTotalDevis(lignes, 30, 20);
    expect(t.totalHT).toBe(240);          // 200 + 10 + 30 de port
    expect(t.totalTVA).toBeCloseTo(48);
    expect(t.totalTTC).toBeCloseTo(288);
  });

  it('le montant PM se lit à part', () => {
    expect(totalPourMemoire(lignes)).toBe(150);
  });

  it('seule une ligne article peut être PM', () => {
    expect(estPourMemoire({ type: 'texte', pourMemoire: true })).toBe(false);
    expect(estPourMemoire({ pourMemoire: true })).toBe(true);
  });
});
