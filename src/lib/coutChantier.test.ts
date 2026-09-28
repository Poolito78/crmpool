import { describe, it, expect } from 'vitest';
import { coutChantier } from './odooSync';
import type { Devis, Produit } from './store';

/* DEV-2026-112 (EMPREINTE SIGNA, 28/09/2026) : Pavés à coller 15x20, 4 m². */
describe('coût chantier', () => {
  const produits = [
    { id: 'pav', reference: 'PAVPREF152030', poids: 8 },
    { id: 'ecl', reference: 'ECLIPSE25', poids: 25 },
    { id: 'qtz', reference: 'QUARTZGRI0.7-1.3', poids: 0 },
  ] as Produit[];
  const lignes = [
    { id: 'g', type: 'groupe', description: 'Pavés à coller — 15x20 · 4 m²', quantite: 0, unite: '', prixUnitaireHT: 0, tva: 0, remise: 0 },
    { id: '1', produitId: 'pav', description: 'Pavés', quantite: 4, unite: 'm²', prixUnitaireHT: 47.5, tva: 20, remise: 0, surfaceM2: 4, consommation: 1 },
    { id: 't', type: 'texte', description: 'Pavé rustique couleur Jaune clair', quantite: 0, unite: '', prixUnitaireHT: 0, tva: 0, remise: 0 },
    { id: '2', produitId: 'ecl', description: 'Colle', quantite: 1, unite: 'Units', prixUnitaireHT: 99.5, tva: 20, remise: 0, surfaceM2: 4, consommation: 5 },
    { id: '3', produitId: 'qtz', description: 'Quartz', quantite: 1, unite: 'Units', prixUnitaireHT: 22.85, tva: 20, remise: 0, surfaceM2: 4 },
  ] as Devis['lignes'];

  it('compte les pavés à la surface × prix du m², pas au kilo', () => {
    const { total, parM2 } = coutChantier(lignes, produits, 0);
    expect(total).toBeCloseTo(190 + 4 * 5 * 99.5 / 25 + 22.85);   // 292,45
    expect(parM2).toBeCloseTo(73.11, 2);
  });
});
