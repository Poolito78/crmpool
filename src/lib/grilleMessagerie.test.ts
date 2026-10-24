import { describe, expect, it } from 'vitest';
import { lireGrilleAffretement, type ItemPDF } from './grilleAffretement';
import { departementsDeListe, lireGrilleMessagerie } from './grilleMessagerie';
import { portFournisseur, prixMessagerie, raisonSansGrille, type Fournisseur } from './store';

/* Cellules relevées sur « TARIFS MESSAGERIE 2026 - ISOSIGN (002).pdf » (QRM). */
const c = (str: string, x: number, y: number, page: number): ItemPDF => ({ str, x, y, page });
const ITEMS: ItemPDF[] = [
  c('TARIFS HT MESSAGERIE 2026', 251, 504, 1),
  c('0 à 4 kg', 112, 441, 1), c('5 à 9 kg', 162, 441, 1), c('90 à 99 kg', 658, 441, 1),
  c('Zone 01', 61, 411, 1), c('18,00 €', 121, 411, 1), c('19,00 €', 171, 411, 1), c('48,00 €', 663, 411, 1),
  c('Zone 03', 61, 371, 1), c('32,00 €', 121, 371, 1), c('37,00 €', 171, 371, 1), c('99,00 €', 663, 371, 1),
  c('Zone 10', 61, 229, 1), c('41,00 €', 121, 229, 1), c('52,00 €', 171, 229, 1), c('153,00 €', 661, 229, 1),
  c('Corse', 65, 209, 1), c('148,00 €', 116, 209, 1), c('171,00 €', 166, 209, 1), c('474,00 €', 667, 209, 1),
  c("Prix HT, hors SG et hors frais supplémentaires & complémentaires - en € - au départ d'ALIZAY (27)", 161, 87, 1),
  c('01/08/2026 au 31/12/2026', 625, 491, 2),
  c('Zone 01', 65, 411, 2), c('27', 109, 411, 2), c('80', 565, 411, 2),
  c('Zone 03', 64, 372, 2), c('02', 109, 372, 2), c(';', 121, 372, 2), c('41', 125, 372, 2), c(';', 137, 372, 2),
  c('91-95', 141, 372, 2), c('51', 610, 372, 2),
  c('Zone 10', 64, 230, 2), c('13', 109, 230, 2), c(';', 121, 230, 2), c('; 98', 137, 230, 2), c('15', 573, 230, 2),
  c('Corse', 69, 210, 2), c('20', 109, 210, 2), c('48', 593, 210, 2),
  c('FRAIS SUPPLÉMENTAIRES', 166, 182, 2),
  c('Participation sûreté, sécurité et environnement', 60, 169, 2), c('3,30 €', 237, 169, 2), c('Pour tout envoi', 309, 169, 2), c('31', 534, 169, 2),
  c('Zone A', 180, 152, 2),
  c('FRAIS COMPLÉMENTAIRES', 165, 112, 2),
  c('Marchandises dangereuses', 90, 100, 2), c('12,00 €', 235, 100, 2), c('Par envoi concerné', 302, 100, 2),
];

describe('lireGrilleMessagerie', () => {
  const g = lireGrilleMessagerie(ITEMS)!;

  it('lit un prix par zone et par tranche de poids', () => {
    expect(g.tranches).toEqual([{ min: 0, max: 4 }, { min: 5, max: 9 }, { min: 90, max: 99 }]);
    expect(g.zones.find(z => z.zone === '01')?.prix).toEqual([18, 19, 48]);
    expect(g.zones.find(z => z.zone === 'CORSE')?.prix).toEqual([148, 171, 474]);
  });

  it('rattache les départements à leur zone, sans les numéros de la carte', () => {
    expect(g.departements['27']).toBe('01');
    expect(['02', '41', '91', '93', '95'].map(d => g.departements[d])).toEqual(['03', '03', '03', '03', '03']);
    expect(g.departements['13']).toBe('10');
    expect(g.departements['98']).toBe('10');
    expect(g.departements['2A']).toBe('CORSE');
    expect(g.departements['80']).toBeUndefined();
    expect(g.departements['51']).toBeUndefined();
  });

  it('compte le supplément « pour tout envoi », rappelle les autres frais', () => {
    expect(g.supplementParEnvoi).toBe(3.3);
    expect(g.conditions).toContain('Marchandises dangereuses 12,00 € Par envoi concerné');
    expect(g.conditions).toContain('Zone A');
    expect(g.validite).toBe('01/08/2026 au 31/12/2026');
    expect(g.depart).toBe('ALIZAY (27)');
  });

  it("n'est pas prise pour une grille d'affrètement (« Zone 01 » n'est pas l'Ain)", () => {
    expect(lireGrilleAffretement(ITEMS)).toBeNull();
  });
});

it('departementsDeListe', () => {
  expect(departementsDeListe('30 ; 31 ; 32 ; 46-48 ; 20')).toEqual(['30', '31', '32', '46', '47', '48', '2A', '2B']);
});

describe('port : messagerie pour les colis, affrètement au-delà', () => {
  const messagerie = { ...lireGrilleMessagerie(ITEMS)!, dateImport: '2026-10-24' };
  const affretement = {
    dateImport: '2026-10-24', kgParPalette: 1000,
    tarifs: [{ dept: '13', paliers: [{ palettes: 1, prix: 246 }, { palettes: 2, prix: 375 }] }],
  };
  const qrm = { francoPort: 0, coutTransport: 90, grilleMessagerie: messagerie, grilleAffretement: affretement } as Fournisseur;

  it('prix messagerie = tranche de la zone + supplément ; « 0 à 4 kg » vaut jusqu’à 5 kg', () => {
    expect(prixMessagerie(messagerie, '13', 4.5)).toMatchObject({ prix: 44.3, zone: '10' });
    expect(prixMessagerie(messagerie, '27', 99.5)?.prix).toBe(51.3);
    expect(prixMessagerie(messagerie, '27', 100)).toBeNull();
  });

  it('choisit la grille selon le poids', () => {
    expect(portFournisseur(qrm, 7, 500, '13')).toMatchObject({ source: 'messagerie', mode: 'messagerie', montant: 55.3, zone: '10' });
    expect(portFournisseur(qrm, 1500, 500, '13')).toMatchObject({ source: 'affretement', mode: 'affretement', montant: 375, palettes: 2 });
  });

  it('dit pourquoi aucune grille ne chiffre', () => {
    expect(raisonSansGrille(qrm, 7, 500, undefined)).toMatch(/messagerie : département de livraison inconnu/);
    expect(raisonSansGrille(qrm, 7, 500, '13')).toBeUndefined();
    expect(raisonSansGrille({ ...qrm, grilleAffretement: undefined }, 300, 500, '13')).toMatch(/au-delà de ses tranches/);
  });
});
