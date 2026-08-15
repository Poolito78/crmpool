import { describe, it, expect } from 'vitest';
import { adresseGenerique, memePersonne, societeDepuisEmail } from './chiffrage';

describe('boîtes partagées', () => {
  it('reconnaît l’adresse générique de la signature REFLEX', () => {
    // Le bloc porte « Thierry BARAILLER » au-dessus de cette adresse. S'en
    // servir pour identifier la personne ramenait l'assistante qui tient la
    // boîte, et c'est ainsi que « Manue » se retrouvait contact de l'affaire.
    expect(adresseGenerique('contact@reflex-signalisation.fr')).toBe(true);
  });

  it('couvre les autres boîtes de service courantes', () => {
    for (const e of ['info@x.fr', 'devis@x.fr', 'compta@x.fr', 'achats@x.fr',
                     'commande@x.fr', 'sav@x.fr', 'no-reply@x.fr',
                     'secretariat@x.fr', 'exploitation@x.fr']) {
      expect(adresseGenerique(e)).toBe(true);
    }
  });

  it('laisse passer une adresse nominative', () => {
    for (const e of ['thierry@reflex-signalisation.fr',
                     't.barailler@reflex-signalisation.fr',
                     'gbrugel@agilis.net']) {
      expect(adresseGenerique(e)).toBe(false);
    }
  });

  it('n’empêche pas d’en déduire la société', () => {
    // Générique pour la personne, mais parfaitement bon pour l'entreprise.
    expect(societeDepuisEmail('contact@reflex-signalisation.fr'))
      .toBe('reflex signalisation');
  });
});

describe('même personne', () => {
  it('reconnaît le signataire quel que soit l’ordre du nom', () => {
    expect(memePersonne('Thierry BARAILLER', 'BARAILLER Thierry')).toBe(true);
    expect(memePersonne('BARAILLER Thierry', 'Thierry Barailler')).toBe(true);
  });

  it('ne confond pas deux personnes différentes', () => {
    expect(memePersonne('Thierry BARAILLER', 'Manue DUPONT')).toBe(false);
    expect(memePersonne('Thierry BARAILLER', 'Emmanuelle LEROY')).toBe(false);
  });

  it('exige un mot assez long — un prénom court ne tranche pas', () => {
    // « Luc » fait trois lettres : deux Luc différents ne doivent pas se
    // confondre sur ce seul mot.
    expect(memePersonne('Luc MARTIN', 'Luc DUBOIS')).toBe(false);
    expect(memePersonne('Luc MARTIN', 'MARTIN Luc')).toBe(true);
  });

  it('supporte l’absence de nom', () => {
    expect(memePersonne(undefined, 'Thierry BARAILLER')).toBe(false);
    expect(memePersonne('Thierry BARAILLER', '')).toBe(false);
  });
});
