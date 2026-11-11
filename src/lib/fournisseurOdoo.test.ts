import { describe, it, expect } from 'vitest';
import { fournisseurDepuisPartenaire, type PartenaireOdoo } from './fournisseurOdoo';
import type { Fournisseur } from './store';

const partenaire = (p: Partial<PartenaireOdoo> = {}): PartenaireOdoo => ({
  id: 42, nom: 'CHANET PEINTURES', email: 'saisie@gc-coatings.com', ville: 'MONTLOUIS SUR LOIRE', codePostal: '37270',
  adresse: '1 rue X', telephone: '+33 2 47 45 05 84', mobile: '', tva: '', estSociete: true, societeMere: '', contrat: '', ...p,
});
const f = (p: Partial<Fournisseur>): Fournisseur => ({
  id: 'f1', nom: '', email: '', telephone: '', adresse: '', ville: '', codePostal: '', societe: '', francoPort: 0, coutTransport: 0, delaiReglement: '', dateCreation: '', ...p,
});

describe('fournisseurDepuisPartenaire', () => {
  it('recopie la fiche Odoo, conditions commerciales à zéro, id Odoo dans les notes', () => {
    const { fournisseur, existant } = fournisseurDepuisPartenaire(partenaire(), [], () => 'neuf');
    expect(existant).toBe(false);
    expect(fournisseur).toMatchObject({ id: 'neuf', societe: 'CHANET PEINTURES', nom: '', codePostal: '37270', telephone: '+33 2 47 45 05 84', francoPort: 0 });
    expect(fournisseur.notes).toContain('partenaire #42');
  });

  it('un contact rattaché : sa société mère, son nom en contact', () => {
    const { fournisseur } = fournisseurDepuisPartenaire(partenaire({ nom: 'Aurélie BIENVAULT', estSociete: false, societeMere: 'CHANET PEINTURES' }), [], () => 'neuf');
    expect(fournisseur.societe).toBe('CHANET PEINTURES');
    expect(fournisseur.nom).toBe('Aurélie BIENVAULT');
  });

  it('réutilise le fournisseur déjà présent (courriel ou raison sociale)', () => {
    expect(fournisseurDepuisPartenaire(partenaire(), [f({ societe: 'chanet peintures ' })], () => 'neuf')).toMatchObject({ existant: true, fournisseur: { id: 'f1' } });
    expect(fournisseurDepuisPartenaire(partenaire(), [f({ id: 'f2', societe: 'Autre', email: 'SAISIE@gc-coatings.com' })], () => 'neuf').fournisseur.id).toBe('f2');
  });
});
