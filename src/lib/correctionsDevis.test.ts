import { describe, expect, it } from 'vitest';
import type { LigneDevis, Produit } from '@/lib/store';
import { articlesAApprendre, corrections, figerChiffrage, releveCorrections, souvenirsAEcrire } from './correctionsDevis';

const produits = [
  { id: 'p1', reference: 'AK3.700.C2.BTR.IS.BRUT', description: 'IS AK3' },
  { id: 'p2', reference: 'AK3.1000.C2.BTR.IS.BRUT', description: 'IS AK3' },
  { id: 'p3', reference: 'BRIDE60', description: 'Bride' },
] as unknown as Produit[];

const ligne = (o: Partial<LigneDevis> & { id: string }): LigneDevis => ({
  description: '', quantite: 1, prixUnitaireHT: 10, tva: 20, ...o,
} as LigneDevis);

const proposees = [
  ligne({ id: 'a', produitId: 'p1', description: 'AK3 700', quantite: 2, prixUnitaireHT: 50, demandeClient: 'panneau AK3' }),
  ligne({ id: 'b', description: 'Mât 2,50 m', quantite: 2, prixUnitaireHT: 30, demandeClient: 'mât' }),
  ligne({ id: 'g', type: 'groupe', description: 'Signalisation' }),
  ligne({ id: 'c', description: 'Plot PVC', quantite: 4, prixUnitaireHT: 5 }),
];
const chiffrage = figerChiffrage({ lignes: proposees, fraisPortHT: 0 }, produits, { demande: '  bonjour  ', date: '2026-11-11T10:00:00Z' });

describe('figerChiffrage', () => {
  it('ne garde que les lignes d\'article, référence et demande comprises', () => {
    expect(chiffrage.lignes.map(l => l.id)).toEqual(['a', 'b', 'c']);
    expect(chiffrage.lignes[0]).toMatchObject({ reference: 'AK3.700.C2.BTR.IS.BRUT', pu: 50, demandeClient: 'panneau AK3' });
    expect(chiffrage.demande).toBe('bonjour');
  });
});

describe('corrections', () => {
  it('rien de changé, rien à dire', () => {
    expect(corrections(chiffrage, proposees, produits)).toEqual([]);
  });

  it('relève article, quantité, ajout et retrait par l\'identifiant de ligne', () => {
    const apres = [
      { ...proposees[0], produitId: 'p2', description: 'AK3 1000' },
      { ...proposees[1], quantite: 3 },
      proposees[2],
      ligne({ id: 'd', produitId: 'p3', description: 'Bride', quantite: 4 }),
    ];
    const cs = corrections(chiffrage, apres, produits);
    expect(cs.map(c => `${c.type}:${c.avant?.id ?? c.apres?.id}`)).toEqual(['article:a', 'quantite:b', 'ajout:d', 'retrait:c']);
  });

  it('une remise équivalente au prix d\'avant n\'est pas une correction de prix', () => {
    const apres = [{ ...proposees[0], prixUnitaireHT: 100, remise: 50 }, proposees[1], proposees[3]];
    expect(corrections(chiffrage, apres, produits)).toEqual([]);
  });
});

describe('articlesAApprendre', () => {
  it('apprend la demande → l\'article retenu, jamais une ligne sans demande ou sans article', () => {
    const apres = [
      { ...proposees[0], produitId: 'p2', description: 'AK3 1000 C2' },
      { ...proposees[1], produitId: 'p3' },            // mât → bride : appris (demande « mât »)
      { ...proposees[3], produitId: 'p3' },            // plot sans demande : rien
    ];
    const appris = articlesAApprendre(corrections(chiffrage, apres, produits));
    expect(appris).toEqual([
      { demande: 'panneau AK3', produitId: 'p2', reference: 'AK3.1000.C2.BTR.IS.BRUT', designation: 'AK3 1000 C2' },
      { demande: 'mât', produitId: 'p3', reference: 'BRIDE60', designation: 'Mât 2,50 m' },
    ]);
  });

  it('une ligne vidée de son article n\'apprend rien', () => {
    const apres = [{ ...proposees[0], produitId: undefined }, proposees[1], proposees[3]];
    expect(articlesAApprendre(corrections(chiffrage, apres, produits))).toEqual([]);
  });
});

describe('souvenirsAEcrire', () => {
  const corrige = [{ ...proposees[0], produitId: 'p2' }, proposees[1], proposees[3]];

  it('écrit une correction que la mémoire ne connaît pas, une seule fois', () => {
    expect(souvenirsAEcrire(chiffrage, corrige, produits, () => undefined).map(a => a.reference))
      .toEqual(['AK3.1000.C2.BTR.IS.BRUT']);
    expect(souvenirsAEcrire(chiffrage, corrige, produits, () => 'ak3.1000.c2.btr.is.brut')).toEqual([]);
  });

  it('une ligne revenue à l\'article proposé défait l\'essai appris entre-temps', () => {
    const memoire = (d: string) => (d === 'panneau AK3' ? 'AK3.1000.C2.BTR.IS.BRUT' : undefined);
    expect(souvenirsAEcrire(chiffrage, proposees, produits, memoire).map(a => a.reference))
      .toEqual(['AK3.700.C2.BTR.IS.BRUT']);
  });

  it('sans mémoire contraire, une ligne non corrigée n\'écrit rien', () => {
    expect(souvenirsAEcrire(chiffrage, proposees, produits, () => undefined)).toEqual([]);
  });
});

describe('releveCorrections', () => {
  it('cite la demande du client', () => {
    const cs = corrections(chiffrage, [proposees[0], proposees[1]], produits);
    const t = releveCorrections(cs, { numero: 'DEV-2026-200', chiffrage });
    expect(t).toContain('RETIRÉ : Plot PVC × 4 à 5,00 €');
    expect(t).toContain('— Demande du client —\nbonjour');
  });
});
