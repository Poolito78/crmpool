import { describe, it, expect } from 'vitest';
import { POCHOIRS_SURFACE, CATEGORIES_POCHOIRS, chercherPochoirs, surfaceDimension } from './pochoirsSurface';

const par = (id: string) => POCHOIRS_SURFACE.find(p => p.id === id)!;

describe('pochoirsSurface', () => {
  it('contient piéton, cycliste et PMR avec les dimensions de la fiche', () => {
    expect(par('Pochoir-Pieton').tailles).toEqual([[35, 60], [60, 100], [75, 320]]);
    expect(par('Pochoir-Cycliste').tailles).toEqual([[40, 64], [80, 128]]);
    expect(par('Pochoir-Fauteuil-Roulant-Reglementaire').tailles).toEqual([[25, 30], [50, 60], [100, 120]]);
  });

  it('les identifiants sont uniques et chaque taux est entre 0 et 1', () => {
    const ids = POCHOIRS_SURFACE.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of POCHOIRS_SURFACE) {
      expect(p.taux).toBeGreaterThan(0);
      expect(p.taux).toBeLessThan(1);
      expect(CATEGORIES_POCHOIRS).toContain(p.categorie);
    }
  });

  it('recherche sans accent et par synonyme', () => {
    expect(chercherPochoirs('pieton').map(p => p.id)).toContain('Pochoir-Pieton');
    expect(chercherPochoirs('PMR').map(p => p.id)).toContain('Pochoir-Fauteuil-Roulant-Reglementaire');
    expect(chercherPochoirs('vélo').map(p => p.id)).toEqual(expect.arrayContaining(['Pochoir-Cycliste', 'Pochoir-Velo-Route']));
  });

  it('exige tous les mots de la requête ; vide = tout le catalogue', () => {
    expect(chercherPochoirs('zzz')).toEqual([]);
    expect(chercherPochoirs('camion citerne').map(p => p.id)).toEqual(['22760-Pochoir-Camion-Citerne']);
    expect(chercherPochoirs('  ')).toHaveLength(POCHOIRS_SURFACE.length);
  });

  it('calcule la plaque et la surface peinte', () => {
    const { plaque, peinte } = surfaceDimension(par('Pochoir-Pieton'), 60, 100);
    expect(plaque).toBeCloseTo(0.6, 6);
    expect(peinte).toBeCloseTo(0.6 * par('Pochoir-Pieton').taux, 6);
  });

  it('une dimension douteuse sur la fiche n’est pas devinée : taille vide + note', () => {
    for (const id of ['pochoir-velo-cargo', 'Pochoir-Arret-Minute-Vehicule']) {
      expect(par(id).tailles).toEqual([]);
      expect(par(id).note).toBeTruthy();
    }
  });
});
