import { describe, expect, it } from 'vitest';
import { libelleAvecTeinte, ralDeLibelle, referenceSelonTeinte, teinteDeReference } from './referenceTeinte';
import { buildOdooPayload } from './odooSync';
import type { Client, Devis, Produit } from './store';

const TEINTE = 'dim-teinte';
// La fiche réelle : PIGMENT2KG, reference_odoo = la 1re teinte de la liste.
const PIGMENT2KG = {
  id: 'pig2',
  reference: 'PIGMENT2KG',
  referenceOdoo: 'PIGMENT2KG.L1000',
  description: 'Pigment poudre micronisé (2 kg)',
  variantes: [{
    id: TEINTE,
    nom: 'Teinte',
    options: [
      { id: 'o1', label: 'RAL 1000' },
      { id: 'o2', label: '222 (RAL 7037, Goosewing Grey)' },
      { id: 'o3', label: '340 (Pastel Yellow)' },
    ],
  }],
} as unknown as Produit;

describe('ralDeLibelle / teinteDeReference', () => {
  it('lit le RAL d\'un libellé de teinte', () => {
    expect(ralDeLibelle('222 (RAL 7037, Goosewing Grey)')).toBe('7037');
    expect(ralDeLibelle('RAL 9016')).toBe('9016');
    expect(ralDeLibelle('340 (Pastel Yellow)')).toBeNull();
  });
  it('lit le segment de teinte d\'une référence', () => {
    expect(teinteDeReference('PIGMENT2KG.L1000')).toBe('1000');
    expect(teinteDeReference('A13A.700.C1.BTR.IS.L9010')).toBe('9010');
    expect(teinteDeReference('PIGMENT2KG')).toBeNull();
    expect(teinteDeReference('FLOWFAST31920')).toBeNull();
  });
});

describe('referenceSelonTeinte — AF041510 / P29317', () => {
  it('RAL 7037 choisi → PIGMENT2KG.L7037, jamais L1000', () => {
    const r = referenceSelonTeinte('PIGMENT2KG.L1000', PIGMENT2KG, { [TEINTE]: '222 (RAL 7037, Goosewing Grey)' });
    expect(r.ref).toBe('PIGMENT2KG.L7037');
    expect(r.aVerifier).toBeUndefined();
  });
  it('la 1re teinte choisie garde sa référence', () => {
    expect(referenceSelonTeinte('PIGMENT2KG.L1000', PIGMENT2KG, { [TEINTE]: 'RAL 1000' }).ref)
      .toBe('PIGMENT2KG.L1000');
  });
  it('teinte sans RAL → aucune référence, à vérifier', () => {
    const r = referenceSelonTeinte('PIGMENT2KG.L1000', PIGMENT2KG, { [TEINTE]: '340 (Pastel Yellow)' });
    expect(r.ref).toBeUndefined();
    expect(r.teinte).toBe('340 (Pastel Yellow)');
    expect(r.aVerifier).toMatch(/à vérifier/);
  });
  it('aucune teinte choisie → aucune référence, à vérifier', () => {
    const r = referenceSelonTeinte('PIGMENT2KG.L1000', PIGMENT2KG, {});
    expect(r.ref).toBeUndefined();
    expect(r.aVerifier).toBeTruthy();
  });
  it('référence sans segment de teinte : inchangée', () => {
    const PIGMENTKG = { ...PIGMENT2KG, referenceOdoo: undefined, reference: 'PIGMENTKG' } as unknown as Produit;
    expect(referenceSelonTeinte('PIGMENTKG', PIGMENTKG, { [TEINTE]: 'RAL 9016' }))
      .toEqual({ ref: 'PIGMENTKG', teinte: 'RAL 9016' });
  });
  it('article sans dimension de teinte : le code laqué fait foi', () => {
    const laque = { id: 'x', reference: 'A11', variantes: [] } as unknown as Produit;
    expect(referenceSelonTeinte('A11.1000.C1.BTR.IS.L9010', laque, undefined).ref)
      .toBe('A11.1000.C1.BTR.IS.L9010');
  });
});

describe('libelleAvecTeinte', () => {
  it('ajoute la teinte quand le libellé ne la dit pas', () => {
    expect(libelleAvecTeinte('Pigment poudre micronisé (2 kg)', '222 (RAL 7037, Goosewing Grey)'))
      .toBe('Pigment poudre micronisé (2 kg) — Teinte 222 (RAL 7037, Goosewing Grey)');
  });
  it('ne répète pas une teinte déjà dite', () => {
    expect(libelleAvecTeinte('Pigment RAL 7037', '222 (RAL 7037, Goosewing Grey)')).toBe('Pigment RAL 7037');
    expect(libelleAvecTeinte('Pigment', undefined)).toBe('Pigment');
  });
});

describe('buildOdooPayload — la ligne pigment part sous sa teinte', () => {
  const client = { id: 'c', nom: 'SIGNA\'SOLS', societe: 'SIGNA\'SOLS' } as unknown as Client;
  const devis = (teinte: string) => ({
    numero: 'DEV-TEST',
    lignes: [{
      id: 'l1', produitId: 'pig2', description: 'Pigment poudre micronisé (2 kg)',
      quantite: 2, prixUnitaireHT: 72, remise: 0, tva: 20,
      variantesChoisies: { [TEINTE]: teinte },
    }],
  }) as unknown as Devis;

  it('RAL 7037 → ref PIGMENT2KG.L7037, teinte dans le libellé', () => {
    const p = buildOdooPayload(devis('222 (RAL 7037, Goosewing Grey)'), client, [PIGMENT2KG]);
    expect(p.lines[0].ref).toBe('PIGMENT2KG.L7037');
    expect(p.lines[0].desc).toContain('RAL 7037');
    expect(p.avertissements).toBeUndefined();
  });
  it('teinte sans RAL → pas de ref, avertissement', () => {
    const p = buildOdooPayload(devis('340 (Pastel Yellow)'), client, [PIGMENT2KG]);
    expect(p.lines[0].ref).toBeUndefined();
    expect(p.lines[0].desc).toContain('Pastel Yellow');
    expect(p.avertissements?.length).toBe(1);
  });
});
