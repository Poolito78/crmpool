import { describe, it, expect } from 'vitest';
import { cleAppelOdoo, type CorpsAppelOdoo } from './appelOdoo';

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
