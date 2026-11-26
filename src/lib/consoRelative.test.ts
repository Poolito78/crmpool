import { describe, it, expect } from 'vitest';
import { calculerConsoRelative, basculerSource } from './consoRelative';
import type { LigneDevis, Produit } from './store';

const art = (id: string, reference: string, description: string, poids: number, extra: object = {}) =>
  ({ id, reference, description, poids, ...extra }) as unknown as Produit;

const F319 = art('319', 'FLOWFAST31920', 'FLOWFAST 319 FLEXIBLE SEAL UNPIGMENTED (20KG)', 20);
const F107 = art('107', 'FLOWFAST107', 'FLOWFAST 107 Primer (20 kg)', 20);
const SNLC = art('snlc', 'SNLC5', 'SNLC 319 Concrete (5,04 Kg)', 5.04);
const CATA = art('cat', 'CATALYST2', 'Catalyst (2 kg)', 2);
const PIG = art('pig', 'PIGMENT2KG', 'Pigment poudre micronisé (2 kg)', 2);
const produits = [F319, F107, SNLC, CATA, PIG];

let n = 0;
const ligne = (produitId: string, extra: Partial<LigneDevis> = {}): LigneDevis =>
  ({ id: `l${++n}`, produitId, description: '', quantite: 1, unite: 'U', prixUnitaireHT: 0, tva: 20, remise: 0, ...extra });
const groupe = (): LigneDevis => ({ id: `g${++n}`, type: 'groupe', description: 'G', quantite: 0, unite: '', prixUnitaireHT: 0, tva: 0, remise: 0 });

describe('conso dosée en % de la résine', () => {
  it('pigment à 10 % du 319 consommé (100 m² × 0,5 kg/m²) = 5 kg', () => {
    const r319 = ligne('319', { consommation: 0.5, quantite: 3 });
    const pig = ligne('pig', { consoRelative: { pct: 10 } });
    const c = calculerConsoRelative([r319, ligne('snlc', { consommation: 0.25 }), pig], pig.id, produits, 100)!;
    expect(c.kgSources).toBe(50);
    expect(c.kg).toBe(5);
    // Le SNLC est proposé, pas retenu ; il n'est pas une résine.
    expect(c.sources.map(s => [s.ligne.produitId, s.retenue])).toEqual([['319', true], ['snlc', false]]);
  });

  it('plusieurs lignes de 319 du groupe comptent ; le primaire d\'un autre groupe non ; le catalyseur jamais', () => {
    const g1 = groupe(); const p107 = ligne('107', { consommation: 0.3 });
    const g2 = groupe(); const a = ligne('319', { consommation: 0.5 }); const b = ligne('319', { consommation: 0.2, surfaceM2: 50 });
    const cat = ligne('cat'); const pig = ligne('pig', { consoRelative: { pct: 10 } });
    const c = calculerConsoRelative([g1, p107, g2, a, b, cat, pig], pig.id, produits, 100)!;
    expect(c.sources.find(s => s.ligne.id === p107.id)?.retenue).toBe(false);
    expect(c.sources.some(s => s.ligne.id === cat.id)).toBe(false);
    expect(c.kgSources).toBe(60);   // 50 + 50 × 0,2
    expect(c.kg).toBe(6);
  });

  it('cocher / décocher une source est retenu sur la ligne', () => {
    const p107 = ligne('107', { consommation: 0.3 });
    const r319 = ligne('319', { consommation: 0.5 });
    const pig = ligne('pig', { consoRelative: { pct: 10 } });
    const ls = [p107, r319, pig];
    const c0 = calculerConsoRelative(ls, pig.id, produits, 100)!;
    // Même groupe (aucun) : les deux résines d'office.
    expect(c0.kgSources).toBe(80);
    const sans107 = basculerSource(pig.consoRelative!, c0.sources[0], false);
    expect(sans107).toEqual({ pct: 10, exclus: [p107.id] });
    const c1 = calculerConsoRelative([p107, r319, { ...pig, consoRelative: sans107 }], pig.id, produits, 100)!;
    expect(c1.kg).toBe(5);
    const avecSnlc = basculerSource(sans107, { ligne: p107, parDefaut: true }, true);
    expect(avecSnlc).toEqual({ pct: 10 });
  });

  it('sans surface ni conso : le poids des unités vendues', () => {
    const r319 = ligne('319', { quantite: 2 });
    const pig = ligne('pig', { consoRelative: { pct: 10 } });
    expect(calculerConsoRelative([r319, pig], pig.id, produits, 0)!.kg).toBe(4);
  });
});

describe('articles de référence de la fiche', () => {
  const F319J = art('319j', 'FLOWFAST319', 'FLOWFAST 319 Unpigmented (20 kg)', 20, { referenceOdoo: 'FLOWFAST31920' });
  const F319O = art('319o', 'FLOWFAST31920', 'FLOWFAST 319 FLEXIBLE SEAL UNPIGMENTED (20KG)', 20, { referenceOdoo: 'FLOWFAST31920' });
  const cat2 = [...produits, F319J, F319O];

  it('les lignes de l\'article nommé (et de son jumeau Odoo) sont prises, pas les autres résines', () => {
    const p107 = ligne('107', { consommation: 0.3 });
    const a = ligne('319o', { consommation: 0.5 });
    const b = ligne('319j', { consommation: 0.1 });
    const pig = ligne('pig', { consoRelative: { pct: 10, produits: ['319j'] } });
    const c = calculerConsoRelative([p107, a, b, pig], pig.id, cat2, 100)!;
    expect(c.sources.filter(s => s.retenue).map(s => s.ligne.id)).toEqual([a.id, b.id]);
    expect(c.kg).toBe(6);
  });

  it('aucune dans le groupe : celles de tout le devis au-dessus', () => {
    const a = ligne('319o', { consommation: 0.5 });
    const g = groupe();
    const pig = ligne('pig', { consoRelative: { pct: 10, produits: ['319o'] } });
    expect(calculerConsoRelative([a, g, pig], pig.id, cat2, 100)!.kg).toBe(5);
  });

  it('basculer une source garde les articles de référence', () => {
    const r = basculerSource({ pct: 10, produits: ['319o'] }, { ligne: ligne('107'), parDefaut: false }, true);
    expect(r.produits).toEqual(['319o']);
  });
});
