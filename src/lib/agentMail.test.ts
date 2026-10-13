import { describe, it, expect } from 'vitest';
import { corpsUtile, lireTri, clientDuMail, numerosDevisCites, invitationTri } from './agentMail';

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
