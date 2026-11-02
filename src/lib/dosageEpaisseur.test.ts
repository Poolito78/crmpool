import { describe, expect, it } from 'vitest';
import {
  calculerDosage, consoMlEpaisseur, dosagePourRatio, ratioRetenu, consommationsParPalier, copierLignes, kgGranulat, lireDosage, palierPour, usageEpaisseur,
  type DosageEpaisseur,
} from './dosageEpaisseur';

/* Le tableau de la fiche Flowfast F1 Mortar, tel que rangé en base. */
const F1: DosageEpaisseur = {
  kgM2ParMm: 2.12,
  paliers: [
    { epaisseurMinMm: 6, ajouts: [] },
    { epaisseurMinMm: 25, ajouts: [{ libelle: 'Sable de quartz 2-8 mm', kgParKit: 8 }] },
    { epaisseurMinMm: 50, ajouts: [{ libelle: 'Sable de quartz 2-8 mm', kgParKit: 3 }, { libelle: 'Agrégat de quartz 8-16 mm', kgParKit: 12 }] },
    { epaisseurMinMm: 120, ajouts: [
      { libelle: 'Sable de quartz 2-8 mm', kgParKit: 4.8 },
      { libelle: 'Agrégat de quartz 8-16 mm', kgParKit: 6.4 },
      { libelle: 'Agrégat de quartz 16-32 mm', kgParKit: 8 },
    ] },
  ],
};

describe('palierPour', () => {
  it("retient le plus épais dont le minimum est atteint", () => {
    expect(palierPour(F1, 6)?.epaisseurMinMm).toBe(6);
    expect(palierPour(F1, 24)?.epaisseurMinMm).toBe(6);
    expect(palierPour(F1, 30)?.epaisseurMinMm).toBe(25);
    expect(palierPour(F1, 50)?.epaisseurMinMm).toBe(50);
    expect(palierPour(F1, 200)?.epaisseurMinMm).toBe(120);
  });
  it('sous 6 mm, aucun mélange : la fiche l\'interdit', () => {
    expect(palierPour(F1, 5)).toBeNull();
    expect(calculerDosage(F1, 20, 5)).toBeNull();
  });
});

describe('calculerDosage', () => {
  it('6 mm : le kit seul, 2,12 × 6', () => {
    const c = calculerDosage(F1, 20, 6)!;
    expect(c.consoKitKgM2).toBe(12.72);
    expect(c.ajouts).toEqual([]);
  });
  it('25 mm : le mélange de 28 kg se partage 20 / 8', () => {
    const c = calculerDosage(F1, 20, 25)!;
    expect(c.kgM2Melange).toBe(53);
    expect(c.consoKitKgM2).toBe(37.857);
    expect(c.ajouts[0].kgM2).toBe(15.143);
  });
  it('30 mm : mélange 25 mm, à l\'épaisseur réelle', () => {
    const c = calculerDosage(F1, 20, 30)!;
    expect(c.palier.epaisseurMinMm).toBe(25);
    expect(c.consoKitKgM2).toBe(45.429);
    expect(usageEpaisseur(c)).toBe('Épaisseur 30 mm (mélange 25 mm)');
  });
  it('120 mm : trois granulats', () => {
    const c = calculerDosage(F1, 20, 120)!;
    expect(c.consoKitKgM2).toBe(129.796);
    expect(c.ajouts.map(a => a.libelle)).toEqual(['Sable de quartz 2-8 mm', 'Agrégat de quartz 8-16 mm', 'Agrégat de quartz 16-32 mm']);
  });
  it('sans poids de kit, rien ne se devine', () => {
    expect(calculerDosage(F1, undefined, 30)).toBeNull();
    expect(calculerDosage(F1, 0, 30)).toBeNull();
  });
});

describe('kgGranulat', () => {
  it('suit les kits gâchés, pas la surface', () => {
    expect(kgGranulat(5, 8)).toBe(40);
    expect(kgGranulat(3, 4.8)).toBe(14.4);
  });
});

describe('consommationsParPalier', () => {
  it('un usage par palier, à son épaisseur minimale', () => {
    expect(consommationsParPalier(F1, 20)).toEqual([
      { valeur: 12.72, usage: 'Épaisseur 6 mm — mortier seul' },
      { valeur: 37.857, usage: 'Épaisseur 25 mm — chargé : + 8 kg 2-8 mm par kit' },
      { valeur: 60.571, usage: 'Épaisseur 50 mm — chargé : + 3 kg 2-8 mm + 12 kg 8-16 mm par kit' },
      { valeur: 129.796, usage: 'Épaisseur 120 mm — chargé : + 4,8 kg 2-8 mm + 6,4 kg 8-16 mm + 8 kg 16-32 mm par kit' },
    ]);
  });
});

describe('lireDosage', () => {
  it('relit le jsonb et trie les paliers', () => {
    const d = lireDosage(JSON.stringify({ kgM2ParMm: 2.12, paliers: [F1.paliers[1], F1.paliers[0]] }))!;
    expect(d.paliers.map(p => p.epaisseurMinMm)).toEqual([6, 25]);
  });
  it('écarte un dosage sans conso ou sans palier', () => {
    expect(lireDosage({ kgM2ParMm: 0, paliers: F1.paliers })).toBeUndefined();
    expect(lireDosage({ kgM2ParMm: 0, paliers: [] })).toBeUndefined();
    expect(lireDosage(null)).toBeUndefined();
  });
});

describe('copierLignes', () => {
  it('renumérote et garde le granulat rattaché à son mortier', () => {
    let n = 0;
    const out = copierLignes([
      { id: 'm', description: 'F1' },
      { id: 'g', description: 'sable', granulatDe: { ligneId: 'm', libelle: 'Sable de quartz 2-8 mm' } },
    ], () => `n${++n}`);
    expect(out.map(l => l.id)).toEqual(['n1', 'n2']);
    expect(out[1].granulatDe).toEqual({ ligneId: 'n1', libelle: 'Sable de quartz 2-8 mm' });
  });
});

describe("produit simple dosé à l'épaisseur (Flowbuild Cove F)", () => {
  const COVE = lireDosage({ kgM2ParMm: 2, kgMlParMm: 0.15, paliers: [] })!;

  it('se lit sans palier', () => {
    expect(COVE).toEqual({ kgM2ParMm: 2, kgMlParMm: 0.15, paliers: [] });
    expect(lireDosage({ kgM2ParMm: 0, kgMlParMm: 0.2 })).toEqual({ kgM2ParMm: 0, kgMlParMm: 0.2, paliers: [] });
  });

  it('conso = conso par mm × épaisseur, sans poids de kit', () => {
    const c = calculerDosage(COVE, undefined, 5)!;
    expect(c.consoKitKgM2).toBe(10);
    expect(c.ajouts).toEqual([]);
    expect(usageEpaisseur(c)).toBe('Épaisseur 5 mm');
    expect(calculerDosage(COVE, undefined, 0)).toBeNull();
  });

  it('conso au ml', () => {
    expect(consoMlEpaisseur(COVE, 4)).toBe(0.6);
    expect(consoMlEpaisseur({ kgM2ParMm: 2, paliers: [] }, 4)).toBeNull();
  });
});

describe('ratio de charge', () => {
  const D = lireDosage({ kgM2ParMm: 0, paliers: [], ratios: [
    { libelle: '1:5', kgM2ParMm: 0.35, kgMlParMm: 0.05 },
    { libelle: ' 1:7 ', kgM2ParMm: 0.26 },
    { libelle: '', kgM2ParMm: 1 },
  ] })!;

  it('se lit sans conso de base, ratios vides écartés', () => {
    expect(D.ratios!.map(r => r.libelle)).toEqual(['1:5', '1:7']);
  });

  it('le ratio de la ligne fixe la conso par mm, le premier par défaut', () => {
    expect(ratioRetenu(D)?.libelle).toBe('1:5');
    expect(calculerDosage(dosagePourRatio(D, '1:7'), undefined, 10)!.consoKitKgM2).toBe(2.6);
    expect(calculerDosage(dosagePourRatio(D, 'inconnu'), undefined, 10)!.consoKitKgM2).toBe(3.5);
    expect(consoMlEpaisseur(dosagePourRatio(D, '1:5'), 10)).toBe(0.5);
    expect(consoMlEpaisseur(dosagePourRatio(D, '1:7'), 10)).toBeNull();
  });

  it("l'usage cite le ratio", () => {
    const c = calculerDosage(dosagePourRatio(D, '1:7'), undefined, 10)!;
    expect(usageEpaisseur(c, '1:7')).toBe('Épaisseur 10 mm, ratio 1:7');
  });
});
