import { describe, it, expect } from 'vitest';
import {
  designation, urlFichePublique, liensDuProduit, liensDesProduits, articlesLiesDuDevis,
  liensHtml, liensTexte, echapperHtml, type ProduitLiable,
} from './liensProduit';

const ORIGINE = 'https://crmpool.vercel.app';

function produit(p: Partial<ProduitLiable> & { id: string }): ProduitLiable {
  return { reference: 'REF1', description: 'Article de démonstration', ...p };
}

describe('désignation', () => {
  it('préfère la description à la référence', () => {
    expect(designation(produit({ id: 'a' }))).toBe('Article de démonstration');
  });

  /* UNE RÉFÉRENCE N'EST PAS UNE DÉSIGNATION, mais elle vaut mieux que rien :
     un lien nommé « PTboussoleblanche1500 » reste cliquable et identifiable,
     un lien nommé « » ne se voit même pas dans le mail. */
  it('retombe sur la référence quand la description manque', () => {
    expect(designation(produit({ id: 'a', description: '  ' }))).toBe('REF1');
    expect(designation(produit({ id: 'a', description: '', reference: '' }))).toBe('Article');
  });
});

describe('liens proposés', () => {
  it('propose toujours la fiche publique, même sans fiche technique ni photo', () => {
    const liens = liensDuProduit(produit({ id: 'p1' }), { origine: ORIGINE });
    expect(liens).toHaveLength(1);
    expect(liens[0].cible).toBe('page');
    expect(liens[0].url).toBe(`${ORIGINE}/p/p1`);
  });

  it('propose fiche, photo et page dans cet ordre', () => {
    const liens = liensDuProduit(
      produit({ id: 'p1', ficheUrl: 'https://exemple/fp.pdf' }),
      { imageUrl: 'https://exemple/photo.webp', origine: ORIGINE },
    );
    expect(liens.map(l => l.cible)).toEqual(['fiche', 'image', 'page']);
  });

  /* LE LIBELLÉ SAISI SUR L'ARTICLE A ÉTÉ ÉCRIT POUR ÊTRE LU : il gagne sur
     le libellé construit, sinon renommer un lien dans la fiche article
     n'aurait aucun effet là où il sert. */
  it('reprend le libellé saisi sur l’article pour la fiche technique', () => {
    const [fiche] = liensDuProduit(
      produit({ id: 'p1', ficheUrl: 'https://exemple/fp.pdf', ficheLinkLabel: '  Fiche Flowfresh MF  ' }),
      { origine: ORIGINE },
    );
    expect(fiche.label).toBe('Fiche Flowfresh MF');
  });

  it('construit un libellé porteur de la désignation à défaut', () => {
    const [fiche] = liensDuProduit(
      produit({ id: 'p1', ficheUrl: 'https://exemple/fp.pdf' }),
      { origine: ORIGINE },
    );
    expect(fiche.label).toBe('Fiche technique — Article de démonstration');
  });

  it('ignore une URL vide ou blanche', () => {
    const liens = liensDuProduit(
      produit({ id: 'p1', ficheUrl: '   ' }),
      { imageUrl: '', origine: ORIGINE },
    );
    expect(liens.map(l => l.cible)).toEqual(['page']);
  });

  /* UN ARTICLE PRÉSENT SUR DEUX LIGNES (deux teintes, deux conditionnements)
     ne donne qu'un jeu de liens : le mail ne répète pas la même fiche. */
  it('ne répète pas un article présent plusieurs fois', () => {
    const p = produit({ id: 'p1' });
    const liens = liensDesProduits([p, p, produit({ id: 'p2' })], {}, ORIGINE);
    expect(liens.map(l => l.produitId)).toEqual(['p1', 'p2']);
  });

  it('rattache la photo au bon article', () => {
    const liens = liensDesProduits(
      [produit({ id: 'p1' }), produit({ id: 'p2' })],
      { p2: 'https://exemple/photo2.webp' },
      ORIGINE,
    );
    expect(liens.filter(l => l.cible === 'image').map(l => l.produitId)).toEqual(['p2']);
  });

  it('donne un identifiant stable à chaque lien', () => {
    const liens = liensDuProduit(
      produit({ id: 'p1', ficheUrl: 'https://exemple/fp.pdf' }),
      { origine: ORIGINE },
    );
    expect(liens.map(l => l.id)).toEqual(['p1:fiche', 'p1:page']);
  });
});

describe('adresse de la fiche publique', () => {
  it('ne double pas la barre oblique', () => {
    expect(urlFichePublique('p1', 'https://crmpool.vercel.app/')).toBe('https://crmpool.vercel.app/p/p1');
  });
});

describe('rendu', () => {
  const liens = liensDuProduit(
    produit({ id: 'p1', description: 'Résine <époxy> "A & B"', ficheUrl: 'https://exemple/fp.pdf?a=1&b=2' }),
    { origine: ORIGINE },
  );

  /* UNE DÉSIGNATION CONTIENT DES CHEVRONS ET DES ESPERLUETTES (« Part A & B »,
     « <2 mm ») : non échappées, elles cassent le HTML du mail — au mieux le
     texte disparaît, au pire le lien suivant est avalé. */
  it('échappe le libellé et l’URL', () => {
    const html = liensHtml(liens);
    expect(html).toContain('Résine &lt;époxy&gt; &quot;A &amp; B&quot;');
    expect(html).toContain('href="https://exemple/fp.pdf?a=1&amp;b=2"');
    expect(html).not.toContain('<époxy>');
  });

  it('donne une couleur explicite au lien', () => {
    // Sans couleur en ligne, Outlook affiche le lien en noir : invisible.
    expect(liensHtml(liens)).toContain('color:#0563C1');
  });

  it('rend « libellé : url » en texte brut', () => {
    const texte = liensTexte(liens);
    expect(texte).toContain('• Fiche technique — Résine <époxy> "A & B" : https://exemple/fp.pdf?a=1&b=2');
  });

  it('ne rend rien sans lien', () => {
    expect(liensHtml([])).toBe('');
    expect(liensTexte([])).toBe('');
  });

  it('échappe les caractères sensibles', () => {
    expect(echapperHtml('<a href="x">& fin</a>'))
      .toBe('&lt;a href=&quot;x&quot;&gt;&amp; fin&lt;/a&gt;');
  });
});

describe('libellé de la photo', () => {
  /* L'URL d'une photo fait cent caractères et ne dit rien. Le libellé saisi
     sur l'image est ce qu'on veut lire dans le mail. */
  it('préfère le libellé saisi sur la photo', () => {
    const liens = liensDuProduit(
      produit({ id: 'p1', description: 'Plot de route blanc' }),
      { imageUrl: 'https://exemple/photo.webp', imageLibelle: 'Plot D100 blanc — vue de dessus' },
    );
    const image = liens.find(l => l.cible === 'image')!;
    expect(image.label).toBe('Plot D100 blanc — vue de dessus');
  });

  it('retombe sur la désignation quand la photo n’a pas de libellé', () => {
    const liens = liensDuProduit(
      produit({ id: 'p1', description: 'Plot de route blanc' }),
      { imageUrl: 'https://exemple/photo.webp' },
    );
    expect(liens.find(l => l.cible === 'image')!.label).toBe('Photo — Plot de route blanc');
  });

  it('ignore un libellé qui n’est que des espaces', () => {
    const liens = liensDuProduit(
      produit({ id: 'p1', description: 'Plot de route blanc' }),
      { imageUrl: 'https://exemple/photo.webp', imageLibelle: '   ' },
    );
    expect(liens.find(l => l.cible === 'image')!.label).toBe('Photo — Plot de route blanc');
  });

  it('porte le libellé jusqu’aux liens de tout un devis', () => {
    const liens = liensDesProduits(
      [produit({ id: 'p1', description: 'Plot de route blanc' })],
      { p1: 'https://exemple/photo.webp' },
      'https://crm.exemple',
      { p1: 'Plot D100 blanc' },
    );
    expect(liens.find(l => l.cible === 'image')!.label).toBe('Plot D100 blanc');
  });
});

describe('articles d’un devis qui ont un lien à montrer', () => {
  const AVEC_FICHE = produit({ id: 'p1', description: 'Flowfresh MF', ficheUrl: 'https://ex/fiche.pdf' });
  const NU = produit({ id: 'p2', description: 'Sable de quartz' });
  const sansPhoto = () => undefined;

  /* LE DÉFAUT QUI VIDAIT LE BLOC DE TOUS LES DEVIS. `type` est optionnel et
     vaut « ligne » par défaut : dans la base, aucune ligne d'article ne porte
     la chaîne 'ligne'. Un test positif n'en reconnaissait donc pas une seule. */
  it('reconnaît une ligne d’article dont le type n’est pas renseigné', () => {
    const r = articlesLiesDuDevis([{ produitId: 'p1' }], [AVEC_FICHE], sansPhoto);
    expect(r.map(a => a.nom)).toEqual(['Flowfresh MF']);
  });

  it('accepte aussi le type explicite', () => {
    const r = articlesLiesDuDevis([{ type: 'ligne', produitId: 'p1' }], [AVEC_FICHE], sansPhoto);
    expect(r).toHaveLength(1);
  });

  it('écarte les en-têtes, sous-totaux et lignes de texte', () => {
    const r = articlesLiesDuDevis(
      [{ type: 'groupe', produitId: 'p1' }, { type: 'soustotal', produitId: 'p1' },
       { type: 'texte', produitId: 'p1' }],
      [AVEC_FICHE], sansPhoto);
    expect(r).toEqual([]);
  });

  /* La fiche publique du CRM n'apprend rien au client qui a le devis sous les
     yeux : un article sans fiche technique ni photo n'a rien à montrer. */
  it('écarte un article qui n’a ni fiche ni photo', () => {
    expect(articlesLiesDuDevis([{ produitId: 'p2' }], [NU], sansPhoto)).toEqual([]);
  });

  it('retient un article que sa seule photo qualifie', () => {
    const r = articlesLiesDuDevis([{ produitId: 'p2' }], [NU],
      id => (id === 'p2' ? { url: 'https://ex/photo.webp', libelle: 'Vue de dessus' } : undefined));
    expect(r).toHaveLength(1);
    expect(r[0].liens.map(l => l.label)).toEqual(['Vue de dessus']);
  });

  it('ne propose jamais la fiche publique du CRM', () => {
    const r = articlesLiesDuDevis([{ produitId: 'p1' }], [AVEC_FICHE], sansPhoto);
    expect(r[0].liens.some(l => l.cible === 'page')).toBe(false);
  });

  it('ne compte qu’une fois une référence posée sur deux lignes', () => {
    const r = articlesLiesDuDevis([{ produitId: 'p1' }, { produitId: 'p1' }], [AVEC_FICHE], sansPhoto);
    expect(r).toHaveLength(1);
  });

  it('ignore une ligne dont l’article a disparu du catalogue', () => {
    expect(articlesLiesDuDevis([{ produitId: 'inconnu' }], [AVEC_FICHE], sansPhoto)).toEqual([]);
  });
});
