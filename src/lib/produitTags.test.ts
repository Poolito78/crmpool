import { describe, it, expect } from 'vitest';
import {
  normaliserTag, memeTag, motsAppris, motsDuProduit, tagACandidat, tagsParProduit,
  type TagArticle,
} from './produitTags';
import { chercherProduits } from './indexProduits';
import type { Produit } from './store';

function produit(p: Partial<Produit> & { id: string; reference: string; description: string }): Produit {
  return {
    prixAchat: 0, coefficient: 1.6, prixHT: 0, coeffRevendeur: 1.6, remiseRevendeur: 30,
    prixRevendeur: 0, tva: 20, unite: 'pièce', stock: 0, stockMin: 0,
    dateCreation: '2026-01-01T00:00:00Z', ...p,
  };
}

const cycliste = produit({
  id: 'p1', reference: 'PANHV60', description: 'Homme à vélo', categorie: 'SIGNALISATION POLICE',
});
const resine = produit({
  id: 'p2', reference: 'FLOWFASTF107', description: 'Résine époxy FLOWFAST 107 (180KG)',
  categorie: 'ISOFLOOR / EPOXY',
});

describe('normalisation d’un tag', () => {
  it('ramène la casse, la ponctuation et les espaces à une seule écriture', () => {
    expect(normaliserTag('  Cycliste  ')).toBe('cycliste');
    expect(normaliserTag('« Plot,  bordure »')).toBe('plot bordure');
  });

  /* Le client écrit « Bétonnière » un jour, « betonniere » le lendemain. Deux
     lignes en base pour le même mot, c'est un ménage à faire et une recherche
     qui rate une fois sur deux. */
  it('reconnaît le même mot malgré la casse et les accents', () => {
    expect(memeTag('Bétonnière', 'betonniere')).toBe(true);
    expect(memeTag('cycliste', 'cyclistes')).toBe(false);
  });
});

describe('ce que la demande apprend', () => {
  /* Le cas qui justifie la fonction : le client dit « cycliste », le catalogue
     dit « Homme à vélo ». Aucune recherche ne les rapproche. */
  it('retient le mot du client absent de la fiche article', () => {
    expect(motsAppris('cycliste', cycliste)).toEqual(['cycliste']);
  });

  /* ⚠️ Sans ce filtre, un tag « résine » finirait sur une résine — il
     n'apprendrait rien, la recherche la trouvait déjà. */
  it('écarte les mots que l’article porte déjà', () => {
    expect(motsDuProduit(resine).has('epoxy')).toBe(true);
    expect(motsAppris('résine époxy', resine)).toEqual([]);
  });

  /* « 30 m² de résine époxy » ne doit apprendre ni la quantité, ni l'unité,
     ni la liaison : il ne reste rien, et c'est le bon résultat. */
  it('écarte les quantités, les unités et les liaisons', () => {
    expect(motsAppris('30 m² de résine époxy', resine)).toEqual([]);
    expect(motsAppris('80x40 lot de 20kg', cycliste)).toEqual([]);
  });

  it('rend les mots dans l’ordre où le client les a écrits', () => {
    expect(motsAppris('bonjour, besoin de 12 plots bordure svp', cycliste))
      .toEqual(['plots', 'bordure']);
  });

  it('n’apprend pas deux fois un mot déjà retenu', () => {
    expect(motsAppris('cycliste', cycliste, ['cycliste'])).toEqual([]);
    expect(motsAppris('Cyclistes', cycliste, ['cyclistes'])).toEqual([]);
  });
});

describe('inscrire tout seul, ou proposer', () => {
  /* Un ou deux mots : c'est un synonyme, il vaudra encore au devis suivant. */
  it('inscrit sans rien demander un synonyme d’un ou deux mots', () => {
    expect(tagACandidat('cycliste', cycliste)).toEqual({ tag: 'cycliste', automatique: true });
    expect(tagACandidat('12 plots bordure', cycliste))
      .toEqual({ tag: 'plots bordure', automatique: true });
  });

  /* Trois mots et plus : phrase de circonstance. L'inscrire remplirait la base
     de mots qui ne resserviront jamais et qu'il faudrait effacer un par un. */
  it('propose au lieu d’inscrire quand la demande devient une phrase', () => {
    const c = tagACandidat('plots bordure trottoir côté nord', cycliste);
    expect(c).toEqual({ tag: 'plots bordure trottoir côté nord', automatique: false });
  });

  it('n’apprend rien d’une demande qui répète la désignation', () => {
    expect(tagACandidat('Homme à vélo', cycliste)).toBeNull();
    expect(tagACandidat('', cycliste)).toBeNull();
    expect(tagACandidat('cycliste', cycliste, ['Cycliste'])).toBeNull();
  });
});

describe('recherche du catalogue par tag', () => {
  const catalogue = [cycliste, resine];
  const tags = tagsParProduit([
    { id: 't1', produitId: 'p1', tag: 'cycliste', origine: 'appris', createdAt: '' },
  ] as TagArticle[]);

  /* Le tag n'existe que pour ça : sans lui, « cycliste » ne rend rien. */
  it('retrouve l’article par le mot du client', () => {
    expect(chercherProduits(catalogue, 'cycliste', 60).resultats).toHaveLength(0);
    expect(chercherProduits(catalogue, 'cycliste', 60, tags).resultats).toEqual([cycliste]);
  });

  /* On a retenu « cycliste » au singulier ; le client suivant écrit
     « cyclistes ». Manquer l'article sur un « s » annulerait tout l'intérêt. */
  it('ne se laisse pas arrêter par le pluriel de la saisie', () => {
    expect(chercherProduits(catalogue, 'cyclistes', 60, tags).resultats).toEqual([cycliste]);
  });

  /* ⚠️ Un tag est un mot appris, parfois d'un seul devis : il ne doit pas
     passer devant une référence qui répond vraiment à la saisie. */
  it('classe le tag après les références, jamais avant', () => {
    const tagsLarges = tagsParProduit([
      { id: 't2', produitId: 'p2', tag: 'panhv60', origine: 'manuel', createdAt: '' },
    ] as TagArticle[]);
    const { resultats } = chercherProduits(catalogue, 'panhv60', 60, tagsLarges);
    expect(resultats[0]).toBe(cycliste);
    expect(resultats).toContain(resine);
  });
});
