import { describe, it, expect } from 'vitest';
import { ordonner, appliquerOrdre, structureDe, placer, LISTE_RACINE } from './ordreNav';

const id = (s: string) => s;

describe('ordonner', () => {
  it('suit l\'ordre enregistré', () => {
    expect(ordonner(['a', 'b', 'c'], id, ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });
  it('sans ordre, rend la liste telle quelle', () => {
    expect(ordonner(['a', 'b'], id, undefined)).toEqual(['a', 'b']);
  });
  it('une entrée nouvelle garde sa place d\'origine', () => {
    expect(ordonner(['a', 'n', 'b', 'c'], id, ['c', 'b', 'a'])).toEqual(['c', 'n', 'b', 'a']);
  });
  it('ignore une clé qui ne désigne plus rien', () => {
    expect(ordonner(['a', 'b'], id, ['x', 'b', 'a'])).toEqual(['b', 'a']);
  });
});

type L = { type: 'link'; path: string };
type G = { type: 'group'; label: string; items: L[] };
const l = (path: string): L => ({ type: 'link', path });
const MENU: Array<L | G> = [
  l('/crm'),
  { type: 'group', label: 'Vente', items: [l('/clients'), l('/devis'), l('chiffrage')] },
  l('/stock'),
  l('/transport'),
  { type: 'group', label: 'Paramètres', items: [l('/param')] },
];
const vue = (ordre: Parameters<typeof appliquerOrdre>[1]) => structureDe(appliquerOrdre<L, G>(MENU, ordre));

describe('appliquerOrdre / placer', () => {
  it('sans ordre, le menu d\'origine', () => {
    expect(vue({})).toEqual({
      racine: ['/crm', 'groupe:Vente', '/stock', '/transport', 'groupe:Paramètres'],
      groupes: { Vente: ['/clients', '/devis', 'chiffrage'], Paramètres: ['/param'] },
    });
  });

  it('une page sort de son groupe : entre Stock et Calcul Transport', () => {
    const s = placer(vue({}), 'chiffrage', LISTE_RACINE, '/stock', true);
    expect(vue(s)).toEqual({
      racine: ['/crm', 'groupe:Vente', '/stock', 'chiffrage', '/transport', 'groupe:Paramètres'],
      groupes: { Vente: ['/clients', '/devis'], Paramètres: ['/param'] },
    });
  });

  it('une page passe dans un autre groupe', () => {
    const s = placer(vue({}), 'chiffrage', 'Paramètres', null, false);
    expect(vue(s).groupes).toEqual({ Vente: ['/clients', '/devis'], Paramètres: ['chiffrage', '/param'] });
  });

  it('un lien du premier niveau entre dans un groupe', () => {
    const s = placer(vue({}), '/crm', 'Vente', '/devis', false);
    expect(vue(s).racine[0]).toBe('groupe:Vente');
    expect(vue(s).groupes.Vente).toEqual(['/clients', '/crm', '/devis', 'chiffrage']);
  });

  it('déjà en place : rend la même structure (pas de rendu inutile)', () => {
    const s = vue({});
    expect(placer(s, '/clients', 'Vente', '/devis', false)).toBe(s);
    expect(placer(s, '/devis', 'Vente', '/clients', true)).toBe(s);
  });

  it('un ancien ordre (pages rangées dans leur groupe) reste lu', () => {
    expect(vue({ groupes: { Vente: ['/devis', '/clients'] } }).groupes.Vente).toEqual(['/devis', '/clients', 'chiffrage']);
  });

  it('une page masquée par les droits n\'apparaît pas, même rangée ailleurs', () => {
    const sansParam = MENU.filter(e => !(e.type === 'group' && e.label === 'Paramètres'));
    const s = structureDe(appliquerOrdre<L, G>(sansParam, { racine: ['/param', '/crm'] }));
    expect(s.racine).not.toContain('/param');
  });
});
