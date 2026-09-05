import { describe, it, expect } from 'vitest';
import {
  normaliserCategorie, chaineCategories, documentsPourCategorie, articlesConcernes,
  liensDocumentsCategorie,
  type DocumentCategorie,
} from './categorieDocuments';

function doc(d: Partial<DocumentCategorie> & { id: string; categorie: string }): DocumentCategorie {
  return {
    libelle: 'Document', url: `https://ex/${d.id}.pdf`, genre: 'autre',
    ordre: 0, createdAt: '2026-01-01T00:00:00Z', ...d,
  };
}

describe('normalisation d’une catégorie', () => {
  /* Les chemins viennent d'Odoo ET de la saisie : les mêmes segments s'écrivent
     avec ou sans espaces autour du séparateur. Sans mise au net, un document
     posé sur l'une resterait invisible depuis l'autre. */
  it('ramène toutes les écritures d’un même chemin à une seule', () => {
    const attendu = 'ISOMARK / H2';
    expect(normaliserCategorie('ISOMARK/H2')).toBe(attendu);
    expect(normaliserCategorie('ISOMARK / H2 ')).toBe(attendu);
    expect(normaliserCategorie(' ISOMARK /H2')).toBe(attendu);
  });

  it('écarte les segments vides d’un chemin mal formé', () => {
    expect(normaliserCategorie('ISOMARK //  / H2')).toBe('ISOMARK / H2');
  });

  it('rend une chaîne vide pour une catégorie absente', () => {
    expect(normaliserCategorie(undefined)).toBe('');
    expect(normaliserCategorie('   ')).toBe('');
  });
});

describe('chaîne d’héritage d’une catégorie', () => {
  it('va du plus précis au plus général', () => {
    expect(chaineCategories('ISOMARK / H2 / PREFA THERMO')).toEqual([
      'ISOMARK / H2 / PREFA THERMO',
      'ISOMARK / H2',
      'ISOMARK',
    ]);
  });

  it('rend un seul niveau pour une catégorie sans parent', () => {
    expect(chaineCategories('SPEC')).toEqual(['SPEC']);
  });

  it('rend une chaîne vide quand l’article n’est pas rangé', () => {
    expect(chaineCategories('')).toEqual([]);
  });
});

describe('documents applicables à un article', () => {
  const RACINE = doc({ id: 'a', categorie: 'ISOMARK', libelle: 'Catalogue ISOMARK' });
  const H2 = doc({ id: 'b', categorie: 'ISOMARK / H2', libelle: 'Homologation H2', genre: 'homologation' });
  const THERMO = doc({ id: 'c', categorie: 'ISOMARK / H2 / PREFA THERMO', libelle: 'Fiche prefa', genre: 'fiche' });
  const AILLEURS = doc({ id: 'd', categorie: 'PLASTIQUE', libelle: 'Hors sujet' });
  const TOUS = [RACINE, H2, THERMO, AILLEURS];

  /* SANS HÉRITAGE LA FONCTION SERAIT INUTILISABLE : 29 articles
     thermoplastiques sont rangés dans « ISOMARK / H2 » et 2 seulement dans
     « ISOMARK / H2 / PREFA THERMO ». */
  it('remonte toute la chaîne des parents', () => {
    const r = documentsPourCategorie(TOUS, 'ISOMARK / H2 / PREFA THERMO');
    expect(r.map(d => d.id)).toEqual(['c', 'b', 'a']);
  });

  it('marque comme hérité ce qui ne vient pas de la catégorie de l’article', () => {
    const r = documentsPourCategorie(TOUS, 'ISOMARK / H2 / PREFA THERMO');
    expect(r.map(d => d.herite)).toEqual([false, true, true]);
  });

  it('ne descend pas : un article de H2 ne voit pas les documents de PREFA THERMO', () => {
    const r = documentsPourCategorie(TOUS, 'ISOMARK / H2');
    expect(r.map(d => d.id)).toEqual(['b', 'a']);
  });

  it('ignore les documents d’une branche voisine', () => {
    const r = documentsPourCategorie(TOUS, 'ISOMARK / H2');
    expect(r.some(d => d.id === 'd')).toBe(false);
  });

  /* Deux fois la même ligne dans une liste de liens ferait douter du reste :
     l'attache la plus proche décrit le mieux le rôle du document. */
  it('ne montre qu’une fois une adresse attachée à deux niveaux, portée par le plus précis', () => {
    const meme = 'https://ex/homologation.pdf';
    const r = documentsPourCategorie([
      doc({ id: 'haut', categorie: 'ISOMARK', url: meme }),
      doc({ id: 'bas', categorie: 'ISOMARK / H2', url: meme }),
    ], 'ISOMARK / H2 / PREFA THERMO');
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('bas');
    expect(r[0].herite).toBe(true);
  });

  it('rapproche les écritures différentes d’un même chemin', () => {
    const r = documentsPourCategorie([doc({ id: 'x', categorie: 'ISOMARK/H2' })], 'ISOMARK / H2 ');
    expect(r.map(d => d.id)).toEqual(['x']);
  });

  it('trie par ordre puis par libellé à l’intérieur d’un niveau', () => {
    const r = documentsPourCategorie([
      doc({ id: 'z', categorie: 'SPEC', libelle: 'Zèbre', ordre: 0 }),
      doc({ id: 'a', categorie: 'SPEC', libelle: 'Abeille', ordre: 0 }),
      doc({ id: 'p', categorie: 'SPEC', libelle: 'Premier', ordre: -1 }),
    ], 'SPEC');
    expect(r.map(d => d.id)).toEqual(['p', 'a', 'z']);
  });

  it('ne rend rien pour un article sans catégorie', () => {
    expect(documentsPourCategorie(TOUS, undefined)).toEqual([]);
  });
});

describe('nombre d’articles concernés', () => {
  const CATALOGUE = [
    { categorie: 'ISOMARK / H2' },
    { categorie: 'ISOMARK / H2 / PREFA THERMO' },
    { categorie: 'ISOMARK / H1' },
    { categorie: 'PLASTIQUE' },
    { categorie: undefined },
  ];

  /* On ne pose pas un masque d'homologation sur 780 fiches sans le savoir. */
  it('compte la catégorie et tout ce qui est rangé dessous', () => {
    expect(articlesConcernes(CATALOGUE, 'ISOMARK / H2')).toBe(2);
    expect(articlesConcernes(CATALOGUE, 'ISOMARK')).toBe(3);
  });

  it('ne compte que l’exacte quand rien n’est rangé dessous', () => {
    expect(articlesConcernes(CATALOGUE, 'ISOMARK / H2 / PREFA THERMO')).toBe(1);
  });

  /* « ISOMARK / H1 » ne doit pas être compté par « ISOMARK / H » : la
     comparaison porte sur des SEGMENTS entiers, pas sur des caractères. */
  it('ne confond pas un segment avec le début d’un autre', () => {
    expect(articlesConcernes(CATALOGUE, 'ISOMARK / H')).toBe(0);
  });

  it('rend zéro sans catégorie', () => {
    expect(articlesConcernes(CATALOGUE, '')).toBe(0);
  });
});

describe('documents de famille en liens collables', () => {
  const HOMOLOGATION = doc({
    id: 'h', categorie: 'SIGNALISATION', libelle: 'Homologation', genre: 'homologation',
    url: 'https://ex/homologation.pdf',
  });
  const POSE = doc({ id: 'p', categorie: 'SIGNALISATION / CARRE', libelle: 'Photos de pose', genre: 'photo' });

  /* Un devis de six panneaux carrés ne doit pas proposer six fois le même
     masque d'homologation. */
  it('ne rend qu’un lien par document, même si dix articles le partagent', () => {
    const articles = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, categorie: 'SIGNALISATION / CARRE' }));
    const liens = liensDocumentsCategorie(articles, [HOMOLOGATION, POSE]);
    expect(liens).toHaveLength(2);
    expect(liens.map(l => l.label)).toEqual(['Photos de pose', 'Homologation']);
  });

  it('réunit les documents de familles différentes présentes au devis', () => {
    const liens = liensDocumentsCategorie(
      [{ id: 'a', categorie: 'SIGNALISATION / CARRE' }, { id: 'b', categorie: 'PLASTIQUE' }],
      [HOMOLOGATION, POSE, doc({ id: 'x', categorie: 'PLASTIQUE', libelle: 'Notice plastique' })],
    );
    expect(liens.map(l => l.label)).toEqual(['Photos de pose', 'Homologation', 'Notice plastique']);
  });

  it('porte la cible « categorie » et un identifiant qui ne heurte pas ceux des articles', () => {
    const liens = liensDocumentsCategorie([{ id: 'a', categorie: 'SIGNALISATION' }], [HOMOLOGATION]);
    expect(liens[0].cible).toBe('categorie');
    expect(liens[0].id).toBe('cat:h');
  });

  it('ne rend rien quand aucun article n’est rangé', () => {
    expect(liensDocumentsCategorie([{ id: 'a' }], [HOMOLOGATION])).toEqual([]);
  });
});
