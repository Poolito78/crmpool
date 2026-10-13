import { describe, it, expect } from 'vitest';
import {
  interpreter, champNomme, optionsDesignees, texteAInserer, dateParlee, chercherDevis,
  variantesReference, resteOriginal, phraseStock,
} from './assistantVocal';

const LIBELLES_ACTION = ['Type', 'Titre *', "Objet de l'action...", 'Client / Prospect', 'Date planifiée', 'Date réalisée', 'Statut', 'Priorité', 'Description / Notes', "Détails de l'action..."];

describe('interpreter', () => {
  it('ouvre une page seulement si la suite EST une page', () => {
    expect(interpreter('Ouvre les devis')).toMatchObject({ kind: 'page', page: { path: '/devis' }, fenetre: false });
    expect(interpreter('va aux clients')).toMatchObject({ kind: 'page', page: { path: '/clients' } });
    expect(interpreter('ouvre les devis fournisseurs')).toMatchObject({ kind: 'page', page: { path: '/devis-fournisseurs' } });
    expect(interpreter('ouvre le stock dans une nouvelle fenêtre')).toMatchObject({ kind: 'page', page: { path: '/stock' }, fenetre: true });
    expect(interpreter('ouvrir le chantier lundi')?.kind).not.toBe('page');
  });

  it('nouvelle tâche, nouvel appel pour un client, nouveau devis', () => {
    expect(interpreter('Nouvelle tâche')).toEqual({ kind: 'nouvelleAction', type: 'tache' });
    expect(interpreter('nouvel appel pour Dupont')).toEqual({ kind: 'nouvelleAction', type: 'appel', client: 'dupont' });
    expect(interpreter('nouveau rendez-vous')).toEqual({ kind: 'nouvelleAction', type: 'rdv' });
    expect(interpreter('nouveau devis')).toEqual({ kind: 'nouveauDevis' });
    expect(interpreter('créer un devis')).toEqual({ kind: 'nouveauDevis' });
  });

  it('cherche un devis', () => {
    expect(interpreter('cherche le devis 112')).toEqual({ kind: 'chercherDevis', requete: '112' });
    expect(interpreter('ouvre le devis Eiffage Pantin')).toEqual({ kind: 'chercherDevis', requete: 'eiffage pantin' });
  });

  it('stock et recherche d\'article, sans happer une note dictée', () => {
    expect(interpreter('stock du produit KC1 800')).toEqual({ kind: 'chercherProduit', requete: 'kc1 800', stock: true });
    expect(interpreter('quel est le stock de ECLIPSE25')).toEqual({ kind: 'chercherProduit', requete: 'eclipse25', stock: true });
    expect(interpreter('combien de ECLIPSE25 en stock')).toEqual({ kind: 'chercherProduit', requete: 'eclipse25', stock: true });
    expect(interpreter("cherche l'article A13A 700")).toEqual({ kind: 'chercherProduit', requete: 'a13a 700', stock: false });
    expect(interpreter('stock à vérifier sur le chantier')).toBeNull();
  });

  it('« numéro 2 » choisit un résultat, « le 2 » reste une date', () => {
    expect(interpreter('ouvre le premier')).toEqual({ kind: 'resultat', rang: 1 });
    expect(interpreter('numéro 2')).toEqual({ kind: 'resultat', rang: 2 });
    expect(interpreter('le 2')).toBeNull();
  });

  it('commandes de fenêtre et de champ', () => {
    expect(interpreter('Valider')).toEqual({ kind: 'valider' });
    expect(interpreter('aller au titre')).toEqual({ kind: 'allerChamp', nom: 'titre' });
    expect(interpreter('va à la description')).toEqual({ kind: 'allerChamp', nom: 'description' });
    expect(interpreter('champ suivant')).toEqual({ kind: 'suivant' });
    expect(interpreter('clique sur envoyer')).toEqual({ kind: 'clic', cible: 'envoyer' });
    expect(interpreter('Rappeler le client pour le chantier')).toBeNull();
  });
});

describe('champNomme', () => {
  it('trouve le champ par son libellé, le plus long d\'abord', () => {
    expect(champNomme('titre', LIBELLES_ACTION)).toEqual({ index: 1, reste: '' });
    expect(champNomme('la description', LIBELLES_ACTION)).toEqual({ index: 8, reste: '' });
    expect(champNomme('notes', LIBELLES_ACTION)).toEqual({ index: 8, reste: '' });
    expect(champNomme('date planifiée 15 mars', LIBELLES_ACTION)).toEqual({ index: 4, reste: '15 mars' });
    expect(champNomme('priorité haute', LIBELLES_ACTION)).toEqual({ index: 7, reste: 'haute' });
    expect(champNomme('client', LIBELLES_ACTION)).toEqual({ index: 3, reste: '' });
  });

  it('« date » seul est ambigu', () => {
    expect(champNomme('date', LIBELLES_ACTION)).toBeNull();
  });
});

describe('optionsDesignees', () => {
  it('l\'égalité l\'emporte, sinon toutes les options qui contiennent le mot', () => {
    expect(optionsDesignees('haute', ['Basse', 'Normale', 'Haute'])).toEqual([2]);
    expect(optionsDesignees('réalisée', ['Planifiée', 'Réalisée', 'Annulée'])).toEqual([1]);
    expect(optionsDesignees('appel', ['🏠 Visite', '📞 Appel', '✉️ Email'])).toEqual([1]);
    expect(optionsDesignees('dupont', ['DUPONT SA', 'Dupont Frères', 'Martin'])).toEqual([0, 1]);
  });
});

describe('dictée', () => {
  it('majuscule en début de phrase, espace de liaison, ponctuation dite', () => {
    expect(texteAInserer('', 'rappeler le client')).toBe('Rappeler le client');
    expect(texteAInserer('Rappeler', 'le client virgule lundi')).toBe(' le client, lundi');
    expect(texteAInserer('Fin.', 'suite')).toBe(' Suite');
    expect(texteAInserer('Ligne 1', 'à la ligne suite')).toBe('\nSuite');
  });

  it('le reste se prend dans la phrase d\'origine', () => {
    expect(resteOriginal("Description Rappeler l'Agence lundi", 1)).toBe("Rappeler l'Agence lundi");
  });
});

describe('dateParlee', () => {
  const auj = new Date(2026, 9, 13); // mardi 13 octobre 2026
  it('relatives', () => {
    expect(dateParlee('demain', auj)).toBe('2026-10-14');
    expect(dateParlee("aujourd'hui", auj)).toBe('2026-10-13');
    expect(dateParlee('dans 2 semaines', auj)).toBe('2026-10-27');
    expect(dateParlee('lundi', auj)).toBe('2026-10-19');
    expect(dateParlee('mardi prochain', auj)).toBe('2026-10-20');
  });
  it('absolues', () => {
    expect(dateParlee('le 15 octobre', auj)).toBe('2026-10-15');
    expect(dateParlee('1er novembre', auj)).toBe('2026-11-01');
    expect(dateParlee('15/12/2026', auj)).toBe('2026-12-15');
    expect(dateParlee('le 20', auj)).toBe('2026-10-20');
    expect(dateParlee('le 5', auj)).toBe('2026-11-05');
  });
  it('ne devine pas', () => {
    expect(dateParlee('bientôt', auj)).toBeNull();
    expect(dateParlee('31 février', auj)).toBeNull();
  });
});

describe('chercherDevis', () => {
  const devis = [
    { id: 'a', numero: 'DEV-2026-112', client: 'EIFFAGE ROUTE', chantier: 'PANTIN', dateCreation: '2026-09-01' },
    { id: 'b', numero: 'DEV-2026-1112', client: 'COLAS', dateCreation: '2026-10-01' },
    { id: 'c', numero: 'DEV-2025-112', client: 'COLAS', dateCreation: '2025-03-01' },
  ];
  it('par numéro : le dernier segment, pas une fin de chaîne', () => {
    expect(chercherDevis(devis, '112').map(d => d.id)).toEqual(['a', 'c']);
    expect(chercherDevis(devis, '2026 112').map(d => d.id)).toEqual(['a']);
  });
  it('par client et chantier', () => {
    expect(chercherDevis(devis, 'Eiffage Pantin').map(d => d.id)).toEqual(['a']);
    expect(chercherDevis(devis, 'colas').map(d => d.id)).toEqual(['b', 'c']);
  });
});

describe('variantesReference', () => {
  it('recolle les lettres et chiffres dictés séparément', () => {
    expect(variantesReference('KC 1 800')).toEqual(['kc 1 800', 'kc1 800']);
    expect(variantesReference('k c 1')).toEqual(['k c 1', 'kc1']);
    expect(variantesReference('A13A 700')).toEqual(['a13a 700']);
  });
});

describe('phraseStock', () => {
  it('ne dit que ce qui est connu', () => {
    expect(phraseStock('KC1 800', { stock: 12, reserve: 2 })).toBe('KC1 800 : 10 disponibles, sur 12 en stock dont 2 réservés.');
    expect(phraseStock('KC1 800', { stock: 1, reserve: 0, stockOdoo: 4 })).toBe('KC1 800 : 1 disponible. Odoo : 4.');
  });
});
