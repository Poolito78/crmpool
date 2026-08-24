import { describe, it, expect } from 'vitest';
import {
  chiffrerPortIsosign, estSupport, FRANCO_ISOSIGN,
} from './transportIsosign';

const SUPPORT = { reference: 'SG80401_5.2000.IS.BRUT', designation: 'SUPPORT ACIER GALVA 80X40 1.5 LG 2000 + BOUCHON BRUT' };
const PANNEAU = { reference: 'AK5.1000.C2.BTR.R.IS.BRUT', designation: 'IS AK5' };

describe('frais de port ISOSIGN', () => {
  it('offre le port au-delà du franco', () => {
    const p = chiffrerPortIsosign(701, [SUPPORT]);
    expect(p.offert).toBe(true);
    expect(p.montant).toBe(0);
  });

  it('applique 75 € sous le franco avec support', () => {
    const p = chiffrerPortIsosign(500, [PANNEAU, SUPPORT]);
    expect(p.offert).toBe(false);
    expect(p.avecSupport).toBe(true);
    expect(p.montant).toBe(75);
  });

  it('applique 30 € sous le franco sans support', () => {
    const p = chiffrerPortIsosign(500, [PANNEAU]);
    expect(p.avecSupport).toBe(false);
    expect(p.montant).toBe(30);
  });

  it('traite le franco comme un seuil STRICT', () => {
    /* « Commande > 700 € » : à 700 € pile, le port reste dû. */
    expect(chiffrerPortIsosign(FRANCO_ISOSIGN, [PANNEAU]).offert).toBe(false);
    expect(chiffrerPortIsosign(FRANCO_ISOSIGN + 0.01, [PANNEAU]).offert).toBe(true);
  });

  it('reconnaît un support à sa référence comme à son libellé', () => {
    expect(estSupport('SG80401_5.2000.IS.BRUT')).toBe(true);
    expect(estSupport('', 'SUPPORT ACIER GALVA 80X40')).toBe(true);
    expect(estSupport('AK5.1000.C2.BTR.R.IS.BRUT', 'IS AK5')).toBe(false);
    expect(estSupport('PLASTOBLOC24GM', 'Plastobloc 24 Kg')).toBe(false);
  });

  it('ne compte jamais un montant négatif', () => {
    expect(chiffrerPortIsosign(-10, [PANNEAU]).base).toBe(0);
  });
});
