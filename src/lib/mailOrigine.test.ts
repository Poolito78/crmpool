import { beforeEach, describe, expect, it } from 'vitest';
import { citationHtml, dateDepuisNomMsg, entetesReponse, mailOrigineDuDevis, objetReponse, retenirMailOrigine, type MailOrigine } from './mailOrigine';

const MAIL: MailOrigine = {
  sujet: 'devis ds smith', expediteurNom: 'TOPSIGNALISATION', adresse: 'travaux@topsignalisation.fr',
  date: '06/11/2026 11:02', messageId: '<abc@topsignalisation.fr>', corps: 'Salut François,\n\n125 m² <EPW>',
};

describe('la réponse au mail du client', () => {
  beforeEach(() => localStorage.clear());

  it('met « RE: » sans le redoubler', () => {
    expect(objetReponse('devis ds smith')).toBe('RE: devis ds smith');
    expect(objetReponse('RE: devis ds smith')).toBe('RE: devis ds smith');
    expect(objetReponse('re : devis')).toBe('re : devis');
    expect(objetReponse('TR: devis')).toBe('RE: TR: devis');
  });

  it('rattache le mail au fil, s’il connaît le message d’origine', () => {
    expect(entetesReponse(MAIL)).toEqual(['In-Reply-To: <abc@topsignalisation.fr>', 'References: <abc@topsignalisation.fr>']);
    expect(entetesReponse({})).toEqual([]);
  });

  it('lit la date dans le nom exporté par la macro', () => {
    expect(dateDepuisNomMsg('20261106-1102 - devis ds smith.msg')).toBe('06/11/2026 11:02');
    expect(dateDepuisNomMsg('mail.msg')).toBeUndefined();
  });

  it('cite le message, échappé et ligne à ligne', () => {
    const html = citationHtml(MAIL);
    expect(html).toContain('TOPSIGNALISATION &lt;travaux@topsignalisation.fr&gt;');
    expect(html).toContain('<b>Envoyé :</b> 06/11/2026 11:02');
    expect(html).toContain('Salut François,<br><br>125 m² &lt;EPW&gt;');
  });

  it('retrouve le mail d’un devis, et rien pour un autre', () => {
    retenirMailOrigine('d1', MAIL);
    expect(mailOrigineDuDevis('d1')).toEqual(MAIL);
    expect(mailOrigineDuDevis('d2')).toBeNull();
  });
});
