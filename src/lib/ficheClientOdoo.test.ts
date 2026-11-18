import { describe, it, expect } from 'vitest';
import {
  classerPartenaires, separerNomPrenom, delaiDepuisConditions, clientDejaConnu,
  remplirDepuisOdoo, contactsProposes, adressesProposees, choixAdressesParDefaut,
  type FicheClientOdoo, type FicheOdoo, type FormClient, type AdresseOdoo,
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
    expect(delaiDepuisConditions('45JRSFDM')).toBe('45J FDM');
    expect(delaiDepuisConditions('30JRS')).toBe('30J');
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

  it('« (Vide) » n\'est pas une fonction', () => {
    const f = remplirDepuisOdoo(vide, fiche(), [{ id: 5, nom: 'Martial MARLIERE', fonction: '(Vide)', email: '', telephone: '', mobile: '' }], true, id);
    expect(f.contacts![0].fonction).toBe('');
  });

  it('un champ vide chez Odoo ne vide rien, la trace n\'est pas doublée', () => {
    const avant: FormClient = { ...vide, siret: '999', notes: 'Fiche reprise du fichier Odoo (partenaire #10).' };
    const f = remplirDepuisOdoo(avant, fiche({ societe: fo({ siret: '' }) }), [], true, id);
    expect(f.siret).toBe('999');
    expect(f.notes).toBe('Fiche reprise du fichier Odoo (partenaire #10).');
  });
});

describe('adresses de facturation et de livraison', () => {
  const ad = (p: Partial<AdresseOdoo>): AdresseOdoo => ({
    id: 0, type: 'delivery', nom: '', adresse: '', adresse2: '', codePostal: '', ville: '', telephone: '', email: '', ...p,
  });
  const empreinte = (): FicheClientOdoo => fiche({
    societe: fo({ id: 74242, nom: 'EMPREINTE SIGNA', adresse: 'CHEMIN DE CERNAY', adresse2: '', codePostal: '51450', ville: 'BETHENY' }),
    choisi: fo({ id: 74242, nom: 'EMPREINTE SIGNA' }),
    contacts: [],
    adresses: [
      ad({ id: 92834, type: 'delivery', nom: 'EMPREINTE SIGNA GUISE', adresse: '3 RUE DU DEPOT', codePostal: '02120', ville: 'GUISE' }),
      ad({ id: 101860, type: 'invoice', nom: 'EMPREINTE SIGNALISATION', adresse: '3 RUE DU DEPOT', adresse2: 'BP 12', codePostal: '02120', ville: 'GUISE' }),
      ad({ id: 5, type: 'private', nom: 'Privé', adresse: 'x', ville: 'y' }),
    ],
  });

  it('par défaut : facturation Odoo en adresse principale, siège et livraison repris', () => {
    const f = empreinte();
    expect(adressesProposees(f).map(a => a.type)).toEqual(['societe', 'invoice', 'delivery']);
    expect(choixAdressesParDefaut(f)).toEqual({ facturation: 101860, reprises: [74242, 92834] });
  });

  it('la fiche CRM : facturation en principale, une seule fiche avec ses adresses', () => {
    const r = remplirDepuisOdoo(vide, empreinte(), [], true, id);
    expect(r).toMatchObject({ societe: 'EMPREINTE SIGNA', adresse: '3 RUE DU DEPOT, BP 12', codePostal: '02120', ville: 'GUISE' });
    expect(r.adressesLivraison.map(a => [a.libelle, a.type, a.ville, a.parDefaut])).toEqual([
      ['Siège — BETHENY', 'livraison', 'BETHENY', true],
      ['EMPREINTE SIGNA GUISE', 'livraison', 'GUISE', false],
    ]);
  });

  it('sans adresse de facturation fille : la société reste principale', () => {
    const f = { ...empreinte(), adresses: [empreinte().adresses![0]] };
    const r = remplirDepuisOdoo(vide, f, [], true, id);
    expect(r).toMatchObject({ adresse: 'CHEMIN DE CERNAY', ville: 'BETHENY' });
    expect(r.adressesLivraison).toHaveLength(1);
  });

  it('adresse décochée non reprise ; adresse déjà connue non doublée', () => {
    const r = remplirDepuisOdoo(vide, empreinte(), [], true, id, { facturation: 74242, reprises: [101860] });
    expect(r.ville).toBe('BETHENY');
    expect(r.adressesLivraison.map(a => [a.type, a.adresse])).toEqual([['facturation', '3 RUE DU DEPOT, BP 12']]);
    const existant: FormClient = { ...vide, adresse: 'Chemin de Cernay', codePostal: '51450', ville: 'Bétheny',
      adressesLivraison: [{ id: 'a', libelle: 'Dépôt', adresse: '3 rue du Dépôt', codePostal: '02120', ville: 'Guise', parDefaut: true, type: 'livraison' }] };
    const r2 = remplirDepuisOdoo(existant, empreinte(), [], false, id);
    expect(r2.adresse).toBe('Chemin de Cernay');
    expect(r2.adressesLivraison.map(a => a.libelle)).toEqual(['Dépôt', 'EMPREINTE SIGNALISATION']);
    expect(r2.adressesLivraison[1].type).toBe('facturation');
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
