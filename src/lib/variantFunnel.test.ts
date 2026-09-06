import { describe, it, expect } from 'vitest';
import { buildFunnel, classifySegment } from './variantFunnel';

/** Références réelles du catalogue (table `produits`), copiées telles quelles. */
const KD22 = [
  'KD22.1000.300.3430.BTR.P.IS.BRUT',
  'KD22.1000.300.C1.BTR.IS.BRUT',
  'KD22.1000.300.C1.BTR.P.IS.BRUT',
  'KD22.1000.300.C1.BTR.R.IS.BRUT',
  'KD22.1000.300.C2.BP.ST.IS.BRUT',
  'KD22.1000.300.C2.BTR.IS.BRUT',
  'KD22.1000.300.C2.BTR.P.IS.BRUT',
  'KD22.1000.300.C2.BTR.R.IS.BRUT',
  'KD22.1300.300.C1.BTR.IS.BRUT',
  'KD22.1300.300.C1.BTR.P.IS.BRUT',
  'KD22.1300.300.C2.BP.ST.IS.BRUT',
  'KD22.1300.300.C2.BTR.IS.BRUT',
  'KD22.1300.300.C2.BTR.P.IS.BRUT',
  'KD22.1300.300.C2.BTR.R.IS.BRUT',
];

/** Panneau permanent : aucune variante ne porte P ni R. */
const A13A = [
  'A13A.700.3430.BTR.IS.BRUT',
  'A13A.700.C1.BTR.IS.BRUT',
  'A13A.700.C1.F.BTR.IS.BRUT',
  'A13A.700.C2.BTR.IS.BRUT',
  'A13A.700.C2.BTR.IS.L7016',
  'A13A.700.C2.BTR.ST.IS.L7002',
  'A13A.700.C2.F.BTR.IS.BRUT',
  'A13A.1000.C2.BTR.IS.BRUT',
];

const funnel = (refs: string[], query: string, chips?: Record<string, string>) =>
  buildFunnel({
    candidates: refs.map((reference) => ({ reference, description: '' })),
    query,
    chipOverrides: chips as never,
  });

describe('classifySegment — équipement', () => {
  it('reconnaît le support et le kit rail', () => {
    expect(classifySegment('P')).toBe('equipement');
    expect(classifySegment('R')).toBe('equipement');
  });

  it("ne confond pas le kit rail avec un RAL (qui commence par L)", () => {
    expect(classifySegment('L7016')).toBe('ral');
    expect(classifySegment('BRUT')).toBe('ral');
  });
});

describe("entonnoir — équipement de la signalisation temporaire", () => {
  it('retient le kit rail par défaut et résout la référence', () => {
    const r = funnel(KD22, '1000 300 c2');
    expect(r.matches).toEqual(['KD22.1000.300.C2.BTR.R.IS.BRUT']);
    expect(r.defaultsApplied).toContain('equipement');
    expect(r.resolved.equipement).toBe('R');
  });

  it('propose les trois possibilités : sans rail, avec support, kit rail', () => {
    const r = funnel(KD22, '1000 300 c2');
    const opts = r.defaultOptions.find((o) => o.category === 'equipement');
    expect(opts?.options.sort()).toEqual(['AUCUN', 'P', 'R']);
  });

  it('rend le panneau nu quand on demande « sans rail »', () => {
    const r = funnel(KD22, '1000 300 c2', { equipement: 'AUCUN' });
    expect(r.matches).toEqual(['KD22.1000.300.C2.BTR.IS.BRUT']);
  });

  it('rend la variante support quand on le demande', () => {
    const r = funnel(KD22, '1000 300 c2', { equipement: 'P' });
    expect(r.matches).toEqual(['KD22.1000.300.C2.BTR.P.IS.BRUT']);
  });
});

/** Famille sans kit rail : seulement le nu et le support. */
const ISOTEXTE = [
  'ISOTEXTE.1200.1600.C1.50.IS',
  'ISOTEXTE.1200.1600.C1.50.P.IS',
  'ISOTEXTE.1200.1600.C2.50.IS',
  'ISOTEXTE.1200.1600.C2.50.P.IS',
];

describe("entonnoir — repli quand la famille n'a pas de kit rail", () => {
  it('retombe sur « sans rail » plutôt que de poser la question', () => {
    const r = funnel(ISOTEXTE, '1200 1600 c2');
    expect(r.matches).toEqual(['ISOTEXTE.1200.1600.C2.50.IS']);
    expect(r.resolved.equipement).toBe('AUCUN');
    expect(r.pending.map((p) => p.category)).not.toContain('equipement');
  });

  it('ne laisse alors que le choix avec ou sans pied', () => {
    const r = funnel(ISOTEXTE, '1200 1600 c2');
    const opts = r.defaultOptions.find((o) => o.category === 'equipement');
    expect(opts?.options.sort()).toEqual(['AUCUN', 'P']);
  });

  it('rend la variante support quand on le demande', () => {
    const r = funnel(ISOTEXTE, '1200 1600 c2', { equipement: 'P' });
    expect(r.matches).toEqual(['ISOTEXTE.1200.1600.C2.50.P.IS']);
  });
});

describe('entonnoir — les panneaux permanents ne bougent pas', () => {
  it("ne demande ni n'applique d'équipement là où la notion n'existe pas", () => {
    const r = funnel(A13A, '700 c2');
    expect(r.matches).toEqual(['A13A.700.C2.BTR.IS.BRUT']);
    expect(r.defaultsApplied).not.toContain('equipement');
    expect(r.pending.map((p) => p.category)).not.toContain('equipement');
  });
});
