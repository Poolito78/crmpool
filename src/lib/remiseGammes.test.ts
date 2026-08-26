import { describe, it, expect } from 'vitest';
import { niveauGamme, prixApplicateur, REMISE_GAMME } from './remiseGammes';

describe('niveau lu dans la catégorie Odoo', () => {
  it('reconnaît H1 et H2 tels qu\'Odoo les écrit', () => {
    expect(niveauGamme('ISOMARK / H1', 'ISOMARK')).toBe('H1');
    expect(niveauGamme('ISOMARK / H2', 'ISOMARK')).toBe('H2');
  });

  it('ne prend pas H10 ou 2H pour H1 ou H2', () => {
    expect(niveauGamme('ISOMARK / H12', 'ISOMARK')).toBeNull();
    expect(niveauGamme('CHAUFFAGE 2H', 'ISOMARK')).toBeNull();
  });

  it('range les catégories de résine chez ISOFLOOR', () => {
    for (const c of ['EPOXY', 'MMA', 'PU', 'GRANULATS', 'PIGMENTS',
                     'VANDEX', 'ACCESSOIRES', 'ISOMARK / FLOORING / EPOXY']) {
      expect(niveauGamme(c, 'ISOFLOOR')).toBe('ISOFLOOR');
    }
  });

  it('suit le catalogue quand la catégorie est muette', () => {
    expect(niveauGamme('', 'ISOFLOOR')).toBe('ISOFLOOR');
    expect(niveauGamme(undefined, 'ISOFLOOR')).toBe('ISOFLOOR');
  });

  it('ne remise pas une prestation de pose', () => {
    /* 218 articles ISOMARK sont des lignes de pose et de préparation.
       Les remiser de moitié ferait travailler les équipes à moitié prix. */
    expect(niveauGamme('POSE-MARQUAGE', 'ISOMARK')).toBeNull();
    expect(niveauGamme('MAIN DOEUVRE', undefined)).toBeNull();
  });

  it('avoue son ignorance plutôt que de deviner', () => {
    /* FILM compte 64 articles ISOMARK sans H1 ni H2. Deviner l'un des deux
       ferait 20 points d'écart sur le prix. */
    expect(niveauGamme('FILM', 'ISOMARK')).toBeNull();
    expect(niveauGamme('', 'ISOMARK')).toBeNull();
  });
});

describe('prix applicateur', () => {
  it('applique 50 % en H1 et 30 % en H2', () => {
    expect(prixApplicateur(100, 'ISOMARK / H1', 'ISOMARK')!.prix).toBe(50);
    expect(prixApplicateur(100, 'ISOMARK / H2', 'ISOMARK')!.prix).toBe(70);
  });

  it('applique 30 % sur ISOFLOOR', () => {
    const p = prixApplicateur(238.17, 'EPOXY', 'ISOFLOOR')!;
    expect(p.niveau).toBe('ISOFLOOR');
    expect(p.prix).toBeCloseTo(166.72, 2);
  });

  it('laisse le prix public quand le niveau est inconnu', () => {
    const p = prixApplicateur(78.03, 'FILM', 'ISOMARK')!;
    expect(p.remise).toBe(0);
    expect(p.prix).toBe(78.03);
    expect(p.explication).toMatch(/inconnu/);
  });

  it('ne remise pas un prix qui n\'en est pas un', () => {
    /* Chez ISOSIGN 7 670 fiches Odoo portent moins de 2 € : ce sont des
       reliquats d'import, pas des tarifs. */
    expect(prixApplicateur(0, 'ISOMARK / H1', 'ISOMARK')).toBeNull();
    expect(prixApplicateur(null, 'ISOMARK / H1', 'ISOMARK')).toBeNull();
  });

  it('arrondit au centime', () => {
    expect(prixApplicateur(33.33, 'ISOMARK / H2', 'ISOMARK')!.prix).toBe(23.33);
  });

  it('tient les taux annoncés', () => {
    expect(REMISE_GAMME.H1).toBe(0.5);
    expect(REMISE_GAMME.H2).toBe(0.3);
    expect(REMISE_GAMME.ISOFLOOR).toBe(0.3);
  });
});

describe('les gammes ne débordent pas sur ISOSIGN', () => {
  it('ne remise pas les accessoires de mât', () => {
    /* 84 articles ISOSIGN portent « … / Accessoires Mats / … ». Chercher le
       mot « ACCESSOIRES » dans le chemin les rangeait chez ISOFLOOR et leur
       ôtait 30 %. */
    for (const c of ['ELEMENTS DE FIXATION / Accessoires Mats / Ancrage',
                     'ELEMENTS DE FIXATION / Accessoires Mats',
                     'PLASTIQUE / Autres produits de sécurité']) {
      expect(niveauGamme(c, 'ISOSIGN')).toBeNull();
      expect(niveauGamme(c, undefined)).toBeNull();
    }
  });

  it('reconnaît quand même le chemin FLOORING', () => {
    expect(niveauGamme('ISOMARK / FLOORING / ACCESSOIRES', undefined)).toBe('ISOFLOOR');
  });
});
