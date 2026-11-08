import { describe, expect, it } from 'vitest';
import { coupeSignatures } from './chiffrage';
import { contactDuSignataire, contactNommeDansTexte } from './contactAffaire';

const CEDRIC = { nom: 'M. Cédric BAEHREL' };
const JULIE = { nom: 'Julie MARTIN' };
const CONTACTS = [JULIE, CEDRIC];

describe('le contact de l’affaire', () => {
  it('l’image de signature prime, puis la ligne « De : »', () => {
    expect(contactDuSignataire(CONTACTS, ['Julie Martin', 'Cédric BAEHREL'])).toBe(JULIE);
    expect(contactDuSignataire(CONTACTS, [undefined, 'BAEHREL Cédric'])).toBe(CEDRIC);
    expect(contactDuSignataire(CONTACTS, [undefined, 'Top Signalisation'])).toBeUndefined();
  });

  it('retrouve le signataire écrit en texte, malgré la civilité et les accents', () => {
    const mail = 'peux tu me faire un devis stp\n\nCordialement\n\nCedric BAEHREL\nConducteur de travaux';
    expect(contactNommeDansTexte(CONTACTS, mail)).toBe(CEDRIC);
  });

  it('le nom est dans la signature, que l’analyse retire : il faut lire le mail complet', () => {
    const mail = 'Salut François,\n\npeux tu me faire un devis stp\n\nCordialement\n\nCédric BAEHREL\nConducteur de travaux';
    expect(contactNommeDansTexte(CONTACTS, coupeSignatures(mail))).toBeUndefined();
    expect(contactNommeDansTexte(CONTACTS, mail)).toBe(CEDRIC);
  });

  it('exige le nom entier et une seule réponse', () => {
    expect(contactNommeDansTexte(CONTACTS, 'Bonjour Cédric')).toBeUndefined();
    expect(contactNommeDansTexte(CONTACTS, 'Cédric BAEHREL et Julie MARTIN')).toBeUndefined();
    expect(contactNommeDansTexte([{ nom: 'Service achats' }], 'le service achats')).toEqual({ nom: 'Service achats' });
  });
});
