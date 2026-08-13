import { describe, it, expect } from 'vitest';
import { societeDepuisEmail } from './chiffrage';

describe('société déduite de l’adresse de l’expéditeur', () => {
  it('retrouve la société sur le cas qui avait échoué', () => {
    // Le message venait de thierry@reflex-signalisation.fr et était signé
    // « Manue » — le prénom de la destinataire. C'est ce prénom que le modèle
    // avait retenu comme nom de client.
    expect(societeDepuisEmail('thierry@reflex-signalisation.fr'))
      .toBe('reflex signalisation');
  });

  it('ignore les sous-domaines et garde le libellé porteur', () => {
    expect(societeDepuisEmail('a.b@agence.reflex-signalisation.fr'))
      .toBe('reflex signalisation');
    expect(societeDepuisEmail('contact@agilis-tp.com')).toBe('agilis tp');
  });

  it('ne dit rien des messageries grand public', () => {
    // Un client qui écrit depuis Gmail ne s'appelle pas « gmail ».
    for (const e of ['jean@gmail.com', 'p@orange.fr', 'x@wanadoo.fr',
                     'y@free.fr', 'z@outlook.com', 'w@yahoo.fr']) {
      expect(societeDepuisEmail(e)).toBe('');
    }
  });

  it('ne dit rien de nos propres domaines', () => {
    expect(societeDepuisEmail('f.mouhot@isosign.fr')).toBe('');
    expect(societeDepuisEmail('resine@isofloor.fr')).toBe('');
  });

  it('supporte l’absence d’adresse', () => {
    expect(societeDepuisEmail(undefined)).toBe('');
    expect(societeDepuisEmail('pas une adresse')).toBe('');
    expect(societeDepuisEmail('sansdomaine@')).toBe('');
  });
});
