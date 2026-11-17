import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => {
  const ok = Promise.resolve({ error: null, data: [] });
  const table = {
    select: () => ok,
    upsert: () => ok,
    delete: () => ({ eq: () => ({ eq: () => ok }) }),
  };
  return { supabase: { from: () => table } };
});

import { oublierPrix, prixClientDeProduit, prixDuClient, referencePrixClient, retenirPrix } from './memoirePrix';

describe('prix spécifiques du client', () => {
  it('la clé est la référence Odoo, sinon la référence MonCRM', () => {
    expect(referencePrixClient({ reference: 'flowfast107', referenceOdoo: 'FLOWFASTPRIMER107.20' })).toBe('FLOWFASTPRIMER107.20');
    expect(referencePrixClient({ reference: ' ab4 ' })).toBe('AB4');
  });

  it('un prix saisi se retrouve par la référence Odoo comme par la référence MonCRM', async () => {
    await retenirPrix('c1', [{ reference: 'FLOWFASTPRIMER107.20', prix: 250 }]);
    await retenirPrix('c1', [{ reference: 'AB4', prix: 30.5 }]);
    expect(prixClientDeProduit('c1', { reference: 'FLOWFAST107', referenceOdoo: 'FLOWFASTPRIMER107.20' })?.prix).toBe(250);
    expect(prixClientDeProduit('c1', { reference: 'AB4', referenceOdoo: 'AB4.600.C2.BTR.IS.BRUT' })?.prix).toBe(30.5);
    expect(prixClientDeProduit('c1', { reference: 'AB4', referenceOdoo: 'AB4.600.C2.BTR.IS.BRUT' })?.numeroOffre).toBeUndefined();
  });

  it('un prix ne vaut que pour son client', () => {
    expect(prixClientDeProduit('c2', { reference: 'AB4' })).toBeUndefined();
    expect(prixClientDeProduit(null, { reference: 'AB4' })).toBeUndefined();
    expect(prixDuClient('c1').map(p => p.reference)).toEqual(['AB4', 'FLOWFASTPRIMER107.20']);
  });

  it('retirer un prix rend la main au tarif', async () => {
    await oublierPrix('c1', 'ab4');
    expect(prixClientDeProduit('c1', { reference: 'AB4' })).toBeUndefined();
  });
});
