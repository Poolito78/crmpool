import { describe, it, expect } from 'vitest';
import { serie, lignesLegales, marqueDe, societeDuDocument, documentDeLaSociete, emetteurDe, logoDe, type Societe } from './societes';

const isosign: Societe = {
  id: 'iso', code: 'ISOSIGN', raisonSociale: 'ISOSIGN', formeJuridique: 'SAS', capital: '40 000 €',
  adresse: 'ZA du Monay', codePostal: '71210', ville: 'SAINT-EUSÈBE', pays: 'FR', siren: '494922313',
  rcs: 'RCS Chalon-sur-Saône 494922313', ape: '4669B', tvaIntra: 'FR76494922313', telephone: '03 85 77 07 25',
  email: 'isosign@isosign.fr', prefixe: '', odoo: true, actif: true, ordre: 1,
  marques: [{ nom: 'ISOFLOOR', email: 'contact@isofloor.fr' }, { nom: 'ISOSIGN' }, { nom: 'ISOMARK' }, { nom: 'STI' }],
  marqueDefaut: 'ISOFLOOR',
};
const signalise: Societe = {
  id: 'sig', code: 'SIGNALISE', raisonSociale: 'SIGNALISE', pays: 'FR', prefixe: 'SIG', odoo: false,
  actif: true, ordre: 2, marques: [{ nom: '4FLOORS' }], marqueDefaut: '4FLOORS',
};

describe('séries', () => {
  it('ISOSIGN garde ses numéros, les autres sont préfixées', () => {
    expect(serie(isosign, 'DEV', 2026)).toBe('DEV-2026');
    expect(serie(signalise, 'FAC', 2026)).toBe('SIG-FAC-2026');
  });
});

describe('société d’un document', () => {
  it('un document sans société est ISOSIGN', () => {
    expect(societeDuDocument({}, [signalise, isosign])?.code).toBe('ISOSIGN');
    expect(documentDeLaSociete({}, 'iso', 'iso')).toBe(true);
    expect(documentDeLaSociete({ societeId: 'sig' }, 'iso', 'iso')).toBe(false);
  });
});

describe('marque et logo', () => {
  it('marque du document, sinon par défaut ; ISOFLOOR a son logo embarqué', () => {
    expect(marqueDe(isosign, 'ISOSIGN')?.nom).toBe('ISOSIGN');
    expect(marqueDe(isosign)?.nom).toBe('ISOFLOOR');
    expect(logoDe(isosign)).toBeTruthy();
    expect(logoDe(signalise)).toBeUndefined();
  });
});

describe('pied de page', () => {
  it('reprend l’identité, avec l’e-mail de la marque', () => {
    const [l1, l2] = lignesLegales(isosign);
    expect(l1).toContain('ZA du Monay - 71210 SAINT-EUSÈBE');
    expect(l1).toContain('contact@isofloor.fr');
    expect(l2).toBe('SAS au capital de 40 000 € • RCS Chalon-sur-Saône 494922313 • SIREN 494922313 • APE 4669B • TVA FR76494922313');
  });
  it('n’invente rien pour une société à compléter', () => {
    expect(lignesLegales(signalise)).toEqual(['SIGNALISE - France', '']);
  });
  it('émetteur des factures', () => {
    expect(emetteurDe(isosign).siret).toBeNull();
    expect(emetteurDe(signalise).siren).toBe('');
  });
});
