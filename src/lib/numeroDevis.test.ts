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
