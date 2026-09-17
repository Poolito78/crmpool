import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { codeNegoce, ODOO_NEGOCE_SH_CODE } from './odooSync';

/* Un article ISOMARK ou ISOFLOOR absent d'Odoo part en NEG.SH.ISO ; tout le
   reste garde le négoce du devis (NEG.ISO). */
describe('article de négoce d’une ligne', () => {
  it('ISOFLOOR et ISOMARK par le catalogue', () => {
    expect(codeNegoce({ catalogue: 'ISOFLOOR', categorie: 'MMA' })).toBe(ODOO_NEGOCE_SH_CODE);
    expect(codeNegoce({ catalogue: 'ISOMARK', categorie: undefined })).toBe(ODOO_NEGOCE_SH_CODE);
  });

  it('par la catégorie Odoo quand le catalogue ne dit rien', () => {
    expect(codeNegoce({ catalogue: undefined, categorie: 'ISOMARK / FLOORING / MMA' })).toBe(ODOO_NEGOCE_SH_CODE);
    expect(codeNegoce({ catalogue: undefined, categorie: 'EPOXY' })).toBe(ODOO_NEGOCE_SH_CODE);
  });

  it('une ligne sans article porte sa gamme — le SNL Concrete d’un système', () => {
    expect(codeNegoce(undefined, { gamme: 'ISOFLOOR' })).toBe(ODOO_NEGOCE_SH_CODE);
  });

  it('ISOSIGN et les lignes sans gamme gardent le négoce du devis', () => {
    expect(codeNegoce({ catalogue: 'ISOSIGN', categorie: 'SIGNALISATION POLICE / Triangle' })).toBeUndefined();
    expect(codeNegoce({ catalogue: 'ISOSIGN', categorie: 'ELEMENTS DE FIXATION / Accessoires Mats / Ancrage' })).toBeUndefined();
    expect(codeNegoce(undefined, {})).toBeUndefined();
  });
});
