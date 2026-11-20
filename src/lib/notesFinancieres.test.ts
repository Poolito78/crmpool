import { describe, it, expect } from 'vitest';
import { calculerNote, lettreDeNote, lireEntreprise, liensSources, sirenDe, type EntrepriseFinance } from './notesFinancieres';

const MAINTENANT = new Date('2026-11-20');

const saine: EntrepriseFinance = {
  siren: '123456789', nom: 'SAINE SAS', active: true, dateCreation: '2005-03-01', trancheEffectif: '21',
  finances: [
    { annee: 2023, ca: 1_000_000, resultatNet: 80_000 },
    { annee: 2024, ca: 1_200_000, resultatNet: 100_000 },
  ],
};

describe('sirenDe', () => {
  it('prend les 9 premiers chiffres d’un SIRET, espaces ignorés', () => {
    expect(sirenDe('123 456 789 00012')).toBe('123456789');
    expect(sirenDe('12345')).toBeNull();
    expect(sirenDe(undefined)).toBeNull();
  });
});

describe('lireEntreprise', () => {
  it('retient le SIREN demandé, pas le premier résultat, et trie les exercices', () => {
    const json = { results: [
      { siren: '999999999', nom_complet: 'AUTRE' },
      { siren: '123456789', nom_complet: 'X', etat_administratif: 'A', tranche_effectif_salarie: 'NN',
        finances: { '2024': { ca: 10, resultat_net: 1 }, '2022': { ca: 8 }, '2023': {} } },
    ] };
    const e = lireEntreprise(json, '123456789')!;
    expect(e.nom).toBe('X');
    expect(e.active).toBe(true);
    expect(e.trancheEffectif).toBeUndefined();
    expect(e.finances.map(f => f.annee)).toEqual([2022, 2024]);
  });
  it('rend null quand le SIREN est absent', () => {
    expect(lireEntreprise({ results: [] }, '123456789')).toBeNull();
    expect(lireEntreprise(null, '123456789')).toBeNull();
  });
});

describe('calculerNote', () => {
  it('note une entreprise saine A, sans alerte', () => {
    const n = calculerNote(saine, MAINTENANT);
    // 25 + 12 (tranche 21) + 30 + 20 + 10 = 97 sur 100
    expect(n.note).toBe(97);
    expect(n.lettre).toBe('A');
    expect(n.partielle).toBe(false);
    expect(n.alertes).toEqual([]);
  });
  it('met 0 / D à une entreprise cessée', () => {
    const n = calculerNote({ ...saine, active: false }, MAINTENANT);
    expect(n.note).toBe(0);
    expect(n.lettre).toBe('D');
    expect(n.alertes[0]).toMatch(/cessée/);
  });
  it('sans comptes publiés : critères « à vérifier », note partielle, jamais un mauvais bilan', () => {
    const n = calculerNote({ ...saine, finances: [] }, MAINTENANT);
    expect(n.partielle).toBe(true);
    expect(n.criteres.filter(c => c.points === null).map(c => c.cle)).toEqual(['resultat', 'tendance', 'fraicheur']);
    // ancienneté 25/25 + effectif 12/15 sur 40 évaluables
    expect(n.note).toBe(93);
    expect(n.alertes.join(' ')).toMatch(/Aucun compte publié/);
  });
  it('signale perte et baisse du CA', () => {
    const n = calculerNote({ ...saine, finances: [
      { annee: 2023, ca: 1_000_000, resultatNet: 10_000 },
      { annee: 2024, ca: 700_000, resultatNet: -200_000 },
    ] }, MAINTENANT);
    expect(n.alertes.join(' ')).toMatch(/Résultat net négatif en 2024/);
    expect(n.alertes.join(' ')).toMatch(/baisse de plus de 20 %/);
    expect(n.lettre).not.toBe('A');
  });
  it('signale des comptes anciens', () => {
    const n = calculerNote({ ...saine, finances: [{ annee: 2021, ca: 1, resultatNet: 1 }] }, MAINTENANT);
    expect(n.criteres.find(c => c.cle === 'fraicheur')!.points).toBe(0);
    expect(n.alertes.join(' ')).toMatch(/comptes anciens/);
  });
});

describe('lettreDeNote', () => {
  it('découpe aux seuils 75 / 55 / 35', () => {
    expect([100, 75, 74, 55, 54, 35, 34, 0].map(lettreDeNote)).toEqual(['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D']);
  });
});

describe('liensSources', () => {
  it('porte le SIREN dans les quatre liens', () => {
    const l = liensSources('123456789');
    expect(l.map(x => x.cle)).toEqual(['annuaire', 'pappers', 'societe', 'infogreffe']);
    expect(l.every(x => x.url.includes('123456789'))).toBe(true);
  });
});
