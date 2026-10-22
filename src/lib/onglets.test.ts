import { describe, expect, it } from 'vitest';
import { cheminDe, memePage, restaurer, serialiser, versLocation } from './onglets';

describe('memePage', () => {
  it("une entrée sans ?tab= ignore la recherche de l'adresse", () => {
    expect(memePage(versLocation('/devis?search=signal'), '/devis')).toBe(true);
    expect(memePage(versLocation('/devis-fournisseurs'), '/devis')).toBe(false);
  });
  it("une entrée ?tab= exige le même onglet, « dashboard » par défaut", () => {
    expect(memePage(versLocation('/parametres?tab=devis'), '/parametres?tab=devis')).toBe(true);
    expect(memePage(versLocation('/parametres?tab=clients'), '/parametres?tab=devis')).toBe(false);
    expect(memePage(versLocation('/parametres'), '/parametres?tab=dashboard')).toBe(true);
  });
});

describe('restaurer', () => {
  it("sans liste enregistrée : un seul onglet, à l'adresse courante", () => {
    const ici = versLocation('/produits');
    const e = restaurer(null, ici);
    expect(e.onglets).toHaveLength(1);
    expect(e.onglets[0].location).toBe(ici);
    expect(e.actif).toBe(e.onglets[0].id);
  });

  it("l'onglet qui porte déjà l'adresse courante devient actif", () => {
    const avant = restaurer(null, versLocation('/devis'));
    const brut = serialiser({
      onglets: [...avant.onglets, { id: 'b', location: versLocation('/produits') }],
      actif: avant.actif,
    });
    const ici = versLocation('/produits');
    const e = restaurer(brut, ici);
    expect(e.actif).toBe('b');
    expect(e.onglets.map(o => cheminDe(o.location))).toEqual(['/devis', '/produits']);
  });

  it("une autre adresse (lien collé) remplace celle de l'onglet actif", () => {
    const brut = JSON.stringify({ onglets: [{ id: 'a', chemin: '/devis' }, { id: 'b', chemin: '/clients' }], actif: 'b' });
    const e = restaurer(brut, versLocation('/stock'));
    expect(e.actif).toBe('b');
    expect(e.onglets.map(o => cheminDe(o.location))).toEqual(['/devis', '/stock']);
  });

  it('une liste illisible ne bloque pas le démarrage', () => {
    expect(restaurer('{pas du json', versLocation('/')).onglets).toHaveLength(1);
    expect(restaurer(JSON.stringify({ onglets: [{ id: 'x', chemin: 'http://ailleurs' }] }), versLocation('/')).onglets).toHaveLength(1);
  });
});
