import { describe, it, expect } from 'vitest';
import {
  longueurMention, longueurMentionComplete, margeLargeur,
  dimensionnerPanneau, dimensionnerEnsemble, dimensionnerAgglomeration,
  GAMMES_HC, LARGEURS_NORMALISEES,
} from './compositionPanneau';

/**
 * Les valeurs de référence viennent des plans Kadri (« BAT ») fournis par le
 * service signalisation : dossiers AF012964, AF035742 et AF035681. Chaque
 * plan porte, à côté du panneau, la composition retenue sous la forme
 * « L1 125 125% (721) » — alphabet, hauteur de composition, échelle
 * horizontale, et longueur composée en millimètres.
 */
describe('mesure d’une mention', () => {
  /* Kadri annonce ces longueurs À L'ÉCHELLE INDIQUÉE : on divise donc par
     l'échelle pour retrouver la longueur naturelle que calcule le module. */
  const CAS: [string, 'L1' | 'L2' | 'L4', number, number, number][] = [
    // texte,            alphabet, Hc,  échelle, longueur relevée
    ['YVETOT',           'L1', 125, 1.25, 721],
    ['ARDOINES',         'L4', 100, 1.25, 729],
    ['CENTRE VILLE',     'L4', 100, 1.25, 1006],
    ['Z.A. ALLENDE',     'L4', 100, 1.25, 984],
    ['Sanofi',           'L4', 100, 1.25, 444],
    ['Sanofi-Aventis',   'L4', 100, 1.25, 1059],
    ['ALFORTVILLE',      'L1', 100, 1.25, 962],
    ['CRÉTEIL',          'L2', 125, 1.25, 716],
  ];

  it('reproduit les longueurs de Kadri à 4 % près', () => {
    for (const [texte, alphabet, hc, echelle, releve] of CAS) {
      const naturelle = longueurMention(texte, alphabet, hc);
      expect(naturelle, texte).not.toBeNull();
      const calculee = naturelle! * echelle;
      const ecart = Math.abs(calculee - releve) / releve;
      expect(ecart, `${texte} : ${calculee.toFixed(0)} au lieu de ${releve}`)
        .toBeLessThan(0.04);
    }
  });

  it('tient compte du crénage — l’ignorer fausserait la mesure', () => {
    // « AV » se resserre nettement : la paire est crénée dans la police.
    const av = longueurMention('AV', 'L1', 100)!;
    const a = longueurMention('A', 'L1', 100)!;
    const v = longueurMention('V', 'L1', 100)!;
    // Sans crénage la somme serait supérieure, l'espacement inter-signes mis à part.
    expect(av).toBeLessThan(a + v + 0.0315 * 100);
  });

  it('refuse un caractère absent de l’alphabet plutôt que de l’ignorer', () => {
    expect(longueurMention('ЖИТОМИР', 'L1', 100)).toBeNull();
  });

  it('mesure proportionnellement à la hauteur de composition', () => {
    const a = longueurMention('PARIS', 'L1', 100)!;
    const b = longueurMention('PARIS', 'L1', 200)!;
    expect(b / a).toBeCloseTo(2, 5);
  });
});

describe('marge sur la largeur', () => {
  it('vaut deux marges latérales plus la pointe du panneau', () => {
    // Relevés Kadri : 261 mm pour un panneau de 250 de haut, 360 pour 400.
    expect(margeLargeur(100, 250)).toBeCloseTo(267, 0);
    expect(margeLargeur(100, 400)).toBeCloseTo(367, 0);
  });
});

describe('dimensionnement du panneau', () => {
  it('donne la hauteur d’après le nombre de lignes et Hc', () => {
    // Table du fabricant : 1 ligne en 100 → 250 ; 2 lignes en 100 → 400.
    expect(dimensionnerPanneau([{ texte: 'YVETOT', alphabet: 'L1' }], 100)?.hauteur)
      .toBe(250);
    const deux = dimensionnerPanneau(
      [{ texte: 'LE PORT', alphabet: 'L4' }, { texte: 'À L’ANGLAIS', alphabet: 'L4' }],
      100,
    );
    expect(deux?.hauteur).toBe(400);
  });

  it('retient une largeur normalisée', () => {
    const p = dimensionnerPanneau([{ texte: 'CHOISY-LE-ROI', alphabet: 'L1' }], 100);
    expect(p).not.toBeNull();
    expect(LARGEURS_NORMALISEES).toContain(p!.largeur as never);
  });

  it('aligne toutes les mentions sur une largeur commune', () => {
    // C'est la mention la plus longue qui commande ; les autres sont étirées.
    const p = dimensionnerPanneau(
      [{ texte: 'GARE', alphabet: 'L4' }, { texte: 'CENTRE COMMERCIAL', alphabet: 'L4' }],
      100,
    );
    expect(p).not.toBeNull();
    expect(p!.echelles).toHaveLength(2);
    // La mention courte est étirée au maximum, la longue ne peut pas l'être autant.
    expect(p!.echelles[0]).toBeGreaterThanOrEqual(p!.echelles[1]);
  });

  it('ne dépasse jamais l’échelle maximale de 125 %', () => {
    const p = dimensionnerPanneau([{ texte: 'GARE', alphabet: 'L4' }], 100);
    expect(p!.echelles[0]).toBeLessThanOrEqual(1.25);
  });

  it('la mention entre toujours dans la largeur utile', () => {
    for (const texte of ['GARE', 'CHOISY-LE-ROI', 'LE PORT À L’ANGLAIS', 'Sanofi-Aventis']) {
      const p = dimensionnerPanneau([{ texte, alphabet: 'L4' }], 100);
      if (!p) continue;
      const utile = p.largeur - margeLargeur(100, p.hauteur);
      expect(p.longueurs[0], texte).toBeLessThanOrEqual(utile + 0.5);
    }
  });

  it('refuse plutôt que d’inventer un format', () => {
    // Combinaison hors table : 4 lignes n'existent pas.
    expect(dimensionnerPanneau(
      [1, 2, 3, 4].map(() => ({ texte: 'A', alphabet: 'L1' as const })), 100,
    )).toBeNull();
    // Hc hors gamme.
    expect(dimensionnerPanneau([{ texte: 'A', alphabet: 'L1' }], 137)).toBeNull();
    // Texte trop long pour la plus grande largeur.
    expect(dimensionnerPanneau(
      [{ texte: 'A'.repeat(80), alphabet: 'L1' }], 250,
    )).toBeNull();
  });

  it('les gammes de Hc sont celles de l’Instruction', () => {
    expect(GAMMES_HC).toEqual([100, 125, 160, 200, 250, 320]);
  });
});

describe('ensemble de panneaux sur un même mât', () => {
  it('aligne tous les panneaux sur la largeur du plus exigeant', () => {
    /* Cas relevé chez Kadri : une mention courte se retrouve sur un panneau
       plus large que nécessaire parce qu'elle voisine une mention longue. */
    const court = dimensionnerPanneau([{ texte: 'GARE', alphabet: 'L4' }], 100)!;
    const long = dimensionnerPanneau([{ texte: 'CENTRE COMMERCIAL', alphabet: 'L4' }], 100)!;
    expect(court.largeur).toBeLessThan(long.largeur);

    const ensemble = dimensionnerEnsemble([
      [{ texte: 'GARE', alphabet: 'L4' }],
      [{ texte: 'CENTRE COMMERCIAL', alphabet: 'L4' }],
    ], 100)!;
    expect(ensemble[0].largeur).toBe(long.largeur);
    expect(ensemble[1].largeur).toBe(long.largeur);
  });

  it('chaque panneau garde sa propre hauteur', () => {
    const e = dimensionnerEnsemble([
      [{ texte: 'GARE', alphabet: 'L4' }],
      [{ texte: 'LE PORT', alphabet: 'L4' }, { texte: "À L'ANGLAIS", alphabet: 'L4' }],
    ], 100);
    expect(e![0].hauteur).toBe(250);
    expect(e![1].hauteur).toBe(400);
    expect(e![0].largeur).toBe(e![1].largeur);
  });

  it('le texte entre toujours dans la largeur utile de l’ensemble', () => {
    const e = dimensionnerEnsemble([
      [{ texte: 'GARE', alphabet: 'L4' }],
      [{ texte: 'CENTRE COMMERCIAL', alphabet: 'L4' }],
    ], 100)!;
    for (const p of e) {
      const utile = p.largeur - margeLargeur(100, p.hauteur);
      expect(Math.max(...p.longueurs)).toBeLessThanOrEqual(utile + 0.5);
    }
  });
});

describe('mention à fin composée', () => {
  /* Relevés Kadri : « 900 m » se note « L4 250 200 », « 3,5 » se note
     « L1 100 80 » — la seconde hauteur porte sur la fin du texte. */
  it('mesure la fin dans sa propre hauteur', () => {
    const sansFin = longueurMentionComplete({ texte: '3', alphabet: 'L1' }, 100)!;
    const avecFin = longueurMentionComplete(
      { texte: '3', alphabet: 'L1', fin: { texte: ',5', hc: 80 } }, 100)!;
    expect(avecFin).toBeGreaterThan(sansFin);
    // Kadri relève 176 mm pour cette composition.
    expect(avecFin).toBeGreaterThan(160);
    expect(avecFin).toBeLessThan(190);
  });

  it('accepte un changement d’alphabet sur la fin', () => {
    // « 33.1 » : « 33 » en L1 250, « .1 » en L4 200.
    const m = longueurMentionComplete(
      { texte: '33', alphabet: 'L1', fin: { texte: '.1', hc: 200, alphabet: 'L4' } }, 250);
    expect(m).not.toBeNull();
    expect(m!).toBeGreaterThan(0);
  });

  it('refuse si la fin contient un caractère absent (bis)', () => {
    expect(longueurMentionComplete(
      { texte: 'A', alphabet: 'L1', fin: { texte: 'Ж', hc: 80 } }, 100)).toBeNull();
  });

  it('la fin compte dans le choix du format', () => {
    const court = dimensionnerPanneau([{ texte: '900', alphabet: 'L4' }], 250);
    const long = dimensionnerPanneau(
      [{ texte: '900', alphabet: 'L4', fin: { texte: ' m', hc: 200 } }], 250);
    expect(long!.longueurs[0]).toBeGreaterThan(court!.longueurs[0]);
  });
});

describe('entrée et sortie d’agglomération', () => {
  /* Tables du fabricant, catégorie SD1, nom sur une ligne. Le dimensionnement
     s'y fait au COMPTAGE de signes, pas à la mesure typographique. */
  it('choisit la largeur EB10 d’après le nombre de signes', () => {
    expect(dimensionnerAgglomeration('LYON')?.largeur).toBe(800);        // 4
    expect(dimensionnerAgglomeration('NIMES')?.largeur).toBe(800);       // 5, limite
    expect(dimensionnerAgglomeration('ORLEANS')?.largeur).toBe(1000);    // 7, limite
    expect(dimensionnerAgglomeration('MARSEILLE')?.largeur).toBe(1300);  // 9, limite
    expect(dimensionnerAgglomeration('MONTPELLIER')?.largeur).toBe(1600); // 11
  });

  it('la sortie EB20 admet plus de signes — ses lettres sont plus petites', () => {
    // 7 signes : 1000 en entrée (Hc 125), mais 800 suffit en sortie (Hc 100).
    expect(dimensionnerAgglomeration('ORLEANS', 'EB10')?.largeur).toBe(1000);
    expect(dimensionnerAgglomeration('ORLEANS', 'EB20')?.largeur).toBe(800);
    expect(dimensionnerAgglomeration('MARSEILLE', 'EB20')?.largeur).toBe(1000);
  });

  it('impose la hauteur et le Hc propres à chaque type', () => {
    const entree = dimensionnerAgglomeration('LYON', 'EB10')!;
    expect(entree.hauteur).toBe(400);
    expect(entree.hc).toBe(125);
    const sortie = dimensionnerAgglomeration('LYON', 'EB20')!;
    expect(sortie.hauteur).toBe(250);
    expect(sortie.hc).toBe(100);
  });

  it('compte les espaces et les traits d’union', () => {
    /* « QUINCY-VOISI » fait 12 signes, tiret compris. En sortie, 12 est
       justement la limite du 1300 ; en entrée, 12 dépasse les 11 du 1600 et
       impose déjà un 1900. Sans compter le tiret on retomberait à 11, donc
       sur un format trop court. */
    expect(dimensionnerAgglomeration('QUINCY-VOISI', 'EB20')?.caracteres).toBe(12);
    expect(dimensionnerAgglomeration('QUINCY-VOISI', 'EB20')?.largeur).toBe(1300);
    expect(dimensionnerAgglomeration('QUINCY-VOISI', 'EB10')?.largeur).toBe(1900);
  });

  it('retrouve le format du plan Kadri de MOULIGNON', () => {
    /* Dossier AF035681 : l'EB10 porte « MOULIGNON », neuf signes, et le plan
       donne 1300 × 400. C'est le seul EB dont je connaisse le format réel. */
    const p = dimensionnerAgglomeration('MOULIGNON', 'EB10')!;
    expect(p.caracteres).toBe(9);
    expect(p.largeur).toBe(1300);
    expect(p.hauteur).toBe(400);
  });

  it('refuse au-delà de la table — le nom passe alors sur deux lignes', () => {
    expect(dimensionnerAgglomeration('A'.repeat(19), 'EB10')).not.toBeNull();
    expect(dimensionnerAgglomeration('A'.repeat(20), 'EB10')).toBeNull();
    expect(dimensionnerAgglomeration('A'.repeat(20), 'EB20')).not.toBeNull();
    expect(dimensionnerAgglomeration('A'.repeat(21), 'EB20')).toBeNull();
    expect(dimensionnerAgglomeration('   ')).toBeNull();
  });
});
