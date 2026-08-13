import { describe, it, expect } from 'vitest';
import { comparerAuConcurrent } from './veilleComparaison';
import type { Produit } from './store';

/** Fabrique un article minimal — seuls les champs du calcul comptent. */
function article(p: Partial<Produit>): Produit {
  return {
    id: 'x', reference: 'REF', description: '', categorie: '',
    prixAchat: 0, coefficient: 1, prixRevendeur: 0, prixHT: 0, tva: 20,
    dateCreation: '2026-01-01', ...p,
  } as Produit;
}

/* ARAVIS tel qu'il est réellement en base : seau de 7,85 kg, 90,86 € au
   tarif public, 63,60 € au tarif applicateur ISOMARK. */
const ARAVIS = article({ reference: 'EAFARAVIS8ISO', prixHT: 90.86, poids: 7.85 });
const ARAVIS_TARIFE = article({
  reference: 'EAFARAVIS8ISO', prixHT: 90.86, poids: 7.85,
  prixTarif: 63.60, sourceTarif: 'ISOMARK',
});

describe('comparaison veille', () => {
  it("refuse de calculer un écart quand l'unité du concurrent manque", () => {
    // 28 relevés sur 30 sont dans ce cas. Comparer 90,86 € (le seau) à 5,40 €
    // (le kilo) annoncerait « +1 583 % » — un chiffre faux dont on se sert
    // pour fixer un prix.
    const c = comparerAuConcurrent(ARAVIS, 5.4, undefined);
    expect(c.ecartPct).toBeNull();
    expect(c.obstacle).toMatch(/unité/);
  });

  it('ramène notre prix au kilo quand le concurrent annonce des €/kg', () => {
    const c = comparerAuConcurrent(ARAVIS, 5.4, '€/kg');
    expect(c.notreTexte).toContain('11,57');      // 90,86 / 7,85
    expect(c.ecartPct).toBeCloseTo(114.3, 0);
  });

  it('préfère le tarif métier au tarif public', () => {
    // 63,60 / 7,85 = 8,10 €/kg, contre 11,57 au tarif public : l'écart passe
    // de +114 % à +50 %. C'est celui-là qui reflète le terrain.
    const c = comparerAuConcurrent(ARAVIS_TARIFE, 5.4, '€/kg');
    expect(c.notreSource).toBe('ISOMARK');
    expect(c.ecartPct).toBeCloseTo(50.0, 0);
  });

  it('compare directement à l’unité', () => {
    const rouleau = article({ prixHT: 520 });
    const c = comparerAuConcurrent(rouleau, 499.93, '€/U');
    expect(c.ecartPct).toBeCloseTo(4.01, 1);
  });

  it("signale un poids manquant plutôt que d'inventer une conversion", () => {
    const sansPoids = article({ prixHT: 100 });
    const c = comparerAuConcurrent(sansPoids, 5.4, '€/kg');
    expect(c.ecartPct).toBeNull();
    expect(c.obstacle).toMatch(/poids/);
  });

  it('convertit au m² quand poids et consommation sont connus', () => {
    // 90,86 / 7,85 = 11,57 €/kg ; à 0,8 kg/m² → 9,26 €/m².
    const c = comparerAuConcurrent(
      article({ prixHT: 90.86, poids: 7.85, consommation: 0.8 }), 7, '€/m²');
    expect(c.notreTexte).toContain('9,26');
    expect(c.ecartPct).toBeCloseTo(32.3, 0);
  });
});
