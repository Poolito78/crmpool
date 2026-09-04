import { describe, it, expect } from 'vitest';
import { rattacherContact, nomComplet, type ContactSource } from './contactAffaire';
import type { Contact } from './store';

let n = 0;
const nouvelId = () => `ct${++n}`;

function contact(c: Partial<Contact> & { id: string; nom: string }): Contact {
  return { ...c };
}

describe('nom complet', () => {
  it('met le prénom devant', () => {
    expect(nomComplet({ nom: 'BARAILLER', prenom: 'Thierry' })).toBe('Thierry BARAILLER');
    expect(nomComplet({ nom: 'Thierry BARAILLER' })).toBe('Thierry BARAILLER');
  });
});

describe('rattachement d’un interlocuteur', () => {
  const source: ContactSource = {
    nom: 'Thierry BARAILLER',
    fonction: 'Responsable achats',
    email: 'T.BARAILLER@reflex-signalisation.fr',
    telephone: '02 38 00 00 00',
    mobile: '06 00 00 00 00',
  };

  it('crée le contact quand le client n’en a aucun', () => {
    const r = rattacherContact([], source, nouvelId);
    expect(r.modifie).toBe(true);
    expect(r.contacts).toHaveLength(1);
    expect(r.contactId).toBe(r.contacts[0].id);
    expect(r.contacts[0].nom).toBe('Thierry BARAILLER');
    expect(r.contacts[0].fonction).toBe('Responsable achats');
  });

  /* LE PREMIER CONTACT D'UN CLIENT NEUF REÇOIT LA FACTURATION : sans lui, le
     devis retombe sur « le premier de la liste » — c'est-à-dire lui, mais par
     hasard, et ça cesse d'être vrai au deuxième contact ajouté. */
  it('désigne le premier contact pour la facturation, mais pas les suivants', () => {
    const premier = rattacherContact([], source, nouvelId);
    expect(premier.contacts[0].facturation).toBe(true);
    const second = rattacherContact(premier.contacts, { nom: 'Manue LEROY' }, nouvelId);
    expect(second.contacts[1].facturation).toBeUndefined();
  });

  it('ne fait rien sans interlocuteur désigné', () => {
    const existants = [contact({ id: 'a', nom: 'Jean MARTIN' })];
    for (const vide of [null, undefined, { nom: '' }, { nom: '   ' }]) {
      const r = rattacherContact(existants, vide as ContactSource | null, nouvelId);
      expect(r.modifie).toBe(false);
      expect(r.contactId).toBeUndefined();
      expect(r.contacts).toEqual(existants);
    }
  });

  /* LE DOUBLON EST LE VRAI RISQUE : la même personne revient sur chaque
     demande. Dix « Thierry BARAILLER » dans la liste et le devis suivant ne
     sait plus lequel désigner. */
  it('réutilise le contact existant reconnu par son adresse', () => {
    const existants = [contact({
      id: 'a', nom: 'T. BARAILLER', email: 't.barailler@reflex-signalisation.FR',
    })];
    const r = rattacherContact(existants, source, nouvelId);
    expect(r.contacts).toHaveLength(1);
    expect(r.contactId).toBe('a');
  });

  it('réutilise le contact existant reconnu par son nom, à défaut d’adresse', () => {
    const existants = [contact({ id: 'a', nom: 'BARAILLER', prenom: 'Thierry' })];
    const r = rattacherContact(existants, source, nouvelId);
    expect(r.contacts).toHaveLength(1);
    expect(r.contactId).toBe('a');
  });

  /* L'ADRESSE TRANCHE, LE NOM NON : deux MARTIN dans la même société est
     banal, deux adresses identiques ne l'est pas. */
  it('préfère la correspondance d’adresse à celle de nom', () => {
    const existants = [
      contact({ id: 'nom', nom: 'Thierry BARAILLER' }),
      contact({ id: 'mail', nom: 'Accueil', email: 't.barailler@reflex-signalisation.fr' }),
    ];
    expect(rattacherContact(existants, source, nouvelId).contactId).toBe('mail');
  });

  /* ON COMPLÈTE, ON N'ÉCRASE PAS : la ligne directe saisie à la main vaut
     mieux que le standard qu'Odoo renvoie. */
  it('remplit les champs vides sans toucher aux champs saisis', () => {
    const existants = [contact({
      id: 'a', nom: 'Thierry BARAILLER', telephone: '02 38 11 22 33',
    })];
    const r = rattacherContact(existants, source, nouvelId);
    expect(r.modifie).toBe(true);
    expect(r.contacts[0].telephone).toBe('02 38 11 22 33');
    expect(r.contacts[0].email).toBe('T.BARAILLER@reflex-signalisation.fr');
    expect(r.contacts[0].fonction).toBe('Responsable achats');
  });

  it('n’annonce aucune modification quand la fiche est déjà complète', () => {
    const existants = [contact({
      id: 'a', nom: 'Thierry BARAILLER',
      email: 'T.BARAILLER@reflex-signalisation.fr',
      telephone: '02 38 00 00 00', telephoneMobile: '06 00 00 00 00',
      fonction: 'Responsable achats',
    })];
    const r = rattacherContact(existants, source, nouvelId);
    expect(r.modifie).toBe(false);
    expect(r.contactId).toBe('a');
  });

  it('ne modifie pas le tableau reçu', () => {
    const existants = [contact({ id: 'a', nom: 'Jean MARTIN' })];
    rattacherContact(existants, { nom: 'Sophie DUPONT' }, nouvelId);
    expect(existants).toHaveLength(1);
  });
});
