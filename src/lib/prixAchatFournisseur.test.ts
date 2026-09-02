import { describe, it, expect } from 'vitest';
import {
  rapprocherFournisseur, coefficientVente, proposerPrix, prixVenteDepuisAchat,
} from './prixAchatFournisseur';
import type { Produit, ProduitFournisseur, Fournisseur } from './store';

function fournisseur(nom: string, societe = ''): Fournisseur {
  return {
    id: nom, nom, societe, email: '', telephone: '', adresse: '', ville: '',
    codePostal: '', francoPort: 0, coutTransport: 0, delaiReglement: '',
    dateCreation: '2026-01-01',
  };
}

function produit(p: Partial<Produit> & { id: string }): Produit {
  return {
    reference: p.id, description: '', prixAchat: 0, prixHT: 0, unite: 'U',
    stock: 0, stockMin: 0, coefficient: 1, coeffRevendeur: 1, remiseRevendeur: 0,
    prixRevendeur: 0, tva: 20, dateCreation: '2026-01-01', ...p,
  };
}

function lien(p: Partial<ProduitFournisseur> & { produitId: string; fournisseurId: string }): ProduitFournisseur {
  return {
    id: `${p.produitId}-${p.fournisseurId}`, prixAchat: 0, referenceFournisseur: '',
    delaiLivraison: 0, conditionnementMin: 1, estPrioritaire: false, ...p,
  };
}

describe('reconnaissance du fournisseur', () => {
  const CATALOGUE = [
    fournisseur('Tremco CPG'),
    fournisseur('Flowcrete France'),
    fournisseur('Signaux Girod'),
  ];

  it('ignore la forme juridique et le pays', () => {
    expect(rapprocherFournisseur('TREMCO CPG FRANCE SAS', CATALOGUE)?.nom).toBe('Tremco CPG');
    expect(rapprocherFournisseur('Flowcrete', CATALOGUE)?.nom).toBe('Flowcrete France');
  });

  it('retrouve le fournisseur par sa raison sociale', () => {
    const avecSociete = [fournisseur('Dupont', 'ISOCHEMIE SARL')];
    expect(rapprocherFournisseur('Isochemie', avecSociete)?.nom).toBe('Dupont');
  });

  /* « FRANCE » à lui seul rapprocherait Flowcrete France de n'importe quelle
     société française : le mot ne distingue rien. */
  it('ne reconnaît rien sur un mot qui ne distingue pas', () => {
    expect(rapprocherFournisseur('BÉTONS DE FRANCE SAS', CATALOGUE)).toBeUndefined();
    expect(rapprocherFournisseur('SA', CATALOGUE)).toBeUndefined();
    expect(rapprocherFournisseur('', CATALOGUE)).toBeUndefined();
    expect(rapprocherFournisseur('Tremco', [])).toBeUndefined();
  });

  /* Deux fournisseurs qui répondent aussi bien l'un que l'autre : le choix
     revient à l'utilisateur, pas au hasard de l'ordre du tableau. */
  it('s’abstient quand deux fournisseurs se valent', () => {
    const jumeaux = [fournisseur('Sika Bâtiment'), fournisseur('Sika Industrie')];
    expect(rapprocherFournisseur('SIKA', jumeaux)).toBeUndefined();
  });
});

describe('coefficient de vente mesuré sur le catalogue', () => {
  /* Les résines, telles que la base les porte : EPOXY tient à 2,286 d'un
     article à l'autre. */
  const RESINES = [
    produit({ id: 'e1', categorie: 'EPOXY', prixAchat: 100, prixHT: 228.6 }),
    produit({ id: 'e2', categorie: 'EPOXY', prixAchat: 50, prixHT: 114.3 }),
    produit({ id: 'e3', categorie: 'EPOXY', prixAchat: 200, prixHT: 457.2 }),
    produit({ id: 'e4', categorie: 'EPOXY', prixAchat: 80, prixHT: 182.9 }),
    produit({ id: 'e5', categorie: 'EPOXY', prixAchat: 120, prixHT: 274.3 }),
  ];

  it('mesure le coefficient et le déclare fiable quand la famille s’accorde', () => {
    const c = coefficientVente(RESINES, 'EPOXY')!;
    expect(c.coef).toBeCloseTo(2.286, 2);
    expect(c.effectif).toBe(5);
    expect(c.fiable).toBe(true);
  });

  /* LE CAS QUI INTERDIT DE FAIRE CONFIANCE AVEUGLÉMENT AU CATALOGUE.
     Sur la signalisation, `prix_achat` mélange des coûts à l'unité et au
     kilo : le premier quartile est à 0,05 et le troisième à 23. Un
     coefficient tiré de là serait absurde. */
  it('refuse un coefficient quand la famille ne s’accorde pas', () => {
    const incoherent = [
      produit({ id: 's1', categorie: 'PANNEAUX', prixAchat: 100, prixHT: 5 }),
      produit({ id: 's2', categorie: 'PANNEAUX', prixAchat: 100, prixHT: 300 }),
      produit({ id: 's3', categorie: 'PANNEAUX', prixAchat: 100, prixHT: 2300 }),
      produit({ id: 's4', categorie: 'PANNEAUX', prixAchat: 100, prixHT: 12 }),
      produit({ id: 's5', categorie: 'PANNEAUX', prixAchat: 100, prixHT: 1800 }),
    ];
    const c = coefficientVente(incoherent, 'PANNEAUX')!;
    expect(c.fiable).toBe(false);
    // Et rien n'en sort : pas de prix de vente inventé.
    expect(prixVenteDepuisAchat(100, c)).toBeUndefined();
  });

  it('remonte au dernier segment quand la catégorie précise est trop maigre', () => {
    // « ISOMARK / FLOORING / EPOXY » n'a qu'un article ; « EPOXY » en a cinq.
    const melange = [
      ...RESINES,
      produit({ id: 'x', categorie: 'ISOMARK / FLOORING / EPOXY', prixAchat: 10, prixHT: 23 }),
    ];
    const c = coefficientVente(melange, 'ISOMARK / FLOORING / EPOXY')!;
    expect(c.categorie).toBe('EPOXY');
    expect(c.effectif).toBe(5);
  });

  it('ne mesure rien sans catégorie ni échantillon', () => {
    expect(coefficientVente(RESINES, undefined)).toBeNull();
    expect(coefficientVente(RESINES, 'MMA')).toBeNull();
    expect(coefficientVente([], 'EPOXY')).toBeNull();
  });

  it('applique le coefficient et arrondit au centime', () => {
    const c = coefficientVente(RESINES, 'EPOXY')!;
    expect(prixVenteDepuisAchat(86.82, c)).toBeCloseTo(198.47, 2);
    expect(prixVenteDepuisAchat(0, c)).toBeUndefined();
    expect(prixVenteDepuisAchat(100, null)).toBeUndefined();
  });
});

describe('proposition par ligne', () => {
  const HYDRASEAL = produit({
    id: 'p-hydra', reference: 'HYDRASEAL', categorie: 'EPOXY',
    prixAchat: 86.82, prixHT: 264.70,
  });
  const PRODUITS = [
    HYDRASEAL,
    produit({ id: 'e2', categorie: 'EPOXY', prixAchat: 50, prixHT: 114.3 }),
    produit({ id: 'e3', categorie: 'EPOXY', prixAchat: 200, prixHT: 457.2 }),
    produit({ id: 'e4', categorie: 'EPOXY', prixAchat: 80, prixHT: 182.9 }),
    produit({ id: 'e5', categorie: 'EPOXY', prixAchat: 120, prixHT: 274.3 }),
  ];
  const LIENS = [lien({ produitId: 'p-hydra', fournisseurId: 'f-tremco', prixAchat: 86.82 })];

  it('dit « actualiser » et chiffre la hausse quand le prix bouge', () => {
    const p = proposerPrix({
      indice: 0, prixLu: 92.50, produit: HYDRASEAL,
      fournisseurId: 'f-tremco', liens: LIENS, produits: PRODUITS,
    });
    expect(p.action).toBe('actualiser');
    expect(p.prixLien).toBeCloseTo(86.82);
    expect(p.ecartLien).toBeCloseTo(6.54, 1);   // +6,5 %
    expect(p.ecartArticle).toBeCloseTo(6.54, 1);
  });

  /* Une reprise de tarif où rien n'a bougé ne doit pas produire d'écriture :
     elle réécrirait la date de mise à jour et ferait croire à un changement
     dans l'historique des prix. */
  it('dit « inchangé » au demi-centime près', () => {
    const p = proposerPrix({
      indice: 0, prixLu: 86.821, produit: HYDRASEAL,
      fournisseurId: 'f-tremco', liens: LIENS, produits: PRODUITS,
    });
    expect(p.action).toBe('inchange');
  });

  it('dit « rattacher » quand l’article existe mais pas chez ce fournisseur', () => {
    const p = proposerPrix({
      indice: 0, prixLu: 92.50, produit: HYDRASEAL,
      fournisseurId: 'f-autre', liens: LIENS, produits: PRODUITS,
    });
    expect(p.action).toBe('rattacher');
    expect(p.prixLien).toBeUndefined();
    expect(p.ecartLien).toBeUndefined();
    // La fiche article, elle, a un prix : la comparaison reste possible.
    expect(p.ecartArticle).toBeCloseTo(6.54, 1);
  });

  it('dit « absent » quand aucun article ne correspond', () => {
    const p = proposerPrix({
      indice: 3, prixLu: 42, produit: undefined,
      fournisseurId: 'f-tremco', liens: LIENS, produits: PRODUITS,
    });
    expect(p.action).toBe('absent');
    expect(p.prixLu).toBe(42);
  });

  /* Une ligne de commentaire, un port offert, un total : pas un prix d'achat. */
  it('écarte une ligne sans prix exploitable', () => {
    for (const prixLu of [undefined, null, 0, -5]) {
      expect(proposerPrix({
        indice: 0, prixLu, produit: HYDRASEAL,
        fournisseurId: 'f-tremco', liens: LIENS, produits: PRODUITS,
      }).action).toBe('sans_prix');
    }
  });

  it('joint le coefficient de la famille à la proposition', () => {
    const p = proposerPrix({
      indice: 0, prixLu: 92.50, produit: HYDRASEAL,
      fournisseurId: 'f-tremco', liens: LIENS, produits: PRODUITS,
    });
    expect(p.coefficient?.categorie).toBe('EPOXY');
    expect(p.coefficient?.fiable).toBe(true);
  });
});
