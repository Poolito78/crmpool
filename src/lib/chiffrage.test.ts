import { describe, it, expect } from 'vitest';
import {
  coupeSignature,
  extraireIndices,
  produitsPourDeclencheur,
  appliquerAccompagnements,
  prixDeLigne,
  type RegleAccompagnement,
  type LigneChiffrage,
  type ProduitRef,
} from './chiffrage';

/* Un mail réel : la demande tient en une phrase, la signature apporte le reste. */
const MAIL = `De : Nuno LEITE <nleite@agilis.net>
Objet : demande devis - chantier CH-2608-023

Bonjour,

Pouvez-vous nous faire un devis pour 14 FLOWFAST215 avec le catalyseur ?

Livraison a notre agence de LIMOGES-FOURCHES

Cordialement,

Nuno LEITE
Conducteur de Travaux
M: +33 (0)6 78 06 67 17
77550 LIMOGES-FOURCHES`;

describe('coupeSignature', () => {
  it("s'arrête à la formule de politesse", () => {
    const t = coupeSignature(MAIL);
    expect(t).toContain('FLOWFAST215');
    expect(t).toContain('LIMOGES-FOURCHES');
    expect(t).not.toContain('Conducteur de Travaux');
    expect(t).not.toContain('77550');
  });

  it('laisse intact un texte sans signature', () => {
    expect(coupeSignature('20 QUARTZ0103')).toBe('20 QUARTZ0103');
  });

  it('coupe à la DERNIÈRE formule, pas à la première', () => {
    const t = coupeSignature('Merci d\'avance.\n\nBonjour\n\nCordialement,\nJean');
    expect(t).toContain('Bonjour');
    expect(t).not.toContain('Jean');
  });
});

describe('extraireIndices', () => {
  it('trouve adresse, agence et référence, en écartant nos propres domaines', () => {
    const i = extraireIndices(MAIL);
    expect(i.emails).toContain('nleite@agilis.net');
    expect(i.villes).toContain('LIMOGES-FOURCHES');
    expect(i.reference).toBe('CH-2608-023');
  });

  it('écarte les adresses internes', () => {
    const i = extraireIndices('De : Francois <f.mouhot@isofloor.fr>\n10 QUARTZ');
    expect(i.emails).toHaveLength(0);
  });

  it("arrête la référence avant les mots de liaison", () => {
    const i = extraireIndices('Notre affaire n° 2026-0455 pour DUPONT SARL');
    expect(i.reference).toBe('2026-0455');
  });

  it('ne prend pas une formule de politesse pour une raison sociale', () => {
    const i = extraireIndices('Merci d\'avance.\n\nCordialement,\nPaul MARTIN\nRESINE SOLS SARL');
    expect(i.noms).not.toContain('Cordialement');
  });
});

/* ---------------------------------------------------------------- */

const PRODUITS: ProduitRef[] = [
  { id: 'p-flow', reference: 'FLOWFAST215', description: 'FLOWFAST 215 résine MMA 20 kg' },
  { id: 'p-cata', reference: 'CATALYST2', description: 'Catalyseur MMA 1 kg' },
  { id: 'p-quartz', reference: 'QUARTZ0103', description: 'Quartz 0,1/0,3 sac 25 kg' },
  { id: 'p-prim', reference: 'FLOWPRIMELW25', description: 'Primaire époxy 25 kg' },
];

const REGLES: RegleAccompagnement[] = [
  {
    id: 'r-cata', actif: true, nom: 'Catalyseur MMA',
    declencheurs: ['FLOWFAST215'], produit_id: 'p-cata', reference: 'CATALYST2',
    par_lot: 1, pour: 4, unite: 'U', prix_impose: null, note: null, ordre: 1,
  },
  {
    id: 'r-prim', actif: true, nom: 'Primaire',
    declencheurs: ['Catalyseur MMA'], produit_id: 'p-prim', reference: 'FLOWPRIMELW25',
    par_lot: 1, pour: 1, unite: 'U', prix_impose: 0, note: 'compris dans le kit', ordre: 2,
  },
];

describe('produitsPourDeclencheur', () => {
  it('reconnaît une référence exacte', () => {
    expect(produitsPourDeclencheur('FLOWFAST215', PRODUITS, REGLES)).toEqual(['p-flow']);
  });

  it("reconnaît le nom d'une autre règle — c'est ainsi qu'on chaîne", () => {
    expect(produitsPourDeclencheur('Catalyseur MMA', PRODUITS, REGLES)).toEqual(['p-cata']);
  });

  it('reconnaît un libellé approché', () => {
    expect(produitsPourDeclencheur('quartz 0,1/0,3', PRODUITS, REGLES)).toContain('p-quartz');
  });

  it('ne renvoie rien pour un terme vide', () => {
    expect(produitsPourDeclencheur('', PRODUITS, REGLES)).toEqual([]);
  });
});

describe('appliquerAccompagnements', () => {
  const commande: LigneChiffrage[] = [
    { produitId: 'p-flow', produitMatch: 'FLOWFAST 215', quantite: 14, confidence: 'high' },
  ];

  it('ajoute les accompagnements et arrondit au supérieur', () => {
    const out = appliquerAccompagnements(commande, REGLES, PRODUITS);
    const cata = out.find((l) => l.produitId === 'p-cata');
    expect(cata?.quantite).toBe(4); // 14 / 4 = 3,5 -> 4
  });

  it('chaîne les règles : le primaire suit le catalyseur, pas la résine', () => {
    const out = appliquerAccompagnements(commande, REGLES, PRODUITS);
    const prim = out.find((l) => l.produitId === 'p-prim');
    expect(prim?.quantite).toBe(4); // 1 par catalyseur, et il y en a 4
    expect(prim?.prixImpose).toBe(0);
  });

  it("n'empile rien quand on rejoue le calcul", () => {
    let out = appliquerAccompagnements(commande, REGLES, PRODUITS);
    out = appliquerAccompagnements(out, REGLES, PRODUITS);
    out = appliquerAccompagnements(out, REGLES, PRODUITS);
    expect(out.filter((l) => l.auto)).toHaveLength(2);
  });

  it('retire les lignes automatiques quand le déclencheur disparaît', () => {
    const avec = appliquerAccompagnements(commande, REGLES, PRODUITS);
    const sans = appliquerAccompagnements(
      avec.filter((l) => l.produitId !== 'p-flow'),
      REGLES,
      PRODUITS,
    );
    expect(sans.filter((l) => l.auto)).toHaveLength(0);
  });

  it("n'ajoute rien sans déclencheur au devis", () => {
    const out = appliquerAccompagnements(
      [{ produitId: 'p-quartz', produitMatch: 'Quartz', quantite: 10, confidence: 'high' }],
      REGLES,
      PRODUITS,
    );
    expect(out.filter((l) => l.auto)).toHaveLength(0);
  });

  it('ignore les règles désactivées', () => {
    const out = appliquerAccompagnements(
      commande,
      REGLES.map((r) => ({ ...r, actif: false })),
      PRODUITS,
    );
    expect(out.filter((l) => l.auto)).toHaveLength(0);
  });
});

describe('prixDeLigne', () => {
  const produit = { prixHT: 100, prixRevendeur: 80, categorie: 'MMA' };

  it('un prix imposé prime sur tout', () => {
    const r = prixDeLigne(
      { produitId: 'x', produitMatch: '', quantite: 1, confidence: 'high', prixImpose: 0 },
      produit,
      { estRevendeur: true },
    );
    expect(r.prix).toBe(0);
    expect(r.origine).toBe('imposé');
  });

  it('applique le tarif revendeur', () => {
    const r = prixDeLigne(
      { produitId: 'x', produitMatch: '', quantite: 1, confidence: 'high' },
      produit,
      { estRevendeur: true },
    );
    expect(r.prix).toBe(80);
  });

  it('applique la remise de catégorie du client', () => {
    const r = prixDeLigne(
      { produitId: 'x', produitMatch: '', quantite: 1, confidence: 'high' },
      produit,
      { remisesParCategorie: { MMA: 15 } },
    );
    expect(r.prix).toBe(85);
    expect(r.origine).toBe('remise catégorie');
  });

  it('retombe sur le tarif public', () => {
    const r = prixDeLigne(
      { produitId: 'x', produitMatch: '', quantite: 1, confidence: 'high' },
      produit,
      {},
    );
    expect(r.prix).toBe(100);
    expect(r.origine).toBe('catalogue');
  });
});
