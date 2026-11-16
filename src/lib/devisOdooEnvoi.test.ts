import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { avecNumeroOdoo, controlerMontants, lirePdfOdoo, nomPdfOdoo, normaliserNumeroOdoo, octetsEnBase64 } from './devisOdooEnvoi';

describe('avecNumeroOdoo', () => {
  const corps = "Suite à notre échange, tu trouveras ci-joint notre devis DEV-2026-186 d'un montant de 2 393,72 € HT.";

  it('accole le numéro Odoo au numéro du CRM', () => {
    expect(avecNumeroOdoo(corps, 'DEV-2026-186', 'AF042095'))
      .toBe("Suite à notre échange, tu trouveras ci-joint notre devis DEV-2026-186 / AF042095 d'un montant de 2 393,72 € HT.");
  });

  it('est idempotent et remplace un ancien numéro', () => {
    const une = avecNumeroOdoo(corps, 'DEV-2026-186', 'AF042095');
    expect(avecNumeroOdoo(une, 'DEV-2026-186', 'AF042095')).toBe(une);
    expect(avecNumeroOdoo(une, 'DEV-2026-186', 'AF042100')).toContain('DEV-2026-186 / AF042100 d');
    expect(avecNumeroOdoo(une, 'DEV-2026-186', '')).toBe(corps);
  });

  it('ne touche pas un numéro plus long', () => {
    expect(avecNumeroOdoo('DEV-2026-1860', 'DEV-2026-186', 'AF042095')).toBe('DEV-2026-1860');
  });
});

describe('lirePdfOdoo', () => {
  it('lit numéro et montant HT du PDF AF042095', () => {
    const pages = [
      'DRS SIGNALISATION\nDevis # AF042095 \nN°   Description\n30   [FLOWFAST31920] FLOWFAST 319\nRéf :   FLOWFAST31920 \n5,000\nUnité\n275,000   1 375,00 € \nISOSIGN SAS\n',
      'Sous-total   2 393,72 € \nMontant HT   2 393,72 € \nTVA 20%   478,74 € \nTotal   2 872,46 €\n',
    ];
    expect(lirePdfOdoo(pages)).toEqual({ numero: 'AF042095', totalHT: 2393.72 });
  });

  it('rend vide un PDF étranger', () => {
    expect(lirePdfOdoo(['Facture quelconque'])).toEqual({});
  });
});

describe('controlerMontants', () => {
  it('identiques au centime', () => {
    expect(controlerMontants(2393.72, 2393.72, 2393.72).ok).toBe(true);
  });
  it('un écart se signale', () => {
    const c = controlerMontants(2393.72, 2393.72, 2215.72);
    expect(c.ok).toBe(false);
    expect(c.lignes[1]).toEqual({ source: 'pdf', montant: 2215.72, ecart: -178 });
  });
  it('rien de connu côté Odoo : pas validé', () => {
    expect(controlerMontants(100).ok).toBe(false);
  });
});

describe('divers', () => {
  it('normalise la saisie', () => {
    expect(normaliserNumeroOdoo(' af 042095 ')).toBe('AF042095');
    expect(normaliserNumeroOdoo('DEV-2026-186')).toBe('');
  });
  it('nomme la pièce jointe', () => {
    expect(nomPdfOdoo('AF042095', 'DRS Signalisation')).toBe('Devis_AF042095_DRS_Signalisation.pdf');
  });
  it('encode en base64', () => {
    expect(octetsEnBase64(new TextEncoder().encode('%PDF-1.7'))).toBe(btoa('%PDF-1.7'));
  });
});
