import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import { numerosOdooCites } from './numerosOdoo';

describe('numerosOdooCites — les dossiers Odoo d’un mail', () => {
  it('« Re: ACHAT P29317- AF041510 » : la commande d’achat puis le devis', () => {
    expect(numerosOdooCites('Re: ACHAT P29317- AF041510')).toEqual([
      { numero: 'P29317', modele: 'purchase.order' },
      { numero: 'AF041510', modele: 'sale.order' },
    ]);
  });

  it('lit les écritures espacées, en minuscules, sans doublon', () => {
    expect(numerosOdooCites('Votre devis af 041510 et AF-041510, cf AF041510').map(n => n.numero)).toEqual(['AF041510']);
  });

  it('ne prend pas les profils de panneaux ni les nombres trop longs', () => {
    expect(numerosOdooCites('Lapérouse P50, Champlain P25, réf P123456, AF0415101, XAF041510')).toEqual([]);
  });

  it('rien dans un texte vide', () => {
    expect(numerosOdooCites('')).toEqual([]);
  });
});
