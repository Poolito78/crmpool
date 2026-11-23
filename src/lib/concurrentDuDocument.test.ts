import { describe, it, expect } from 'vitest';
import { concurrentDuDocument, normaliserNom } from './concurrentDuDocument';

const concurrents = [
  { id: 'c1', nom: 'Signaux Girod' },
  { id: 'c2', nom: 'Lacroix City' },
  { id: 'c3', nom: 'SES' },
  { id: 'c4', nom: 'Aximum SAS' },
];
const fournisseurs = [{ nom: 'AXIMUM' }, { nom: 'TTS' }];

describe('concurrentDuDocument', () => {
  it('reconnaît le partenaire lu par l’IA', () => {
    expect(concurrentDuDocument('', 'SIGNAUX GIROD SAS', concurrents, fournisseurs)?.id).toBe('c1');
  });

  it('reconnaît l’émetteur dans l’en-tête du texte', () => {
    const texte = 'LACROIX CITY — 8 impasse du Bourrelier\nDEVIS N° 2026-118\nClient : MAIRIE DE MACON';
    expect(concurrentDuDocument(texte, 'Mairie de Mâcon', concurrents, fournisseurs)?.id).toBe('c2');
  });

  it('ignore un nom trop court, qui se trouverait partout', () => {
    expect(concurrentDuDocument('Panneaux SES et accessoires', undefined, concurrents, fournisseurs)).toBeUndefined();
  });

  it('un concurrent qui est aussi fournisseur reste côté achats', () => {
    expect(concurrentDuDocument('AXIMUM\nDevis', 'Aximum', concurrents, fournisseurs)).toBeUndefined();
  });

  it('ne cherche pas un nom au milieu d’un mot', () => {
    expect(concurrentDuDocument('Signaux Girodet', undefined, concurrents, fournisseurs)).toBeUndefined();
  });

  it('ne lit que l’en-tête', () => {
    const texte = 'TOP SIGNALISATION\n' + 'x '.repeat(1000) + '\nComparé à Lacroix City';
    expect(concurrentDuDocument(texte, undefined, concurrents, fournisseurs)).toBeUndefined();
  });

  it('normaliserNom retire accents et ponctuation', () => {
    expect(normaliserNom('  Société Générale-Signalisation ')).toBe('societe generale signalisation');
  });
});
