import { describe, it, expect } from 'vitest';
import { melangeFlowfast319, catalyseurPct, kitsPour, KITS_CHARGE, masse } from './melangeFlowfast319';

describe('mélange Flowfast 319 (calculateur du site isofloor.fr)', () => {
  it('pochoir voiture 130 × 60 : les chiffres du site', () => {
    // 0,259 m² à peindre, Road, pigment 10 %
    const m = melangeFlowfast319(0.259, 'road', 10);
    expect(m.surfaceACouvrir).toBeCloseTo(0.285, 3);
    expect(masse(m.melangeKg)).toBe('285 g');
    expect(masse(m.resineKg)).toBe('125 g');
    expect(m.kits.map(([k, n]) => `${n} × ${k.code}`)).toEqual(['1 × SNLR-025']);
    expect(masse(m.kit.resine)).toBe('250 g');
    expect(masse(m.kit.charge)).toBe('291 g');
    expect(masse(m.kit.pigment)).toBe('25 g');
    expect(masse(m.kit.catalyseur)).toBe('3,7 g');
    expect(masse(m.kit.total)).toBe('570 g');
    expect(m.couvreM2).toBeCloseTo(0.57, 2);
  });

  it('catalyseur : 1,5 % à 20 °C, interpolé entre les points', () => {
    expect(catalyseurPct(20)).toBe(1.5);
    expect(catalyseurPct(15)).toBe(2.25);
    expect(catalyseurPct(-2)).toBe(5);
  });

  it('kits : le moins de surplus, puis le moins de kits', () => {
    const r = kitsPour(3, KITS_CHARGE.road);
    // 2,91 + 0,291 = 3,201 kg : le plus juste au-dessus de 3 kg
    expect(r.totalKg).toBeCloseTo(3.201, 6);
    expect(r.parts.map(([k, n]) => `${n} × ${k.code}`)).toEqual(['1 × SNLR2', '1 × SNLR-025']);
  });

  it('au-delà du kilo, la masse s\'écrit en kg', () => {
    expect(masse(2.5)).toBe('2,50 kg');
  });
});
