import { describe, it, expect } from 'vitest';
import type { Devis, LigneDevis } from './store';
import { systemeDepuisDevis, systemesDeDevis } from './systemesDevis';
import { rapprocherSysteme } from './rapprochementSysteme';
import { declinerSysteme } from './systemes';

const l = (o: Partial<LigneDevis>): LigneDevis => ({
  id: Math.random().toString(36).slice(2), description: '', quantite: 0, unite: 'U',
  prixUnitaireHT: 0, tva: 20, remise: 0, ...o,
});

function modele(systeme: string, lignes: LigneDevis[], statut: Devis['statut'] = 'système'): Devis {
  return { id: `d-${systeme}`, numero: 'DEV-X', systeme, statut, lignes } as unknown as Devis;
}

const ROAD_107_319 = modele('FLowfast 107 319 Road', [
  l({ type: 'groupe', description: 'Primaire' }),
  l({ produitId: 'p107', description: 'FLOWFAST 107 Primer (20 kg)', note: 'Application raclette @ 0,5 kg/m²' }),
  l({ type: 'soustotal' }),
  l({ type: 'groupe', description: 'Finition' }),
  l({ produitId: 'p319', description: 'FLOWFAST 319 Flexible Seal Unpigmented (20 kg)', consommation: 0.523 }),
  l({ produitId: 'ppig', description: 'Pigment poudre micronisé (2 kg)', consommation: 0.1046 }),
  l({ type: 'groupe', description: 'Tire à zéro' }),
  l({ produitId: 'p215', description: 'FLOWFAST 215 Flexible Binder (20 kg)', consommation: 0.6 }),
  l({ description: 'SURCHARGE ENERGIE', quantite: 1, unite: 'pièce' }),
]);
const ROAD = modele('FLowfast 319 Road', [
  l({ produitId: 'p319', description: 'FLOWFAST 319', consommation: 0.523 }),
]);

describe('systèmes issus de devis modèles', () => {
  it('ne prend que les devis « système », sans la ligne sans article', () => {
    const s = systemeDepuisDevis(ROAD_107_319)!;
    expect(s.composants.map(c => c.produitId)).toEqual(['p107', 'p319', 'ppig', 'p215']);
    expect(systemeDepuisDevis(modele('x', ROAD_107_319.lignes, 'brouillon'))).toBeNull();
  });

  it('lit la consommation de la note quand la ligne n\'en porte pas', () => {
    const s = systemeDepuisDevis(ROAD_107_319)!;
    expect(s.composants[0].consommation).toBe(0.5);
  });

  it('range « Tire à zéro » en facultatif', () => {
    const s = systemeDepuisDevis(ROAD_107_319)!;
    expect(s.composants.map(c => c.obligatoire)).toEqual([true, true, true, false]);
  });

  it('« système 107 flowfast 319 Road 100m² gris 7040 » désigne le modèle 107 + 319', () => {
    const r = rapprocherSysteme('systeme 107 flowfast 319 Road 100m² gris 7040',
      systemesDeDevis([ROAD, ROAD_107_319]));
    expect(r?.nom).toBe('FLowfast 107 319 Road');
    expect(r?.retenu).toBeDefined();
    expect(r?.surfaceM2).toBe(100);
  });

  it('sans « 107 », c\'est le modèle 319 Road seul', () => {
    const r = rapprocherSysteme('flowfast 319 Road 100 m²', systemesDeDevis([ROAD, ROAD_107_319]));
    expect(r?.nom).toBe('FLowfast 319 Road');
  });

  it('décline sur 100 m² : les facultatifs restent à part', () => {
    const s = systemeDepuisDevis(ROAD_107_319)!;
    const d = declinerSysteme(s, 100);
    expect(d.map(x => x.quantiteKg)).toEqual([50, 52.3, 10.46]);
  });
});
