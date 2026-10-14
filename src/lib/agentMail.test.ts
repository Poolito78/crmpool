import { describe, it, expect } from 'vitest';
import {
  corpsUtile, lireTri, clientDuMail, numerosDevisCites, invitationTri,
  enteteEml, decoderMotsEncodes, dateDuNom, estFichierMail, pieceJointeUtile,
  mailTransfere, dateEnFrancais, emlSynthetique,
} from './agentMail';

describe('corpsUtile', () => {
  it("coupe l'historique cité d'un fil", () => {
    const c = 'Bonjour,\nMerci de chiffrer 10 AB4.\n\nDe : Jean <j@x.fr>\nEnvoyé : lundi\nAncien message';
    expect(corpsUtile(c)).toBe('Bonjour,\nMerci de chiffrer 10 AB4.');
  });
  it('retire les lignes citées par >', () => {
    expect(corpsUtile('Ok pour moi\n> ancien texte')).toBe('Ok pour moi');
  });
  it('borne la longueur', () => {
    expect(corpsUtile('a'.repeat(5000), 100)).toHaveLength(100);
  });
});

describe('lireTri', () => {
  it('range la réponse par identifiant et normalise', () => {
    const t = lireTri('```json\n[{"id":"a","categorie":"demande_devis","confiance":"87.4","resume":" Prix AB4 ","demandes":["10 AB4",""]},{"id":"b","categorie":"spam"}]\n```', ['a', 'b']);
    expect(t.get('a')).toMatchObject({ categorie: 'demande_devis', confiance: 87, resume: 'Prix AB4', demandes: ['10 AB4'] });
    expect(t.get('b')?.categorie).toBe('autre');
  });
  it("ignore un identifiant inconnu et ne devine pas l'absent", () => {
    const t = lireTri('[{"id":"z","categorie":"commande"}]', ['a']);
    expect(t.size).toBe(0);
  });
  it('rend une table vide sur une réponse illisible', () => {
    expect(lireTri('pas de json', ['a']).size).toBe(0);
  });
});

describe('clientDuMail', () => {
  const clients = [
    { id: '1', nom: 'Reflex', email: 'contact@reflex-signalisation.fr', contacts: [{ nom: 'BARAILLER', prenom: 'Thierry', email: 'thierry@reflex-signalisation.fr' }] },
    { id: '2', nom: 'Empreinte', email: 'martialmarliere@empreintesignalisation.fr' },
    { id: '3', nom: 'Particulier', email: 'jean.dupont@gmail.com' },
    { id: '4', nom: 'Agilis A', email: 'a@agilis.net' },
    { id: '5', nom: 'Agilis B', email: 'b@agilis.net' },
  ];
  it("retient l'adresse exacte d'un contact", () => {
    expect(clientDuMail('Thierry@reflex-signalisation.fr', '', clients)).toMatchObject({ comment: 'adresse', client: { id: '1' } });
  });
  it('retrouve la personne sous une autre adresse', () => {
    expect(clientDuMail('martialmarliere@gorez.fr', '', clients)).toMatchObject({ comment: 'personne', client: { id: '2' } });
  });
  it('retient un domaine unique', () => {
    expect(clientDuMail('compta@reflex-signalisation.fr', '', clients)).toMatchObject({ comment: 'domaine', client: { id: '1' } });
  });
  it('un domaine partagé par plusieurs fiches ne tranche pas', () => {
    const r = clientDuMail('c@agilis.net', '', clients);
    expect(r.client).toBeUndefined();
    expect(r.comment).toBe('plusieurs');
  });
  it('une messagerie grand public ne désigne personne', () => {
    expect(clientDuMail('paul.martin@gmail.com', '', clients).comment).toBe('inconnu');
  });
});

describe('numerosDevisCites', () => {
  it('reconnaît les numéros MonCRM', () => {
    expect(numerosDevisCites('RE: devis DEV-2026-112 et dev 2026 045')).toEqual(['DEV-2026-112', 'DEV-2026-045']);
  });
});

describe('invitationTri', () => {
  it("porte l'identifiant, l'expéditeur et les pièces jointes", () => {
    const c = invitationTri([{ id: 'm1', sujet: 'Demande de prix', deNom: 'Jean', deEmail: 'j@x.fr', corps: 'Bonjour', piecesJointes: ['DCE.pdf'] }]);
    const texte = JSON.stringify(c.contents);
    expect(texte).toContain('id: m1');
    expect(texte).toContain('DCE.pdf');
  });
});

describe('enteteEml', () => {
  it('lit objet encodé, expéditeur et date', () => {
    const brut = 'From: =?utf-8?Q?Jos=C3=A9_Martin?= <J.Martin@Reflex-Signalisation.fr>\r\n'
      + 'Subject: =?utf-8?B?RGVtYW5kZSBkZSBwcml4?=\r\n =?utf-8?B?IHBhbm5lYXV4?=\r\n'
      + 'Date: Mon, 12 Oct 2026 09:42:00 +0200\r\n\r\nBonjour';
    const e = enteteEml(brut);
    expect(e).toMatchObject({ sujet: 'Demande de prix panneaux', deNom: 'José Martin', deEmail: 'j.martin@reflex-signalisation.fr' });
    expect(e.date).toBe('2026-10-12T07:42:00.000Z');
  });
  it('accepte une adresse seule', () => {
    expect(enteteEml('From: a@b.fr\nSubject: Test\n\ncorps')).toMatchObject({ deNom: '', deEmail: 'a@b.fr', sujet: 'Test' });
  });
  it('décode le Q-encodage latin-1', () => {
    expect(decoderMotsEncodes('=?iso-8859-1?Q?R=E9sine?=')).toBe('Résine');
  });
});

describe('fichiers de mail', () => {
  it('lit la date posée par la macro', () => {
    expect(new Date(dateDuNom('20261013-0942 - Demande.msg')!).getHours()).toBe(9);
    expect(dateDuNom('Demande.msg')).toBeUndefined();
  });
  it('reconnaît .msg et .eml', () => {
    expect(estFichierMail('a.MSG')).toBe(true);
    expect(estFichierMail('a.pdf')).toBe(false);
  });
  it('écarte les images de signature', () => {
    expect(pieceJointeUtile('image001.png')).toBe(false);
    expect(pieceJointeUtile('Plan chantier.pdf')).toBe(true);
  });
});

describe('mailTransfere', () => {
  it("retrouve l'expéditeur d'origine d'un transfert Outlook mobile", () => {
    const texte = [
      'A chiffrer pour lundi',
      '',
      'Obtenir Outlook pour Android<https://aka.ms/AAb9ysg>',
      '________________________________',
      'De : Yahia ARBANE <yarbane@applic-sol.fr>',
      'Envoyé : vendredi 9 octobre 2026 11:14',
      'À : François MOUHOT <f.mouhot@isosign.fr>',
      'Objet : Demande de prix panneaux',
      '',
      'Bonjour,',
      'Merci de chiffrer 10 AB4.',
    ].join('\n');
    const m = mailTransfere(texte, 'TR: Demande de prix panneaux');
    expect(m).toMatchObject({
      transfere: true, deNom: 'Yahia ARBANE', deEmail: 'yarbane@applic-sol.fr',
      sujet: 'Demande de prix panneaux', note: 'A chiffrer pour lundi',
      corps: 'Bonjour,\nMerci de chiffrer 10 AB4.',
    });
    expect(new Date(m.date!).getDate()).toBe(9);
  });
  it('lit le format anglais et mailto', () => {
    const m = mailTransfere('From: Jean Dupont [mailto:jd@x.fr]\nSent: Friday, October 9, 2026 11:14 AM\nSubject: Prix\n\nCorps', 'FW: Prix');
    expect(m).toMatchObject({ deEmail: 'jd@x.fr', deNom: 'Jean Dupont', sujet: 'Prix', corps: 'Corps' });
  });
  it("ne prend pas une phrase « De : » pour un en-tête", () => {
    const m = mailTransfere('De : 10 à 20 panneaux selon le budget\n\nMerci', 'TR: Demande');
    expect(m.transfere).toBe(false);
    expect(m.sujet).toBe('Demande');
  });
});

describe('dateEnFrancais', () => {
  it('lit les formes abrégées', () => {
    const d = new Date(dateEnFrancais('ven. 9 oct. 2026 à 11:14')!);
    expect([d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([9, 9, 11, 14]);
  });
});

describe('emlSynthetique', () => {
  it("porte l'expéditeur, l'objet et les pièces", () => {
    const eml = emlSynthetique({
      deNom: 'Yahia ARBANE', deEmail: 'yarbane@applic-sol.fr', sujet: 'Demande de prix',
      texte: 'Bonjour', pieces: [{ nom: 'plan.pdf', type: 'application/pdf', octets: new Uint8Array([37, 80, 68, 70]) }],
    });
    expect(enteteEml(eml)).toMatchObject({ deEmail: 'yarbane@applic-sol.fr', sujet: 'Demande de prix' });
    expect(eml).toContain('filename="plan.pdf"');
    expect(eml).toContain('JVBERg==');
  });
});
