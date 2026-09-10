import { describe, it, expect } from 'vitest';
import { cleAppelOdoo, ordonnerPropositions, type CorpsAppelOdoo } from './appelOdoo';

const base: CorpsAppelOdoo = {
  client: { email: 'm-nollet@horus-tp.fr', societe: 'HORUS', nom: 'HORUS', ville: 'LILLE' },
  lignes: [
    { reference: 'HYDRASEALDPM12', quantite: 1 },
    { reference: 'FLOWSHIELDLXP19', quantite: 1 },
  ],
  recherches: [
    { texte: 'panneaux AK5 en 1000 mm C2', quantite: 3 },
    { texte: 'support 60 3500 C2', quantite: 3 },
  ],
  niveauDefaut: 'R4',
};

describe('clé d’un appel à odoo-prix', () => {
  it('deux demandes identiques partagent la clé', () => {
    expect(cleAppelOdoo(base)).toBe(cleAppelOdoo({ ...base }));
  });

  it('l’ordre des références ne change rien', () => {
    // `referencesDuDevis` sort d'un Set : corriger un article suffit à en
    // changer l'ordre sans changer la demande. Sans le tri, le cache manquait
    // exactement le cas qu'il doit couvrir.
    const inverse = { ...base, lignes: [...base.lignes].reverse() };
    expect(cleAppelOdoo(inverse)).toBe(cleAppelOdoo(base));
  });

  it('l’ordre des recherches ne change rien', () => {
    const inverse = { ...base, recherches: [...base.recherches].reverse() };
    expect(cleAppelOdoo(inverse)).toBe(cleAppelOdoo(base));
  });

  it('une référence ajoutée change la clé', () => {
    const plus = {
      ...base,
      lignes: [...base.lignes, { reference: 'PERANPU5', quantite: 1 }],
    };
    expect(cleAppelOdoo(plus)).not.toBe(cleAppelOdoo(base));
  });

  it('la quantité change la clé — le tarif a des paliers', () => {
    const qte = {
      ...base,
      recherches: [{ ...base.recherches[0], quantite: 50 }, base.recherches[1]],
    };
    expect(cleAppelOdoo(qte)).not.toBe(cleAppelOdoo(base));
  });

  it('le niveau forcé change la clé', () => {
    expect(cleAppelOdoo({ ...base, niveau: 'R2' })).not.toBe(cleAppelOdoo(base));
  });

  it('un client différent change la clé', () => {
    const autre = { ...base, client: { ...(base.client as object), ville: 'ARRAS' } };
    expect(cleAppelOdoo(autre)).not.toBe(cleAppelOdoo(base));
  });

  it('« niveau absent » et « niveau undefined » sont la même demande', () => {
    const sans = { ...base };
    delete (sans as { niveau?: string }).niveau;
    expect(cleAppelOdoo(sans)).toBe(cleAppelOdoo({ ...base, niveau: undefined }));
  });
});

/* Cas AGILIS du 10/09/2026 : SG80401_5.3000.IS.L1000 était retenu d'office —
   « rupture » ET « hors barème » — devant la brute, disponible et tarifée au
   bordereau. Un article sans prix pour ce client ne passe pas devant un article
   qui en a un. */
describe('ordre des propositions Odoo', () => {
  const brute = { reference: 'SG80401_5.3000.IS.BRUT', contrat: 22, stockDispo: 140 };
  const laquee = { reference: 'SG80401_5.3000.IS.L1000', contrat: null, stockDispo: 0 };

  it('passe l’article tarifé et disponible devant', () => {
    expect(ordonnerPropositions([laquee, brute]).map(t => t.reference))
      .toEqual([brute.reference, laquee.reference]);
  });

  it('fait peser le hors barème plus lourd que la rupture', () => {
    const rupture = { reference: 'EN.RUPTURE', contrat: 22, stockDispo: 0 };
    const horsBareme = { reference: 'HORS.BAREME', contrat: null, stockDispo: 140 };
    expect(ordonnerPropositions([horsBareme, rupture]).map(t => t.reference))
      .toEqual([rupture.reference, horsBareme.reference]);
  });

  /* Odoo ne suit pas tous ses articles en quantité : un stock absent ne dit
     pas « zéro », et le prendre pour tel ferait passer devant les seuls
     articles stockés. */
  it('ne pénalise pas un stock inconnu', () => {
    const inconnu = { reference: 'SANS.STOCK', contrat: 22 };
    expect(ordonnerPropositions([inconnu, brute]).map(t => t.reference))
      .toEqual([inconnu.reference, brute.reference]);
  });

  /* Le tri classe, il ne trie pas à nouveau : l'ordre de pertinence d'Odoo
     reste maître entre deux propositions également vendables. */
  it('garde l’ordre d’Odoo à égalité', () => {
    const a = { reference: 'A', contrat: 10, stockDispo: 1 };
    const b = { reference: 'B', contrat: 99, stockDispo: 5 };
    expect(ordonnerPropositions([b, a]).map(t => t.reference)).toEqual(['B', 'A']);
  });
});
