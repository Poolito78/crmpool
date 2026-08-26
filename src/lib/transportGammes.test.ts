import { describe, it, expect } from 'vitest';
import {
  poidsDepuisLibelle, estGranulat, portIsomark, portIsofloor,
  FRANCO_ISOMARK_H1, FRANCO_ISOFLOOR_KG, portGammes,
} from './transportGammes';

const ligne = (designation: string, quantite: number, montant: number) =>
  ({ reference: 'X', designation, quantite, montant });

describe('poids lu dans le libellé', () => {
  it('lit les conditionnements réels du catalogue', () => {
    expect(poidsDepuisLibelle('FLOWFAST 107 Primer (20 kg)')).toBe(20);
    expect(poidsDepuisLibelle('FLOWCOAT PA302 A 2,93KG')).toBeCloseTo(2.93, 3);
    expect(poidsDepuisLibelle('Flowcoat SK (14,5 kg)')).toBeCloseTo(14.5, 3);
  });

  it('ne confond pas les grammes avec les kilos', () => {
    /* « 400 gr » vaut 0,4 kg. Le lire comme 400 kg ferait basculer la
       commande dans la tranche la plus chère. */
    expect(poidsDepuisLibelle('FLOWFAST PRIMER ( B ) CATALYST  (400 gr)')).toBeCloseTo(0.4, 4);
  });

  it('ne devine pas un poids absent', () => {
    expect(poidsDepuisLibelle('Flowcoat EPN')).toBeNull();
    expect(poidsDepuisLibelle('')).toBeNull();
  });
});

describe('port ISOMARK', () => {
  it('offre le port au franco de 2 700 €', () => {
    const p = portIsomark([ligne('Produit (20 kg)', 1, FRANCO_ISOMARK_H1)]);
    expect(p.offert).toBe(true);
    expect(p.montant).toBe(0);
  });

  it('applique la tranche de poids sous le franco', () => {
    expect(portIsomark([ligne('Produit (20 kg)', 1, 500)]).montant).toBe(51);
    expect(portIsomark([ligne('Produit (20 kg)', 3, 500)]).montant).toBe(87);   // 60 kg
    expect(portIsomark([ligne('Produit (20 kg)', 10, 500)]).montant).toBe(178); // 200 kg
    expect(portIsomark([ligne('Produit (20 kg)', 50, 500)]).montant).toBe(235); // 1000 kg
  });

  it('bascule en H2 quand la commande n’en relève que d’elle', () => {
    /* Franco à 1 000 € et forfait unique de 51 €, quel que soit le poids. */
    const p = portIsomark([ligne('Produit (900 kg)', 1, 900)], true);
    expect(p.montant).toBe(51);
    expect(portIsomark([ligne('Produit (900 kg)', 1, 1000)], true).offert).toBe(true);
  });
});

describe('port ISOFLOOR', () => {
  it('juge le franco au POIDS, pas au montant', () => {
    /* 5 000 € mais 100 kg : le port reste dû. C'est la différence de fond
       avec ISOMARK. */
    const cher = portIsofloor([ligne('Résine (20 kg)', 5, 5000)]);
    expect(cher.offert).toBe(false);
    expect(cher.montant).toBe(85);

    /* Deux tonnes : offert, même pour une somme modeste. */
    const lourd = portIsofloor([ligne('Résine (20 kg)', 100, 300)]);
    expect(lourd.poidsFranco).toBe(FRANCO_ISOFLOOR_KG);
    expect(lourd.offert).toBe(true);
  });

  it('exclut les granulats du franco mais pas du camion', () => {
    const p = portIsofloor([
      ligne('Résine (20 kg)', 50, 800),        // 1000 kg comptés
      ligne('Granulat quartz (25 kg)', 60, 300), // 1500 kg, hors franco
    ]);
    expect(p.poids).toBe(2500);        // le camion les emporte
    expect(p.poidsFranco).toBe(1000);  // le franco les ignore
    expect(p.offert).toBe(false);
    expect(p.montant).toBe(230);       // tranche 701 et plus
  });

  it('reconnaît un granulat à son libellé', () => {
    expect(estGranulat('Granulat quartz 0,4/0,8')).toBe(true);
    expect(estGranulat('FLOWFAST 107 Primer (20 kg)')).toBe(false);
  });

  it('signale un poids incomplet plutôt que de le taire', () => {
    /* Un article sans poids lisible fausse le total : le calcul doit le dire,
       sinon un franco manqué passe pour un franco atteint. */
    const p = portIsofloor([ligne('Résine sans poids', 1, 100)]);
    expect(p.poidsIncomplet).toBe(true);
  });
});

describe('répartition des expéditions', () => {
  it('sépare H1, H2 et ISOFLOOR en trois ports distincts', () => {
    const ports = portGammes([
      { ...ligne('Peinture (20 kg)', 1, 400), niveau: 'H1' },
      { ...ligne('Résine (20 kg)', 1, 400), niveau: 'H2' },
      { ...ligne('Flowfast (20 kg)', 1, 400), niveau: 'ISOFLOOR' },
    ]);
    expect(ports).toHaveLength(3);
    expect(ports.map(p => p.montant)).toEqual([51, 51, 49]);
  });

  it('ne fait pas franchir un franco par des lignes d\'une autre expédition', () => {
    /* 900 € en H1 et 900 € en H2 : ni l'un ni l'autre n'atteint son seuil,
       alors que 1 800 € cumulés dépasseraient le franco H2. */
    const ports = portGammes([
      { ...ligne('A (20 kg)', 1, 900), niveau: 'H1' },
      { ...ligne('B (20 kg)', 1, 900), niveau: 'H2' },
    ]);
    expect(ports.every(p => !p.offert)).toBe(true);
  });

  it('fait voyager les lignes de niveau inconnu avec H1', () => {
    const ports = portGammes([ligne('Film (5 kg)', 1, 1200)]);
    expect(ports).toHaveLength(1);
    expect(ports[0].offert).toBe(false);   // franco H1 à 2 700 €, pas 1 000 €
  });
});
