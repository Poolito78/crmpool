import { describe, it, expect } from 'vitest';
import {
  prixPanneau, panonceauPour, supportPour, formeDeCode, codeDansTexte,
  hauteurDeDimension, groupePanonceau, niveauDepuisContrat,
} from './tarifPanneaux';

describe('niveau de tarif lu dans le contrat cadre', () => {
  it('lit le niveau du contrat de REFLEX', () => {
    expect(niveauDepuisContrat(
      'CCI10019 TARIF R4 - 35% REMISE POLICE-DIREC-MAT-SUP-BRID-COLL-SIL ISOSIGN 2026',
    )).toBe('R4');
  });

  it('les 35 % du libellé sont R4, pas une remise à appliquer en plus', () => {
    // R0 → R4 vaut exactement −35 % : le libellé décrit la construction du
    // tarif, il ne demande pas de retrancher encore 35 %.
    const r0 = prixPanneau('B14-30', { taille: 'P', classe: 2, niveau: 'R0' })!.prix;
    const r4 = prixPanneau('B14-30', { taille: 'P', classe: 2, niveau: 'R4' })!.prix;
    expect(r4 / r0).toBeCloseTo(0.65, 4);
    expect(r4).toBeCloseTo(46.62);
    // Ce qu'on obtiendrait en appliquant la remise deux fois — à ne pas faire.
    expect(r4 * 0.65).toBeCloseTo(30.30, 1);
  });

  it('reconnaît les autres niveaux', () => {
    expect(niveauDepuisContrat('TARIF R0 PUBLIC 2026')).toBe('R0');
    expect(niveauDepuisContrat('CCI99 TARIF-R2 ISOSIGN')).toBe('R2');
  });

  it('ne dit rien quand le contrat ne précise pas', () => {
    expect(niveauDepuisContrat('REFLEX SIGNALISATION (ISO-STI) (EUR)')).toBeNull();
    expect(niveauDepuisContrat(null)).toBeNull();
    expect(niveauDepuisContrat('')).toBeNull();
  });
});

describe('forme tarifaire d’un code IISR', () => {
  it('reconnaît les grandes familles', () => {
    expect(formeDeCode('B14')).toContain('Cercle');
    expect(formeDeCode('C18')).toContain('Carré');
    expect(formeDeCode('A13b')).toContain('Triangle');
    expect(formeDeCode('M9z')).toBe('Panonceau');
  });

  it('ne prend pas un STOP pour un triangle de danger', () => {
    // AB4 commence par « A » : sans un test préalable, il serait facturé au
    // tarif triangle au lieu du tarif octogone.
    expect(formeDeCode('AB4')).toContain('Octogone');
    expect(formeDeCode('AB3a')).toContain('Triangle');
  });
});

describe('prix d’un panneau', () => {
  it('donne le prix du B14 en gamme petite classe 2', () => {
    // C'est la demande de REFLEX : « B14 « 30 » », gamme petite, classe 2.
    // Le catalogue du Chiffrage porte 46,62 € pour cette combinaison.
    const c = prixPanneau('B14-30', { taille: 'P', classe: 2 });
    expect(c?.prix).toBeCloseTo(46.62);
    expect(c?.dimension).toBe('650 (P)');
  });

  it('distingue les gammes', () => {
    expect(prixPanneau('B14-30', { taille: 'M', classe: 2 })?.prix).toBeCloseTo(26.54);
    expect(prixPanneau('B14-30', { taille: 'N', classe: 2 })?.prix).toBeCloseTo(67.06);
  });

  it('distingue les classes', () => {
    expect(prixPanneau('B14-30', { taille: 'P', classe: 1 })?.prix).toBeCloseTo(43.0);
    expect(prixPanneau('B14-30', { taille: 'P', classe: 3 })?.prix).toBeCloseTo(56.95);
  });

  it('ne rabat pas sur une taille voisine quand elle n’existe pas', () => {
    // Le triangle en classe 1 n'existe qu'en trois tailles : proposer un prix
    // pour la quatrième reviendrait à vendre un article inexistant.
    expect(prixPanneau('A13b', { taille: 'G', classe: 1 })).toBeNull();
    expect(prixPanneau('A13b', { taille: 'G', classe: 2 })?.prix).toBeCloseTo(90.84);
  });
});

describe('panonceau associé', () => {
  it('dimensionne le panonceau d’après la gamme du panneau', () => {
    // Sous un B14 en gamme P, un M9z étroit fait 500x150.
    const p = panonceauPour('M9z', 'B14-30', { taille: 'P', classe: 2 });
    expect(p?.dimension).toBe('500x150');
    expect(p?.prix).toBeCloseTo(20.70);
  });

  it('élargit le panonceau sous un panneau de danger', () => {
    // Même classe, même gamme : le groupe A part de 500 là où ABC part de 350.
    expect(groupePanonceau('A13b')).toBe('A');
    expect(groupePanonceau('B14-30')).toBe('ABC');
    const sousDanger = panonceauPour('M1', 'A13b', { taille: 'M', classe: 2 });
    const sousCercle = panonceauPour('M1', 'B14-30', { taille: 'M', classe: 2 });
    expect(sousDanger?.dimension).toBe('500x150');
    expect(sousCercle?.dimension).toBe('350x150');
  });

  it('tient compte de la classe du panonceau', () => {
    // M4c porte un pictogramme : deux lignes, donc plus haut que M1.
    expect(panonceauPour('M1', 'B14-30', { taille: 'P' })?.dimension).toBe('500x150');
    expect(panonceauPour('M4c', 'B14-30', { taille: 'P' })?.dimension).toBe('500x350');
    expect(panonceauPour('M7', 'B14-30', { taille: 'P' })?.dimension).toBe('500x500');
  });
});

describe('support', () => {
  it('déduit la longueur de la hauteur libre et de l’ancrage', () => {
    // 0,50 d'ancrage + 2,10 de hauteur libre + 0,65 de panneau = 3,25
    // → mât de 3,50 m, la longueur standard immédiatement supérieure.
    const s = supportPour([0.65]);
    expect(s?.longueur).toBe(3.5);
    expect(s?.prix).toBeCloseTo(30.74);
  });

  it('allonge le mât quand un panonceau s’ajoute', () => {
    // 0,50 + 2,10 + 0,15 de panonceau + 0,65 de panneau = 3,40 → 3,50 m.
    // Avec un panonceau haut, on bascule au cran suivant.
    expect(supportPour([0.65, 0.15])?.longueur).toBe(3.5);
    expect(supportPour([0.65, 0.5])?.longueur).toBe(4);
  });

  it('compte un collier par élément porté', () => {
    expect(supportPour([0.65])?.colliers).toBe(1);
    expect(supportPour([0.65, 0.15])?.colliers).toBe(2);
  });
});

describe('lecture d’une demande en clair', () => {
  it('retrouve le code et sa valeur', () => {
    expect(codeDansTexte('B14 « 30 »')).toEqual({ code: 'B14', valeur: '30' });
    expect(codeDansTexte('C18')?.code).toBe('C18');
    expect(codeDansTexte('panneau AB4 stop')?.code).toBe('AB4');
  });

  it('lit une variante suivie d’un chiffre', () => {
    // B21a2, B21a1, AB3a, CE15a n'étaient reconnus par AUCUNE règle : le motif
    // s'arrêtait à la lettre et exigeait ensuite une fin de mot, que le chiffre
    // empêchait. Ces panneaux n'avaient donc ni tarif ni recherche Odoo.
    expect(codeDansTexte('B21a2')?.code).toBe('B21A2');
    expect(codeDansTexte('B21a1')?.code).toBe('B21A1');
    expect(codeDansTexte('AB3a')?.code).toBe('AB3A');
    expect(codeDansTexte('CE15a')?.code).toBe('CE15A');
  });

  it('donne au B21a2 sa forme de cercle et son prix', () => {
    expect(formeDeCode('B21A2')).toContain('Cercle');
    expect(prixPanneau('B21A2', { taille: 'P', classe: 2 })?.prix).toBeCloseTo(46.62);
    expect(prixPanneau('B21A2', { taille: 'P', classe: 2 })?.dimension).toBe('650 (P)');
  });

  it('ne voit pas de code là où il n’y en a pas', () => {
    expect(codeDansTexte('Support Ø 60 mm long 3.50 m')).toBeNull();
  });
});

describe('hauteur d’une dimension', () => {
  it('lit la hauteur des deux écritures du tarif', () => {
    expect(hauteurDeDimension('650 (P)')).toBeCloseTo(0.65);
    expect(hauteurDeDimension('500x150')).toBeCloseTo(0.15);
  });
});
