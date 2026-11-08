import { describe, it, expect } from 'vitest';
import { MAILS_DEFAUT, avecEmplacementDelai, remplirMail, corpsEnHtml, imagesUtilisees, partieHtmlEml, texteSansImages, idImage, nettoyerHtml, texteDuMail, texteVersHtml, placerDansHtml, placerDansTexte } from './mailsTypes';

describe('avecEmplacementDelai', () => {
  const DELAI = 'Délai de livraison : 10 à 15 jours ouvrés pour la teinte 479 (RAL 5015, Sky Blue).';

  it('place le délai avant la validité, dans le texte d’origine', () => {
    const m = avecEmplacementDelai(MAILS_DEFAUT.devis.corps);
    const rempli = remplirMail(m, { numero: 'D', montantHT: '1 €', validite: '12/11', delai: DELAI, destinataire: '', reference: '', chantier: '', systeme: '', coutChantierM2: '' });
    expect(rempli).toContain(`${DELAI}\nCe devis est valable jusqu'au 12/11.`);
  });

  it('place le délai avant la validité dans un mail type HTML, et hors des passages [[ ]]', () => {
    const corps = '<div>Devis {numero}.[[</div><div>Coût : {cout}]]</div><div>Ce devis est valable jusqu\'au {validite}.</div><div>Signature</div>';
    const rempli = remplirMail(avecEmplacementDelai(corps), { numero: 'D', cout: '', validite: '12/11', delai: DELAI });
    expect(rempli).toBe(`<div>Devis D.</div><div>${DELAI}</div><div>Ce devis est valable jusqu'au 12/11.</div><div>Signature</div>`);
  });

  it('ne laisse rien sans délai, et respecte un emplacement choisi', () => {
    const corps = '<div>Ce devis est valable jusqu\'au {validite}.</div>';
    expect(remplirMail(avecEmplacementDelai(corps), { validite: '12/11', delai: '' })).toBe("<div>Ce devis est valable jusqu'au 12/11.</div>");
    expect(avecEmplacementDelai('{delai}\n{validite}')).toBe('{delai}\n{validite}');
  });
});

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
    const v = { destinataire: 'Roger Cheval', numero: 'DEV-2026-138', reference: '', societe: "PRESTA'SERVICE", chantier: 'BAO 64 ML', systeme: '', coutChantierM2: '', montantHT: '846,80 €', montantTTC: '1 016,16 €', validite: '12/11/2026' };
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
    const html = corpsEnHtml('A < B & C {img:logo}', [logo]);
    expect(html).toContain('A &lt; B &amp; C <img src="cid:logo@crmpool"');
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

describe('mail mis en forme (HTML)', () => {
  const logo = { id: 'logo', nom: 'logo.png', dataUrl: 'data:image/png;base64,QUJD', largeur: 180 };

  it('échappe les valeurs et garde la mise en forme', () => {
    const m = '<div>Devis <b>{numero}</b>[[ (Réf. {reference})]]</div><div>{societe}</div>';
    expect(remplirMail(m, { numero: 'DEV-1', reference: '', societe: 'A & <B>' }))
      .toBe('<div>Devis <b>DEV-1</b></div><div>A &amp; &lt;B&gt;</div>');
  });

  it('nettoie le HTML : scripts, attributs on…, liens javascript', () => {
    const sale = '<div onclick="x()">Bonjour<script>alert(1)</script> <a href="javascript:x">lien</a> <span style="color:#CC0000">rouge</span></div>';
    expect(nettoyerHtml(sale)).toBe('<div>Bonjour <a>lien</a> <span style="color:#CC0000">rouge</span></div>');
  });

  it("place l'image et la police de base d'Outlook", () => {
    const html = corpsEnHtml('<div>Cordialement</div><div>{img:logo}</div>', [logo]);
    expect(html).toMatch(/^<div style="font-family:Calibri/);
    expect(html).toContain('<div><img src="cid:logo@crmpool"');
  });

  it('redevient du texte pour le mobile, une ligne par bloc', () => {
    expect(texteDuMail('<div>Bonjour <b>Roger</b>,</div><div><br></div><div>Cordialement</div><div>{img:logo}</div>'))
      .toBe('Bonjour Roger,\n\nCordialement');
  });

  it("convertit un texte brut pour l'éditeur, ligne vide comprise", () => {
    expect(texteVersHtml('A & B\n\nC')).toBe('<div>A &amp; B</div><div><br></div><div>C</div>');
  });
});

describe('emplacement des fiches produit', () => {
  it('le paragraphe du repère cède sa place aux liens, avant la signature', () => {
    const html = '<div>Restant à ta disposition.</div><div>{fiches}</div><div>François Mouhot</div>';
    expect(placerDansHtml(html, 'fiches', '<p>LIENS</p>')).toBe('<div>Restant à ta disposition.</div><p>LIENS</p><div>François Mouhot</div>');
  });

  it('sans repère, rien n\'est placé (les liens suivent le texte)', () => {
    expect(placerDansHtml('<div>x</div>', 'fiches', '<p>LIENS</p>')).toBeNull();
  });

  it('en texte seul, la ligne du repère devient le bloc', () => {
    expect(placerDansTexte('Restant.\n{fiches}\nFrançois', 'fiches', '\nFiches produit :\n• A\n'))
      .toBe('Restant.\n\nFiches produit :\n• A\n\nFrançois');
  });
});
