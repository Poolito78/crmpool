import { describe, it, expect } from 'vitest';
import {
  construirePivot, cheminColonne, colonnesFeuilles, faitsDevis, faitsFactures, lignesVisibles, trierParMesure, valeurMesure, cheminsDepliables,
  type ContexteFaits,
} from './analyseCroisee';
import type { Devis, FactureClient, LigneDevis, Produit, Client } from './store';

const produit = (id: string, reference: string, description: string, categorie?: string) =>
  ({ id, reference, description, categorie } as unknown as Produit);

const P = [
  produit('p1', 'FLOWFAST319', 'FLOWFAST 319', 'ISOMARK / FLOORING / MMA'),
  produit('p2', 'QUARTZ0308', 'Quartz 0,3-0,8', 'ISOMARK / H2'),
];
const C = [{ id: 'c1', nom: 'M. X', societe: 'TOP SIGNALISATION' }, { id: 'c2', nom: 'Mme Y', societe: 'AUBRAC SIGNAL' }] as Client[];

const ctx: ContexteFaits = {
  clientParId: id => C.find(c => c.id === id),
  produitParId: id => P.find(p => p.id === id),
  nomCommercial: () => 'François MOUHOT',
};

const ligne = (produitId: string | undefined, quantite: number, prix: number, extra: Partial<LigneDevis> = {}): LigneDevis =>
  ({ id: Math.random().toString(), produitId, description: 'libre', quantite, unite: 'u', prixUnitaireHT: prix, tva: 20, remise: 0, ...extra });

const devis = (id: string, clientId: string, date: string, lignes: LigneDevis[], extra: Partial<Devis> = {}): Devis =>
  ({ id, numero: id, clientId, dateCreation: date, dateValidite: date, statut: 'envoyé', lignes, ...extra } as Devis);

describe('faits', () => {
  it('une ligne d\'article par fait, groupes et textes écartés, type absent = article', () => {
    const f = faitsDevis([devis('D1', 'c1', '2026-01-10', [
      ligne(undefined, 0, 0, { type: 'groupe', description: 'Groupe' }),
      ligne('p1', 2, 100),
      ligne(undefined, 0, 0, { type: 'texte' }),
      ligne('p2', 3, 10, { type: 'ligne' }),
    ])], ctx);
    expect(f.map(x => x.article)).toEqual(['FLOWFAST 319', 'Quartz 0,3-0,8']);
    expect(f[0].famille).toBe('ISOMARK');
    expect(f[0].totalHT).toBe(200);
  });

  it('le port devient un fait, la remise est appliquée, les modèles système restent dehors', () => {
    const f = faitsDevis([
      devis('D1', 'c1', '2026-01-10', [ligne('p1', 2, 100, { remise: 10 })], { fraisPortHT: 51 }),
      devis('M', 'c1', '2026-01-10', [ligne('p1', 9, 100)], { statut: 'système' }),
    ], ctx);
    expect(f.map(x => [x.article, x.totalHT])).toEqual([['FLOWFAST 319', 180], ['Frais de port', 51]]);
  });

  it('un avoir se déduit, une proforma ne compte pas', () => {
    const fac = (id: string, extra: Partial<FactureClient>) =>
      ({ id, numero: id, clientId: 'c1', dateCreation: '2026-02-01', statut: 'envoyée', lignes: [ligne('p1', 2, 50)], totalHT: 0, totalTVA: 0, totalTTC: 0, fraisPortHT: 0, ...extra } as FactureClient);
    const f = faitsFactures([fac('F1', {}), fac('A1', { typeDocument: 'avoir' }), fac('PF', { estProforma: true })], ctx);
    const p = construirePivot(f, ['article'], null);
    expect(valeurMesure(p.racine.total, 'totalHT')).toBe(0);
    expect(valeurMesure(p.racine.total, 'quantite')).toBe(0);
    expect(valeurMesure(p.racine.total, 'documents')).toBe(2);
  });
});

describe('pivot', () => {
  const faits = faitsDevis([
    devis('D1', 'c1', '2026-01-10', [ligne('p1', 2, 100), ligne('p2', 3, 10)]),
    devis('D2', 'c2', '2026-02-05', [ligne('p1', 1, 100)]),
    devis('D3', 'c1', '2026-02-20', [ligne('p2', 10, 10)]),
  ], ctx);

  it('lignes × colonnes, totaux et sous-totaux', () => {
    const p = construirePivot(faits, ['client'], 'mois');
    expect(p.colonnes.map(c => c.libelle)).toEqual(['janvier 2026', 'février 2026']);
    expect(p.racine.enfants.map(n => n.libelle)).toEqual(['AUBRAC SIGNAL', 'TOP SIGNALISATION']);
    const top = p.racine.enfants[1];
    expect(valeurMesure(top.total, 'totalHT')).toBe(330);
    expect(valeurMesure(top.parColonne.get(cheminColonne('2026-01')), 'totalHT')).toBe(230);
    expect(valeurMesure(top.parColonne.get(cheminColonne('2026-02')), 'quantite')).toBe(10);
    expect(valeurMesure(p.racine.total, 'totalHT')).toBe(430);
  });

  it('le nombre de documents est un vrai compte distinct, pas une somme', () => {
    const p = construirePivot(faits, ['client', 'article'], null);
    const top = p.racine.enfants[1];
    expect(top.enfants).toHaveLength(2);
    expect(top.enfants.reduce((s, n) => s + (valeurMesure(n.total, 'documents') ?? 0), 0)).toBe(3);
    expect(valeurMesure(top.total, 'documents')).toBe(2);
    expect(valeurMesure(top.total, 'lignes')).toBe(3);
  });

  it('prix moyen = total ÷ quantité', () => {
    const p = construirePivot(faits, ['article'], null);
    const quartz = p.racine.enfants.find(n => n.libelle.includes('Quartz'))!;
    expect(valeurMesure(quartz.total, 'prixMoyen')).toBe(10);
  });

  it('dépliage et tri par mesure', () => {
    const p = construirePivot(faits, ['client', 'article'], null);
    expect(lignesVisibles(p.racine, new Set())).toHaveLength(3);
    expect(lignesVisibles(p.racine, new Set(cheminsDepliables(p.racine)))).toHaveLength(6);
    const trie = trierParMesure(p.racine, 'totalHT', null, 'desc');
    expect(trie.enfants.map(n => n.libelle)).toEqual(['TOP SIGNALISATION', 'AUBRAC SIGNAL']);
  });

  it("mois de l'année × année : N et N-1 alignés", () => {
    const f = faitsDevis([
      devis('A', 'c1', '2025-03-10', [ligne('p1', 1, 100)]),
      devis('B', 'c1', '2026-03-12', [ligne('p1', 1, 150)]),
    ], ctx);
    const p = construirePivot(f, ['moisAnnee'], 'annee');
    // Toutes les périodes s'affichent, même vides (12 mois entre mars 2025 et mars 2026).
    expect(p.racine.enfants.map(n => n.libelle)).toHaveLength(12);
    expect(valeurMesure(p.racine.enfants.find(n => n.libelle === 'mars')!.parColonne.get(cheminColonne('2026')), 'totalHT')).toBe(150);
    expect(valeurMesure(p.racine.enfants.find(n => n.libelle === 'mai')!.total, 'totalHT')).toBeNull();
    expect(p.colonnes.map(c => c.libelle)).toEqual(['2025', '2026']);
  });

  it('colonnes sur deux niveaux : sous-totaux vrais et dépliage', () => {
    const f = faitsDevis([
      devis('A', 'c1', '2025-03-10', [ligne('p1', 1, 100)]),
      devis('B', 'c1', '2026-03-12', [ligne('p1', 1, 150)]),
      devis('C', 'c1', '2026-04-02', [ligne('p1', 2, 10)]),
    ], ctx);
    const p = construirePivot(f, [], ['annee', 'mois']);
    expect(p.colonnes.map(c => c.libelle)).toEqual(['2025', '2026']);
    expect(valeurMesure(p.racine.parColonne.get(cheminColonne('2026')), 'totalHT')).toBe(170);
    expect(valeurMesure(p.racine.parColonne.get(cheminColonne('2026', '2026-04')), 'totalHT')).toBe(20);
    expect(valeurMesure(p.racine.parColonne.get(cheminColonne('2026')), 'documents')).toBe(2);
    expect(colonnesFeuilles(p.colRacine, new Set()).map(c => c.libelle)).toEqual(['2025', '2026']);
    // Sous 2026, tous les mois de l'année jusqu'au dernier fait (avril), même vides.
    expect(colonnesFeuilles(p.colRacine, new Set([cheminColonne('2026')])).map(c => c.libelle)).toEqual(['2025', 'janvier 2026', 'février 2026', 'mars 2026', 'avril 2026']);
    expect(colonnesFeuilles(construirePivot(f, [], []).colRacine, new Set())).toEqual([]);
  });

  it('trimestre déplié en mois : les trois mois, même sans vente', () => {
    const f = faitsDevis([
      devis('A', 'c1', '2025-01-10', [ligne('p1', 1, 100)]),
      devis('B', 'c1', '2025-11-12', [ligne('p1', 1, 150)]),
    ], ctx);
    const p = construirePivot(f, [], ['annee', 'trimestre', 'mois']);
    const a2025 = p.colonnes[0];
    expect(a2025.enfants.map(t => t.libelle)).toEqual(['T1 2025', 'T2 2025', 'T3 2025', 'T4 2025']);
    expect(a2025.enfants[0].enfants.map(m => m.libelle)).toEqual(['janvier 2025', 'février 2025', 'mars 2025']);
    expect(valeurMesure(p.racine.parColonne.get(cheminColonne('2025', '2025-T2')), 'totalHT')).toBeNull();
  });
});
