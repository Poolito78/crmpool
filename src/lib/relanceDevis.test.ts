import { describe, it, expect } from 'vitest';
import {
  ajouterJours, prochaineRelance, relanceProposee, etatRelance, devisARelancer, libelleStatutDevis,
  remplirModele, versModele, modeleParDefaut, champsRelance, numerosDuDevis, type ChampsRelance,
} from './relanceDevis';
import type { Client, Devis } from './store';

const base = { statut: 'envoyé' as const, dateCreation: '2026-10-01', dateEnvoi: '2026-10-02' };

describe('prochaineRelance', () => {
  it('7 jours après l’envoi sans relance', () => {
    expect(prochaineRelance(base)).toBe('2026-10-09');
  });
  it('7 jours après la dernière relance', () => {
    expect(prochaineRelance({ ...base, relances: [{ date: '2026-10-09', mode: 'tel' }, { date: '2026-10-15', mode: 'email' }] })).toBe('2026-10-22');
  });
  it('la date saisie fait foi', () => {
    expect(prochaineRelance({ ...base, dateRelance: '2026-11-03' })).toBe('2026-11-03');
  });
  it('rien hors devis envoyé', () => {
    expect(prochaineRelance({ ...base, statut: 'accepté' })).toBeUndefined();
    expect(prochaineRelance({ ...base, statut: 'brouillon' })).toBeUndefined();
  });
  it('une réalisation lointaine repousse la relance à un mois avant', () => {
    // DEV-2026-027 : envoyé le 26/05, réalisation prévue le 01/12.
    expect(prochaineRelance({ ...base, dateEnvoi: '2026-05-26', dateRealisation: '2026-12-01' })).toBe('2026-11-01');
  });
  it('une réalisation proche ne change rien', () => {
    expect(prochaineRelance({ ...base, dateRealisation: '2026-10-20' })).toBe('2026-10-09');
  });
  it('la date saisie passe outre la réalisation', () => {
    expect(prochaineRelance({ ...base, dateRealisation: '2026-12-01', dateRelance: '2026-10-15' })).toBe('2026-10-15');
  });
  it('relanceProposee, après une relance', () => {
    expect(relanceProposee('2026-10-12')).toBe('2026-10-19');
    expect(relanceProposee('2026-10-12', '2027-01-15')).toBe('2026-12-16');
  });
  it('passe les fins de mois', () => {
    expect(ajouterJours('2026-10-28', 7)).toBe('2026-11-04');
  });
});

describe('etatRelance / devisARelancer', () => {
  const a = { ...base, numero: 'A', dateRelance: '2026-10-10' };
  const b = { ...base, numero: 'B', dateRelance: '2026-10-12' };
  const c = { ...base, numero: 'C', dateRelance: '2026-10-20' };
  it('classe l’échéance', () => {
    expect(etatRelance(a, '2026-10-12')).toBe('en_retard');
    expect(etatRelance(b, '2026-10-12')).toBe('aujourdhui');
    expect(etatRelance(c, '2026-10-12')).toBe('a_venir');
  });
  it('ne retient que les relances dues, la plus ancienne d’abord', () => {
    expect(devisARelancer([c, b, a], '2026-10-12').map(d => d.numero)).toEqual(['A', 'B']);
  });
});

describe('libelleStatutDevis', () => {
  it('« Relancé » à la place d’« Envoyé » dès la première relance', () => {
    expect(libelleStatutDevis({ statut: 'envoyé' })).toBe('Envoyé');
    expect(libelleStatutDevis({ statut: 'envoyé', relances: [{ date: '2026-10-09', mode: 'tel' }] })).toBe('Relancé');
  });
  it('un devis accepté reste accepté', () => {
    expect(libelleStatutDevis({ statut: 'accepté', relances: [{ date: '2026-10-09', mode: 'tel' }] })).toBe('Accepté');
  });
});

const champs: ChampsRelance = {
  contact: 'Jean Dupont', societe: 'SOGEA', numero: 'DEV-2026-120', reference: '',
  chantier: 'PANTIN', montant: '1 234,56 €', dateEnvoi: '02/10/2026', validite: '01/11/2026',
};

describe('remplirModele', () => {
  it('remplit les champs', () => {
    expect(remplirModele('Devis {numero} de {montant}', champs)).toBe('Devis DEV-2026-120 de 1 234,56 €');
  });
  it('retire un passage facultatif dont un champ est vide', () => {
    expect(remplirModele('Devis {numero}[ (Réf. {reference})].', champs)).toBe('Devis DEV-2026-120.');
    expect(remplirModele('Devis {numero}[ (Réf. {reference})].', { ...champs, reference: 'AF12' })).toBe('Devis DEV-2026-120 (Réf. AF12).');
  });
  it('garde de vrais crochets et un champ inconnu', () => {
    expect(remplirModele('[sic] {inconnu}', champs)).toBe('[sic] {inconnu}');
  });
  it('les mails types de base n’ont plus d’accolade une fois remplis', () => {
    for (const rang of [1, 2, 3]) {
      expect(remplirModele(modeleParDefaut(rang).contenu, champs)).not.toMatch(/[{}[\]]/);
    }
  });
  it('au-delà de la troisième relance, la dernière reste proposée', () => {
    expect(modeleParDefaut(5).id).toBe('base-3');
  });
});

describe('versModele', () => {
  it('remet les accolades, la valeur la plus longue d’abord', () => {
    const texte = 'Bonjour Jean Dupont, devis DEV-2026-120 de 1 234,56 € (chantier PANTIN).';
    expect(versModele(texte, champs)).toBe('Bonjour {contact}, devis {numero} de {montant} (chantier {chantier}).');
  });
  it('aller-retour', () => {
    const modele = 'Bonjour {contact}, devis {numero}.';
    expect(versModele(remplirModele(modele, champs), champs)).toBe(modele);
  });
});

describe('numerosDuDevis', () => {
  it('le contact du devis d’abord, sans doublon de la fiche', () => {
    const client = {
      nom: 'M. Martin', societe: 'SOGEA', telephone: '01 23 45 67 89', telephoneMobile: '06.11.22.33.44',
      contacts: [{ id: 'c1', prenom: 'Jean', nom: 'Dupont', telephoneMobile: '0611223344' }],
    } as unknown as Client;
    expect(numerosDuDevis({ contactId: 'c1' }, client)).toEqual([
      { libelle: 'Jean Dupont — mobile', numero: '0611223344' },
      { libelle: 'SOGEA', numero: '01 23 45 67 89' },
    ]);
  });
});

describe('champsRelance', () => {
  it('prend le contact du devis, sinon le nom de la fiche', () => {
    const client = { nom: 'M. Martin', societe: 'SOGEA', contacts: [{ id: 'c1', prenom: 'Jean', nom: 'Dupont' }] } as unknown as Client;
    const d = { numero: 'D1', contactId: 'c1', dateEnvoi: '2026-10-02', dateValidite: '2026-11-01' } as Devis;
    expect(champsRelance(d, client, '10 €').contact).toBe('Jean Dupont');
    expect(champsRelance({ ...d, contactId: undefined }, client, '10 €').contact).toBe('M. Martin');
    expect(champsRelance(d, client, '10 €').dateEnvoi).toBe('02/10/2026');
  });
});
