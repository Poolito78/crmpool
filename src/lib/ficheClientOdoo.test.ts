import { describe, it, expect } from 'vitest';
import {
  classerPartenaires, separerNomPrenom, delaiDepuisConditions, clientDejaConnu,
  remplirDepuisOdoo, contactsProposes, type FicheClientOdoo, type FicheOdoo, type FormClient,
} from './ficheClientOdoo';
import type { PartenaireOdoo } from './fournisseurOdoo';
import type { Client } from './store';

const part = (p: Partial<PartenaireOdoo>): PartenaireOdoo => ({
  id: 1, nom: '', email: '', ville: '', codePostal: '', adresse: '', telephone: '', mobile: '',
  tva: '', estSociete: false, societeMere: '', contrat: '', ...p,
});
const fo = (p: Partial<FicheOdoo>): FicheOdoo => ({
  id: 10, nom: 'COLAS', email: 'contact@colas.fr', telephone: '02 99 00 00 00', mobile: '', adresse: '1 rue A',
  adresse2: 'ZI Nord', codePostal: '35000', ville: 'RENNES', pays: 'France', tva: 'FR12345678901', siret: '123 456 789 00012',
  siteWeb: '', conditionsReglement: '45 jours fin de mois', listePrix: 'TARIF R3', fonction: '', reference: '',
  estSociete: true, type: 'contact', ...p,
});
const vide: FormClient = {
  nom: '', email: '', telephone: '', telephoneMobile: '', adresse: '', ville: '', codePostal: '', societe: '', notes: '',
  adressesLivraison: [], estRevendeur: false, remisesParCategorie: {}, contacts: [], delaiReglement: '45J FDM',
};
let n = 0;
const id = () => `c${++n}`;

describe('classerPartenaires', () => {
  it('garde les fiches qui portent tous les mots, dans n\'importe quel ordre', () => {
    const r = classerPartenaires('jean dupont colas', [
      part({ id: 1, nom: 'Jean MARTIN', societeMere: 'COLAS' }),
      part({ id: 2, nom: 'DUPONT Jean', societeMere: 'COLAS' }),
      part({ id: 3, nom: 'COLAS', estSociete: true }),
    ]);
    expect(r.map(p => p.id)).toEqual([2]);
  });

  it('sans fiche complète, classe par part de mots, sociétés d\'abord', () => {
    const r = classerPartenaires('colas rennes', [
      part({ id: 1, nom: 'Paul COLAS' }),
      part({ id: 2, nom: 'COLAS OUEST', estSociete: true }),
    ]);
    expect(r.map(p => p.id)).toEqual([2, 1]);
  });

  it('accents et casse ne comptent pas, doublons retirés', () => {
    const r = classerPartenaires('helene', [part({ id: 1, nom: 'Hélène ROY' }), part({ id: 1, nom: 'Hélène ROY' })]);
    expect(r).toHaveLength(1);
  });
});

describe('separerNomPrenom', () => {
  it('le mot en capitales est le nom', () => {
    expect(separerNomPrenom('Jean DUPONT')).toEqual({ prenom: 'Jean', nom: 'DUPONT' });
    expect(separerNomPrenom('DUPONT Jean-Pierre')).toEqual({ prenom: 'Jean-Pierre', nom: 'DUPONT' });
    expect(separerNomPrenom('M. Yahia ARBANE')).toEqual({ prenom: 'Yahia', nom: 'ARBANE' });
  });
  it('sans casse pour départager, rien n\'est deviné', () => {
    expect(separerNomPrenom('JEAN DUPONT')).toEqual({ prenom: '', nom: 'JEAN DUPONT' });
    expect(separerNomPrenom('Jean Dupont')).toEqual({ prenom: '', nom: 'Jean Dupont' });
  });
});

describe('delaiDepuisConditions', () => {
  it('ramène aux options de MonCRM, sinon rien', () => {
    expect(delaiDepuisConditions('45 jours fin de mois')).toBe('45J FDM');
    expect(delaiDepuisConditions('30 Jours')).toBe('30J');
    expect(delaiDepuisConditions('Paiement immédiat')).toBe('Comptant');
    expect(delaiDepuisConditions('60 jours')).toBe('');
    expect(delaiDepuisConditions('')).toBe('');
  });
});

const fiche = (p: Partial<FicheClientOdoo> = {}): FicheClientOdoo => ({
  societe: fo({}),
  choisi: fo({ id: 11, nom: 'Jean DUPONT', estSociete: false, email: 'j.dupont@colas.fr', fonction: 'Conducteur de travaux' }),
  contacts: [
    { id: 11, nom: 'Jean DUPONT', fonction: 'Conducteur de travaux', email: 'j.dupont@colas.fr', telephone: '', mobile: '06' },
    { id: 12, nom: 'Anne LEROY', fonction: 'Assistante', email: 'a.leroy@colas.fr', telephone: '', mobile: '' },
  ],
  ...p,
});

describe('remplirDepuisOdoo', () => {
  it('client neuf : la société, l\'adresse, la TVA, le SIRET, le délai, les contacts cochés', () => {
    const f = remplirDepuisOdoo(vide, fiche(), [fiche().contacts[0]], true, id);
    expect(f).toMatchObject({
      societe: 'COLAS', adresse: '1 rue A, ZI Nord', codePostal: '35000', ville: 'RENNES',
      tvaIntra: 'FR12345678901', siret: '12345678900012', delaiReglement: '45J FDM', listePrixOdoo: 'TARIF R3',
    });
    expect(f.contacts).toHaveLength(1);
    expect(f.contacts![0]).toMatchObject({ prenom: 'Jean', nom: 'DUPONT', fonction: 'Conducteur de travaux', telephoneMobile: '06' });
    expect(f.notes).toContain('partenaire #10');
  });

  it('fiche existante : seuls les champs vides, contacts sans doublon, délai intact', () => {
    const avant: FormClient = {
      ...vide, societe: 'Colas Rennes', ville: 'Rennes', delaiReglement: '30J',
      contacts: [{ id: 'x', nom: 'DUPONT', prenom: 'Jean', email: 'J.Dupont@colas.fr' }],
    };
    const f = remplirDepuisOdoo(avant, fiche(), fiche().contacts, false, id);
    expect(f.societe).toBe('Colas Rennes');
    expect(f.ville).toBe('Rennes');
    expect(f.codePostal).toBe('35000');
    expect(f.delaiReglement).toBe('30J');
    expect(f.contacts!.map(c => c.nom)).toEqual(['DUPONT', 'LEROY']);
  });

  it('un champ vide chez Odoo ne vide rien, la trace n\'est pas doublée', () => {
    const avant: FormClient = { ...vide, siret: '999', notes: 'Fiche reprise du fichier Odoo (partenaire #10).' };
    const f = remplirDepuisOdoo(avant, fiche({ societe: fo({ siret: '' }) }), [], true, id);
    expect(f.siret).toBe('999');
    expect(f.notes).toBe('Fiche reprise du fichier Odoo (partenaire #10).');
  });
});

describe('contactsProposes / clientDejaConnu', () => {
  it('la personne cherchée passe en tête', () => {
    const f = fiche({ choisi: fo({ id: 12, nom: 'Anne LEROY', estSociete: false }) });
    expect(contactsProposes(f).map(c => c.id)).toEqual([12, 11]);
  });

  it('retrouve le client par TVA, courriel ou raison sociale', () => {
    const c = (p: Partial<Client>): Client => ({ id: 'k', dateCreation: '', ...vide, ...p } as Client);
    expect(clientDejaConnu(fiche(), [c({ tvaIntra: 'FR 12345678901' })])?.id).toBe('k');
    expect(clientDejaConnu(fiche(), [c({ contacts: [{ id: 'a', nom: 'X', email: 'J.DUPONT@colas.fr' }] })])?.id).toBe('k');
    expect(clientDejaConnu(fiche(), [c({ societe: 'Colas' })])?.id).toBe('k');
    expect(clientDejaConnu(fiche(), [c({ societe: 'Eurovia' })])).toBeUndefined();
  });
});
