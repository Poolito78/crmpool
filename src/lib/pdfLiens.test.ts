import { describe, it, expect } from 'vitest';
import { zoneLienSurPage } from './pdfFolder';

/* Une A4 telle que le générateur la découpe : 297 mm, 12 mm de pied de page,
   et sur les pages 2+ un en-tête de 14 mm sous lequel le contenu commence. */
const PAGE1 = { debutMm: 0, hauteurTrancheMm: 285, yContenuMm: 0, hauteurPageMm: 285 };
const PAGE2 = { debutMm: 285, hauteurTrancheMm: 271, yContenuMm: 14, hauteurPageMm: 285 };

describe('annotation de lien dans un PDF paginé', () => {
  it('place le lien à sa hauteur sur la première page', () => {
    expect(zoneLienSurPage({ yMm: 40, hMm: 5 }, PAGE1)).toEqual({ yMm: 40, hMm: 5 });
  });

  /* Sur les pages suivantes, le contenu est décalé sous l'en-tête répété :
     un lien à 300 mm dans le document tombe à 300 − 285 + 14 = 29 mm. */
  it('décale le lien sous l’en-tête des pages suivantes', () => {
    expect(zoneLienSurPage({ yMm: 300, hMm: 5 }, PAGE2)).toEqual({ yMm: 29, hMm: 5 });
  });

  it('ignore un lien qui n’est pas sur cette page', () => {
    expect(zoneLienSurPage({ yMm: 300, hMm: 5 }, PAGE1)).toBeNull();
    expect(zoneLienSurPage({ yMm: 40, hMm: 5 }, PAGE2)).toBeNull();
  });

  /* LE HAUT DU LIEN DÉCIDE DE SA PAGE. Un lien qui commence juste avant le
     saut reste cliquable là où le lecteur le voit commencer ; le compter deux
     fois poserait une annotation fantôme en haut de la page suivante. */
  it('rattache un lien à cheval à la page où il commence', () => {
    expect(zoneLienSurPage({ yMm: 283, hMm: 6 }, PAGE1)).not.toBeNull();
    expect(zoneLienSurPage({ yMm: 283, hMm: 6 }, PAGE2)).toBeNull();
  });

  /* Une annotation qui déborde du bas de page est perdue sans rien signaler :
     on la borne au lieu de la laisser filer. */
  it('borne la hauteur au bas de la page', () => {
    const z = zoneLienSurPage({ yMm: 283, hMm: 20 }, PAGE1)!;
    expect(z.yMm).toBe(283);
    expect(z.hMm).toBe(2);            // 285 − 283, pas 20
  });

  it('écarte un lien qui tomberait entièrement hors de la page', () => {
    // Tranche courte en fin de document : le contenu s'arrête à 20 mm.
    const courte = { debutMm: 570, hauteurTrancheMm: 20, yContenuMm: 285, hauteurPageMm: 285 };
    expect(zoneLienSurPage({ yMm: 575, hMm: 5 }, courte)).toBeNull();
  });

  it('accepte un lien posé exactement au début de la tranche', () => {
    expect(zoneLienSurPage({ yMm: 285, hMm: 4 }, PAGE2)).toEqual({ yMm: 14, hMm: 4 });
  });
});
