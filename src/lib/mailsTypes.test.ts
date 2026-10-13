import { describe, it, expect } from 'vitest';
import { MAILS_DEFAUT, remplirMail } from './mailsTypes';

describe('remplirMail', () => {
  it('retire un passage [[ ]] dont un champ est vide, garde les autres', () => {
    const m = 'Devis {numero}[[ — {reference}]][[ — {societe}]]';
    expect(remplirMail(m, { numero: 'DEV-1', reference: '', societe: 'ACME' })).toBe('Devis DEV-1 — ACME');
  });

  it('laisse visible un champ inconnu (faute de frappe)', () => {
    expect(remplirMail('Bonjour {destinatair}', { destinataire: 'Roger' })).toBe('Bonjour {destinatair}');
  });

  it("ne laisse pas de trou quand un passage sur plusieurs lignes disparaît", () => {
    expect(remplirMail('A[[\n\nB {x}]]\n\nC', { x: '' })).toBe('A\n\nC');
  });
});

describe('textes d\'origine', () => {
  it('reprennent le mail de devis écrit en dur jusque-là', () => {
    const d = MAILS_DEFAUT.devis;
    const v = { destinataire: 'Roger Cheval', numero: 'DEV-2026-138', reference: '', societe: "PRESTA'SERVICE", chantier: 'BAO 64 ML', montantHT: '846,80 €', montantTTC: '1 016,16 €', validite: '12/11/2026' };
    expect(remplirMail(d.objet, v)).toBe("Devis DEV-2026-138 — PRESTA'SERVICE — BAO 64 ML");
    expect(remplirMail(d.corps, v)).toBe(`Bonjour Roger Cheval,

Suite à notre échange, tu trouveras ci-joint notre devis DEV-2026-138 d'un montant de 846,80 € HT.
Chantier : BAO 64 ML
Ce devis est valable jusqu'au 12/11/2026.

Restant à ta disposition pour tout complément d'information.`);
  });

  it("AR de commande : les dates absentes ne laissent rien", () => {
    const v = { destinataire: 'Roger', numero: 'CC-1', reference: 'R1', societe: 'S', montantHT: '10,00 €', dateDepart: '', dateLivraison: '' };
    expect(remplirMail(MAILS_DEFAUT.ar_commande.corps, v)).toBe(`Bonjour Roger,

Nous vous confirmons la bonne réception de votre commande CC-1 (Réf. R1) d'un montant de 10,00 € HT.

Restant à votre disposition pour tout complément d'information.

Cordialement,
ISOSIGN`);
  });
});
