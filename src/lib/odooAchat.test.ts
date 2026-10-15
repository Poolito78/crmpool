import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { odooIdDuFournisseur, codesOdooDe } from './odooAchat';

describe('odooIdDuFournisseur', () => {
  it('lit le partenaire noté par la reprise Odoo', () => {
    expect(odooIdDuFournisseur({ notes: 'Fiche reprise du fichier Odoo (partenaire #4521).' })).toBe(4521);
  });
  it('rend undefined sans note ni identifiant', () => {
    expect(odooIdDuFournisseur({ notes: 'coordonnées à compléter' })).toBeUndefined();
    expect(odooIdDuFournisseur(undefined)).toBeUndefined();
  });
});

describe('codesOdooDe', () => {
  it('référence Odoo d’abord, sans doublon ni vide', () => {
    expect(codesOdooDe({ reference: 'FLOWFAST319', referenceOdoo: 'FLOWFAST31920' }))
      .toEqual(['FLOWFAST31920', 'FLOWFAST319']);
    expect(codesOdooDe({ reference: 'A11', referenceOdoo: 'A11' })).toEqual(['A11']);
    expect(codesOdooDe({ reference: ' ', referenceOdoo: undefined })).toEqual([]);
  });
});
