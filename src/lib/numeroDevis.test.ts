import { describe, it, expect } from 'vitest';
import { prochainNumero, prochainNumeroDevis } from './numeroDevis';

describe('prochainNumeroDevis', () => {
  it('suit le plus grand numéro, pas le nombre de devis', () => {
    // Un devis supprimé laisse un trou : 3 devis, mais 106 est le plus grand.
    const devis = [{ numero: 'DEV-2026-001' }, { numero: 'DEV-2026-105' }, { numero: 'DEV-2026-106' }];
    expect(prochainNumeroDevis(devis, 2026)).toBe('DEV-2026-107');
  });
  it('ignore les autres années et les numéros étrangers', () => {
    const devis = [{ numero: 'DEV-2025-900' }, { numero: 'AF037419' }, { numero: 'DEV-2026-010' }];
    expect(prochainNumeroDevis(devis, 2026)).toBe('DEV-2026-011');
  });
  it('commence à 001', () => {
    expect(prochainNumeroDevis([], 2026)).toBe('DEV-2026-001');
  });
});

describe('numéros libérés par une suppression', () => {
  const devis = [{ numero: 'DEV-2026-135' }, { numero: 'DEV-2026-136' }, { numero: 'DEV-2026-142' }];
  it('le plus petit numéro libéré est repris', () => {
    expect(prochainNumeroDevis(devis, 2026, ['DEV-2026-139', 'DEV-2026-137', 'DEV-2026-141'])).toBe('DEV-2026-137');
  });
  it('un numéro libéré mais repris entre-temps est sauté', () => {
    expect(prochainNumeroDevis([...devis, { numero: 'DEV-2026-137' }], 2026, ['DEV-2026-137', 'DEV-2026-138'])).toBe('DEV-2026-138');
  });
  it('sans numéro libéré, le plus grand + 1 ; les vieux trous ne sont pas comblés', () => {
    expect(prochainNumeroDevis(devis, 2026, [])).toBe('DEV-2026-143');
  });
  it("un numéro libéré d'une autre année n'est pas repris", () => {
    expect(prochainNumeroDevis(devis, 2026, ['DEV-2025-010'])).toBe('DEV-2026-143');
  });
});

describe('prochainNumero (commandes et factures)', () => {
  it('ne reprend pas un numéro après une suppression', () => {
    const f = [{ numero: 'FAC-2026-001' }, { numero: 'FAC-2026-003' }]; // la 002 a été supprimée
    expect(prochainNumero(f, 'FAC-2026')).toBe('FAC-2026-004');
  });
  it('sépare les séries : une proforma PRO- ne compte pas pour FAC-', () => {
    const f = [{ numero: 'PRO-2026-009' }, { numero: 'FAC-2026-002' }];
    expect(prochainNumero(f, 'FAC-2026')).toBe('FAC-2026-003');
    expect(prochainNumero(f, 'PRO-2026')).toBe('PRO-2026-010');
  });
  it('respecte la largeur des commandes client', () => {
    expect(prochainNumero([{ numero: 'CMD-2026-0007' }], 'CMD-2026', 4)).toBe('CMD-2026-0008');
  });
});
