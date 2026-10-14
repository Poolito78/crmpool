import { describe, it, expect } from 'vitest';
import { adresseDeTransfert } from './mailsTransferes';

describe('adresseDeTransfert', () => {
  it('insère la clé après un +', () => {
    expect(adresseDeTransfert('agent@moncrm-mails.fr', 'abc123')).toBe('agent+abc123@moncrm-mails.fr');
  });
  it('remplace une clé déjà présente', () => {
    expect(adresseDeTransfert('x1y2@inbound.postmarkapp.com', 'k')).toBe('x1y2+k@inbound.postmarkapp.com');
    expect(adresseDeTransfert('agent+vieux@d.fr', 'neuf')).toBe('agent+neuf@d.fr');
  });
});
