import { describe, it, expect } from 'vitest';
import { periodesDePrix, type MouvementPrix } from './journalPrix';

function mvt(p: Partial<MouvementPrix> & { quand: string }): MouvementPrix {
  return { id: 1, produitId: 'p1', ...p };
}

/* Le FLOWCOAT SF41 BLANK tel que la fiche le montre : achat 86,82 €,
   revendeur 138,92 €. */
const FICHE = { prixAchat: 86.82, prixHT: 138.92 };

describe('périodes de prix', () => {
  it('ouvre et ferme une période à chaque mouvement', () => {
    const p = periodesDePrix([
      mvt({ id: 1, quand: '2026-03-12T10:00:00Z', achatAvant: 80, achatApres: 86.82, venteAvant: 130, venteApres: 130 }),
      mvt({ id: 2, quand: '2026-09-01T23:03:00Z', achatAvant: 86.82, achatApres: 86.82, venteAvant: 130, venteApres: 138.92 }),
    ], FICHE);

    // Rendues de la plus récente à la plus ancienne.
    expect(p).toHaveLength(3);

    expect(p[0].debut).toBe('2026-09-01T23:03:00Z');
    expect(p[0].fin).toBeUndefined();          // en cours
    expect(p[0].prixAchat).toBeCloseTo(86.82);
    expect(p[0].prixVente).toBeCloseTo(138.92);

    expect(p[1].debut).toBe('2026-03-12T10:00:00Z');
    expect(p[1].fin).toBe('2026-09-01T23:03:00Z');
    expect(p[1].prixVente).toBeCloseTo(130);

    // La plus ancienne n'a pas de début : le journal ne remonte pas plus loin.
    expect(p[2].debut).toBeUndefined();
    expect(p[2].prixAchat).toBeCloseTo(80);
  });

  it('dit ce qui a changé à l’entrée de chaque période', () => {
    const p = periodesDePrix([
      mvt({ id: 1, quand: '2026-01-01T00:00:00Z', achatAvant: 10, achatApres: 12, venteAvant: 20, venteApres: 20 }),
      mvt({ id: 2, quand: '2026-02-01T00:00:00Z', achatAvant: 12, achatApres: 12, venteAvant: 20, venteApres: 25 }),
      mvt({ id: 3, quand: '2026-03-01T00:00:00Z', achatAvant: 12, achatApres: 15, venteAvant: 25, venteApres: 30 }),
    ]);
    expect(p.map(x => x.changement))
      .toEqual(['les deux', 'vente', 'achat', 'origine']);
  });

  it('n’a qu’une période, sans date, quand rien n’a jamais bougé', () => {
    const p = periodesDePrix([], FICHE);
    expect(p).toHaveLength(1);
    expect(p[0].debut).toBeUndefined();
    expect(p[0].fin).toBeUndefined();
    expect(p[0].prixAchat).toBeCloseTo(86.82);
    expect(p[0].changement).toBe('origine');
  });

  it('ne renvoie rien sans mouvement ni fiche', () => {
    expect(periodesDePrix([])).toEqual([]);
  });

  /* LA FICHE FAIT FOI POUR LA PÉRIODE EN COURS.
     Les huit lignes passées à 100 € le 1er septembre l'ont été par une reprise
     Odoo ; si quelqu'un corrige ensuite le prix hors application, le journal
     l'ignore et afficherait un prix qui n'est plus le bon. */
  it('corrige la période en cours sur la fiche, et le signale', () => {
    const p = periodesDePrix([
      mvt({ id: 1, quand: '2026-09-01T23:03:00Z', achatAvant: 80, achatApres: 80, venteAvant: 267.24, venteApres: 100 }),
    ], { prixAchat: 86.82, prixHT: 138.92 });

    expect(p[0].prixVente).toBeCloseTo(138.92);   // pas les 100 € du journal
    expect(p[0].prixAchat).toBeCloseTo(86.82);
    expect(p[0].ecartAvecFiche).toBe(true);
  });

  it('ne signale aucun écart quand le journal et la fiche concordent', () => {
    const p = periodesDePrix([
      mvt({ id: 1, quand: '2026-09-01T23:03:00Z', achatAvant: 80, achatApres: 86.82, venteAvant: 130, venteApres: 138.92 }),
    ], FICHE);
    expect(p[0].ecartAvecFiche).toBeUndefined();
  });

  it('remet les mouvements dans l’ordre, quel que soit celui reçu', () => {
    // La requête les rend du plus récent au plus ancien.
    const p = periodesDePrix([
      mvt({ id: 2, quand: '2026-02-01T00:00:00Z', achatAvant: 12, achatApres: 15 }),
      mvt({ id: 1, quand: '2026-01-01T00:00:00Z', achatAvant: 10, achatApres: 12 }),
    ]);
    expect(p[0].debut).toBe('2026-02-01T00:00:00Z');
    expect(p[0].prixAchat).toBe(15);
    expect(p[2].prixAchat).toBe(10);
  });

  /* FLOWCOATPD, 26/10 : achat 131,33 → 156,50, public 300,17 → 372,86,
     revendeur 261 sur la fiche. Le journal d'avant la migration ne porte pas
     de revendeur : seule la période en cours en a un, celui de la fiche. */
  it('porte le revendeur : consigné s’il l’est, celui de la fiche pour la période en cours', () => {
    const p = periodesDePrix([
      mvt({ id: 1, quand: '2026-10-26T15:46:09Z', achatAvant: 131.325, achatApres: 156.5, venteAvant: 300.17, venteApres: 357.71 }),
      mvt({ id: 2, quand: '2026-10-26T15:47:34Z', achatAvant: 156.5, achatApres: 156.5, venteAvant: 357.71, venteApres: 372.86,
            revendeurAvant: 250.4, revendeurApres: 261 }),
    ], { prixAchat: 156.5, prixHT: 372.86, prixRevendeur: 261 });
    expect(p[0].prixRevendeur).toBe(261);
    expect(p[0].ecartAvecFiche).toBeUndefined();
    expect(p[1].prixRevendeur).toBeUndefined();   // avant qu'on le consigne
    expect(p[2].prixAchat).toBeCloseTo(131.325);
    expect(p[2].prixVente).toBeCloseTo(300.17);
  });

  it('un changement du seul revendeur est un changement de vente', () => {
    const p = periodesDePrix([
      mvt({ id: 1, quand: '2026-11-01T00:00:00Z', achatAvant: 10, achatApres: 10, venteAvant: 20, venteApres: 20,
            revendeurAvant: 14, revendeurApres: 15 }),
    ]);
    expect(p[0].changement).toBe('vente');
  });

  it('tient un écart d’un demi-centime pour un non-changement', () => {
    // Les prix arrivent d'Odoo avec des décimales longues : 9.088000000000001.
    const p = periodesDePrix([
      mvt({ id: 1, quand: '2026-01-01T00:00:00Z',
            achatAvant: 9.088000000000001, achatApres: 9.088,
            venteAvant: 100, venteApres: 120 }),
    ]);
    expect(p[0].changement).toBe('vente');
  });
});
