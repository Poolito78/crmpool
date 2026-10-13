import { describe, it, expect } from 'vitest';
import { MAILS_DEFAUT, remplirMail, corpsEnHtml, imagesUtilisees, partieHtmlEml, texteSansImages, idImage } from './mailsTypes';

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

describe('images du mail', () => {
  const logo = { id: 'logo', nom: 'logo.png', dataUrl: 'data:image/png;base64,QUJD', largeur: 180 };
  const corps = 'Cordialement,\n{img:logo}\nFrançois';

  it("placent l'image en ligne (cid) dans le HTML, texte échappé", () => {
    const html = corpsEnHtml('A <b> {img:logo}', [logo]);
    expect(html).toContain('A &lt;b&gt; <img src="cid:logo@crmpool"');
    expect(html).toContain('width="180"');
  });

  it('ne joignent que les images placées dans le texte', () => {
    expect(imagesUtilisees(corps, [logo, { ...logo, id: 'autre' }]).map(i => i.id)).toEqual(['logo']);
  });

  it('partent dans un multipart/related avec leur Content-ID', () => {
    const lignes = partieHtmlEml('<p>x</p>', [logo], s => s).join('\n');
    expect(lignes).toMatch(/^Content-Type: multipart\/related; boundary=/);
    expect(lignes).toContain('Content-ID: <logo@crmpool>');
    expect(lignes).toContain('Content-Type: image/png; name="logo.png"');
    expect(lignes).toContain('QUJD');
  });

  it('sans image, la partie HTML reste seule', () => {
    expect(partieHtmlEml('<p>x</p>', [], s => s)[0]).toBe('Content-Type: text/html; charset="utf-8"');
  });

  it("s'effacent du texte seul (mobile)", () => {
    expect(texteSansImages(corps)).toBe('Cordialement,\n\nFrançois');
  });

  it("donnent un repère unique tiré du nom de fichier", () => {
    expect(idImage('Logo ISOSIGN.png', [])).toBe('logo-isosign');
    expect(idImage('Logo ISOSIGN.png', ['logo-isosign'])).toBe('logo-isosign-2');
  });
});
