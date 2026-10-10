import { describe, it, expect } from 'vitest';
import { fusionnerPaliers, lectureTransport, normaliserPaliers } from './transportFournisseur';

describe('transportFournisseur', () => {
  it('normalise : un palier par poids, mode reconnu, négatifs écartés', () => {
    const r = normaliserPaliers([
      { poidsMin: '30', coutTransport: '45,5', mode: 'Messagerie palette' },
      { poidsMin: 30, coutTransport: 50 },
      { poidsMin: -1, coutTransport: 10 },
      { poidsMin: 0, coutTransport: 'abc' },
      { poidsMin: 0, coutTransport: 12, mode: 'Chronopost' },
    ]);
    expect(r).toEqual([
      { poidsMin: 0, coutTransport: 12, mode: 'chronopost' },
      { poidsMin: 30, coutTransport: 50 },
    ]);
  });

  it('fusionne : le palier lu remplace celui du même poids, les autres restent', () => {
    const r = fusionnerPaliers(
      [{ poidsMin: 0, coutTransport: 38.11 }, { poidsMin: 100, coutTransport: 80 }],
      [{ poidsMin: 100, coutTransport: 95, mode: 'messagerie' }, { poidsMin: 500, coutTransport: 150 }],
    );
    expect(r).toEqual([
      { poidsMin: 0, coutTransport: 38.11 },
      { poidsMin: 100, coutTransport: 95, mode: 'messagerie' },
      { poidsMin: 500, coutTransport: 150 },
    ]);
  });

  it('une facture donne un point poids / port, jamais de franco deviné', () => {
    const r = lectureTransport({ typeDocument: 'facture', poidsKg: 262.4, portHT: 51, paliers: [], mode: 'messagerie' });
    expect(r.paliers).toEqual([{ poidsMin: 262, coutTransport: 51, mode: 'messagerie' }]);
    expect(r.francoPort).toBeUndefined();
  });

  it('une grille garde ses paliers et ignore le point unique', () => {
    const r = lectureTransport({
      typeDocument: 'tarif', francoPort: 3000, poidsKg: 10, portHT: 5,
      paliers: [{ poidsMin: 0, coutTransport: 20 }, { poidsMin: 50, coutTransport: 35 }],
    });
    expect(r.paliers).toHaveLength(2);
    expect(r.francoPort).toBe(3000);
  });

  it('sans poids ni coût lisibles, aucun palier', () => {
    expect(lectureTransport({ typeDocument: 'devis', portHT: 40 }).paliers).toEqual([]);
  });
});
