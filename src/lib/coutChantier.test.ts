import { describe, it, expect } from 'vitest';
import { coutChantier } from './odooSync';
import { consoPourSurface, type Devis, type Produit } from './store';

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

  it('compte la surface posée, pas les m² entiers commandés', () => {
    const posee = lignes.map(l => l.id === '1' ? { ...l, quantite: 4, surfaceM2: 3.3 } : l);
    const { total } = coutChantier(posee, produits, 0);
    expect(total).toBeCloseTo(3.3 * 47.5 + 4 * 5 * 99.5 / 25 + 22.85);
  });
});

/* Devis au mètre linéaire : la conso de la fiche au ml (kg/ml) remplace les kg/m². */
describe('consommation au ml', () => {
  const mastic = { id: 'mas', reference: 'MASTIC', poids: 5, consommation: 2, consommationMl: 0.25 } as Produit;
  const toile = { id: 'toi', reference: 'TOILE', poids: 10, consoUnite: 'm2', surfaceUniteM2: 50 } as Produit;

  it('lit la conso au ml, jamais les kg/m²', () => {
    expect(consoPourSurface(mastic, undefined, 'ml')).toBe(0.25);
    expect(consoPourSurface(mastic, undefined, 'm2')).toBe(2);
    expect(consoPourSurface(mastic, 0.4, 'ml')).toBe(0.4);
  });

  it("n'en invente pas une quand la fiche n'en porte pas", () => {
    expect(consoPourSurface({ ...mastic, consommationMl: undefined }, undefined, 'ml')).toBeNull();
    // La couverture en m² n'a pas de sens au ml.
    expect(consoPourSurface(toile, undefined, 'ml')).toBeNull();
  });

  it('chiffre le coût chantier au mètre linéaire', () => {
    const lignes = [
      { id: '1', produitId: 'mas', description: 'Mastic', quantite: 5, unite: 'U', prixUnitaireHT: 40, tva: 20, remise: 0 },
    ] as Devis['lignes'];
    // 100 ml × 0,25 kg/ml × 8 €/kg = 200 € → 2 €/ml
    const { total, parM2 } = coutChantier(lignes, [mastic], 100, 'ml');
    expect(total).toBeCloseTo(200);
    expect(parM2).toBeCloseTo(2);
  });
});
