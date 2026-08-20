import { describe, it, expect } from 'vitest';
import {
  longueurMention, longueurMentionComplete, margeLargeur,
  dimensionnerPanneau, dimensionnerEnsemble, dimensionnerAgglomeration,
  typeAgglomeration, nomAgglomerationDansTexte,
  GAMMES_HC, LARGEURS_NORMALISEES,
  couperEnDeuxLignes,
  dimensionnerAgglomerationAuto,
  lettrageForce,
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

  it('lit la table du Hc, pas celle du type de panneau', () => {
    /* Erreur corrigée : les deux tables du fabricant circulent sous les noms
       « EB10 » et « EB20 », mais ce sont en fait la table du Hc 125 et celle
       du Hc 100. À Hc égal, une entrée et une sortie ont le même format. */
    const entree = dimensionnerAgglomeration('ORLEANS', { type: 'EB10', hc: 100 })!;
    const sortie = dimensionnerAgglomeration('ORLEANS', { type: 'EB20', hc: 100 })!;
    expect(entree.largeur).toBe(sortie.largeur);
    expect(entree.hauteur).toBe(sortie.hauteur);

    // 7 signes : 800 en Hc 100, mais 1000 en Hc 125.
    expect(dimensionnerAgglomeration('ORLEANS', { hc: 100 })?.largeur).toBe(800);
    expect(dimensionnerAgglomeration('ORLEANS', { hc: 125 })?.largeur).toBe(1000);
    expect(dimensionnerAgglomeration('MARSEILLE', { hc: 100 })?.largeur).toBe(1000);
  });

  it('refuse un Hc absent des tables du fabricant', () => {
    expect(dimensionnerAgglomeration('LYON', { hc: 160 })).toBeNull();
  });

  it('monte d’un cran de hauteur par ligne supplémentaire', () => {
    /* Les quatre cas attestés : le Hc donne le cran de départ, chaque ligne
       en plus — seconde ligne de nom ou mention de commune — en ajoute un. */
    expect(dimensionnerAgglomeration('LYON', { hc: 100 })?.hauteur).toBe(300);
    expect(dimensionnerAgglomeration('LYON', { hc: 100, mention: 'c°ne de X' })?.hauteur)
      .toBe(400);
    expect(dimensionnerAgglomeration('LYON', { hc: 125 })?.hauteur).toBe(400);
    expect(dimensionnerAgglomeration(['SAINT-PIERRE', 'DU VAUVRAY'], { hc: 125 })?.hauteur)
      .toBe(600);
  });

  it('refuse une mention posée sous un nom déjà sur deux lignes', () => {
    /* Aucun plan ne montre les deux à la fois : on ne devine pas. */
    expect(dimensionnerAgglomeration(
      ['SAINT-PIERRE', 'DU VAUVRAY'], { hc: 125, mention: 'c°ne de X' },
    )).toBeNull();
  });

  it('refuse un lettrage forcé plutôt que de lui inventer une table', () => {
    /* Le Hc 80 du plan de Balvay n'est pas une gamme : c'est un lettrage
       rapetissé pour tenir dans un panneau imposé. On ne dimensionne pas à
       partir de là — on ne peut que vérifier après coup. */
    expect(lettrageForce(80)).toBe(true);
    expect(lettrageForce(62.5)).toBe(true);
    expect(lettrageForce(100)).toBe(false);
    expect(lettrageForce(125)).toBe(false);
    expect(dimensionnerAgglomeration('BALVAY', { hc: 80 })).toBeNull();
  });

  it('signale qu’une mention de commune peut imposer le format au-dessus', () => {
    const sans = dimensionnerAgglomeration('MOULIGNON', { hc: 100 })!;
    expect(sans.largeurAConfirmer).toBe(false);
    expect(sans.largeur).toBe(1000);

    /* La mention est composée plus petit mais elle est plus longue : sur le
       plan AF035681 elle a fait passer le panneau de 1000 à 1300. Le comptage
       de signes ne sait pas l'anticiper, donc on le dit au lieu de l'inventer. */
    const avec = dimensionnerAgglomeration('MOULIGNON', {
      hc: 100, mention: 'c°ne de QUINCY-VOISINS',
    })!;
    expect(avec.largeurAConfirmer).toBe(true);
    expect(avec.hauteur).toBe(400);
  });

  it('compte les espaces et les traits d’union', () => {
    /* « QUINCY-VOISI » fait 12 signes, tiret compris — justement la limite du
       1300 en Hc 100. Sans compter le tiret on retomberait à 11, donc sur un
       format trop court. En Hc 125, 12 dépasse les 11 du 1600 et impose
       déjà un 1900. */
    expect(dimensionnerAgglomeration('QUINCY-VOISI', { hc: 100 })?.caracteres).toBe(12);
    expect(dimensionnerAgglomeration('QUINCY-VOISI', { hc: 100 })?.largeur).toBe(1300);
    expect(dimensionnerAgglomeration('QUINCY-VOISI', { hc: 125 })?.largeur).toBe(1900);
  });

  it('reconnaît un panneau d’agglomération, et lui seul', () => {
    expect(typeAgglomeration('EB10')).toBe('EB10');
    expect(typeAgglomeration('eb20')).toBe('EB20');
    // Ne doit pas happer les codes voisins.
    expect(typeAgglomeration('EB1')).toBeNull();
    expect(typeAgglomeration('B10')).toBeNull();
    expect(typeAgglomeration('E43')).toBeNull();
    expect(typeAgglomeration('')).toBeNull();
  });

  it('lit le nom écrit à la suite du code', () => {
    expect(nomAgglomerationDansTexte('2 EB10 MOULIGNON', 'EB10')).toBe('MOULIGNON');
    expect(nomAgglomerationDansTexte('EB20 SAINT-PIERRE-DU-VAUVRAY', 'EB20'))
      .toBe('SAINT-PIERRE-DU-VAUVRAY');
  });

  it('ne prend pas la description de la commande pour un nom', () => {
    /* Cas réel du devis AF035681 : la demande ne porte aucun nom. Rendre
       « UNITES » serait pire que ne rien rendre. */
    expect(nomAgglomerationDansTexte('EB10 2 UNITES', 'EB10')).toBeNull();
    expect(nomAgglomerationDansTexte('EB20 2 UNITES', 'EB20')).toBeNull();
    expect(nomAgglomerationDansTexte('4 EB10 entrée d’agglomération', 'EB10')).toBeNull();
    expect(nomAgglomerationDansTexte('EB10', 'EB10')).toBeNull();
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
    expect(dimensionnerAgglomeration('A'.repeat(19), { hc: 125 })).not.toBeNull();
    expect(dimensionnerAgglomeration('A'.repeat(20), { hc: 125 })).toBeNull();
    expect(dimensionnerAgglomeration('A'.repeat(20), { hc: 100 })).not.toBeNull();
    expect(dimensionnerAgglomeration('A'.repeat(21), { hc: 100 })).toBeNull();
    expect(dimensionnerAgglomeration('   ')).toBeNull();
  });
});

describe("agglomération sur deux lignes", () => {
  it("grandit en hauteur sans changer la table des largeurs", () => {
    const une = dimensionnerAgglomeration('ORLEANS')!;
    expect(une.hauteur).toBe(400);
    expect(une.lignes).toBe(1);

    /* Deux lignes de 7 et 6 signes : la plus longue vaut 7, donc 1000 mm
       comme en une ligne, mais le panneau passe à 600 de haut. */
    const deux = dimensionnerAgglomeration(['ORLEANS', 'LA SOURCE'])!;
    expect(deux.lignes).toBe(2);
    expect(deux.hauteur).toBe(600);
    expect(deux.largeur).toBe(1300); // « LA SOURCE » fait 9 signes
  });

  it("retient la ligne la plus longue, pas le total", () => {
    /* En une seule ligne, « SAINT-PIERRE DU VAUVRAY » ferait 23 signes et
       dépasserait la table. Coupé, il tient. */
    expect(dimensionnerAgglomeration('SAINT-PIERRE DU VAUVRAY')).toBeNull();
    const p = dimensionnerAgglomeration(['SAINT-PIERRE', 'DU VAUVRAY'])!;
    expect(p.caracteres).toBe(12);
    expect(p.largeur).toBe(1900); // 12 signes → format 14
    expect(p.hauteur).toBe(600);
  });

  it("ignore une seconde ligne vide", () => {
    const p = dimensionnerAgglomeration(['LYON', '  '])!;
    expect(p.lignes).toBe(1);
    expect(p.hauteur).toBe(400);
  });

  it("donne la même largeur en sortie qu'en entrée, mais pas la même hauteur", () => {
    const a = dimensionnerAgglomeration(['ORLEANS', 'LA SOURCE'], { type: 'EB10', hc: 125 })!;
    const b = dimensionnerAgglomeration(['ORLEANS', 'LA SOURCE'], { type: 'EB20', hc: 125 })!;
    /* La largeur ne dépend que du Hc et du texte. */
    expect(b.largeur).toBe(a.largeur);
    /* La hauteur, elle, sépare l'entrée de la sortie dès qu'il y a une vraie
       seconde ligne : le cadre rouge de l'EB10 coûte 100 mm. */
    expect(a.hauteur).toBe(600);
    expect(b.hauteur).toBe(500);

    /* Sans seconde ligne, ou avec une simple mention, les deux se valent. */
    expect(dimensionnerAgglomeration('ORLEANS', { type: 'EB20', hc: 100 })?.hauteur).toBe(300);
    expect(dimensionnerAgglomeration('ORLEANS', { type: 'EB10', hc: 100 })?.hauteur).toBe(300);
    expect(dimensionnerAgglomeration('ORLEANS', { type: 'EB20', hc: 100, mention: 'c°ne de X' })
      ?.hauteur).toBe(400);
    expect(dimensionnerAgglomeration('ORLEANS', { type: 'EB10', hc: 100, mention: 'c°ne de X' })
      ?.hauteur).toBe(400);
  });
});

describe('couperEnDeuxLignes', () => {
  it("coupe au point le plus équilibré", () => {
    expect(couperEnDeuxLignes('SAINT-PIERRE DU VAUVRAY')).toEqual([
      'SAINT-PIERRE', 'DU VAUVRAY',
    ]);
  });

  it("fait descendre le trait d'union en tête de seconde ligne", () => {
    /* Relevé sur le plan des Pennes-Mirabeau : « LES PENNES » puis
       « -MIRABEAU », et non « LES PENNES- » puis « MIRABEAU ». */
    expect(couperEnDeuxLignes('LES PENNES-MIRABEAU')).toEqual([
      'LES PENNES', '-MIRABEAU',
    ]);
    expect(couperEnDeuxLignes('QUINCY-VOISINS')).toEqual(['QUINCY', '-VOISINS']);
  });

  it("renvoie null quand le nom n'offre aucune coupe", () => {
    expect(couperEnDeuxLignes('VILLENEUVE')).toBeNull();
  });
});

describe('plans Kadri — contre-épreuve du dimensionnement', () => {
  /* Dix panneaux relevés sur six plans. Le nom porté, sa mise en page et le
     Hc sont lus sur le plan ; la dimension attendue est celle que Kadri
     imprime. Toute régression du modèle casse ici. */
  const PLANS: {
    plan: string;
    nom: string | string[];
    hc: number;
    mention?: string;
    type?: 'EB10' | 'EB20';
    largeur: number;
    hauteur: number;
  }[] = [
    { plan: 'MDT 83 LE MUY', nom: 'LE MUY', hc: 100, largeur: 800, hauteur: 300 },
    { plan: 'MDT 71 ATTIGNAT EB10', nom: 'ATTIGNAT', hc: 100, largeur: 1000, hauteur: 300 },
    {
      plan: 'MDT 71 ATTIGNAT EB20', nom: 'ATTIGNAT', hc: 100, type: 'EB20',
      largeur: 1000, hauteur: 300,
    },
    {
      plan: 'Les Pennes-Mirabeau', nom: ['LES PENNES', '-MIRABEAU'], hc: 100,
      largeur: 1300, hauteur: 500,
    },
    {
      plan: 'Saint André sur Vieux Jonc', nom: ['SAINT ANDRÉ', 'SUR VIEUX JONC'],
      hc: 100, largeur: 1600, hauteur: 500,
    },
    {
      plan: 'AF035681 QUINCY EB10', nom: 'MOULIGNON', hc: 100,
      mention: 'c°ne de QUINCY-VOISINS', largeur: 1300, hauteur: 400,
    },
    {
      plan: 'AF035681 QUINCY EB20', nom: 'MOULIGNON', hc: 100, type: 'EB20',
      mention: 'c°ne de QUINCY-VOISINS', largeur: 1300, hauteur: 400,
    },
    {
      plan: 'RN580 LAUDUN', nom: "L'ARDOISE", hc: 100,
      mention: "Cne de LAUDUN-L'ARDOISE", largeur: 1300, hauteur: 400,
    },
    {
      plan: 'MDT 84 APT COUSTELLET', nom: 'COUSTELLET', hc: 125,
      mention: 'Cne de MAUBEC', largeur: 1600, hauteur: 500,
    },
    {
      plan: 'MDT 83 BORMES LES MIMOSAS', nom: ['BORMES', 'LES MIMOSAS'],
      hc: 125, largeur: 1600, hauteur: 600,
    },
    {
      plan: 'MDT 83 ST MAXIMIN EB10', nom: ['St MAXIMIN', 'LA Ste BAUME'],
      hc: 100, largeur: 1300, hauteur: 500,
    },
    {
      /* Même nom, même mise en page, même plan que le précédent : seule la
         sortie change, et elle vaut 100 mm de moins. */
      plan: 'MDT 83 ST MAXIMIN EB20', nom: ['St MAXIMIN', 'LA Ste BAUME'],
      hc: 100, type: 'EB20', largeur: 1300, hauteur: 400,
    },
  ];

  for (const c of PLANS) {
    it(`retrouve ${c.plan} : ${c.largeur} × ${c.hauteur}`, () => {
      const p = dimensionnerAgglomeration(c.nom, {
        hc: c.hc, mention: c.mention, type: c.type ?? 'EB10',
      });
      expect(p).not.toBeNull();
      expect([p!.largeur, p!.hauteur]).toEqual([c.largeur, c.hauteur]);
    });
  }

  /* Le vrai test d'usage : le nom brut, tel qu'un client l'écrit, sans qu'on
     dise à l'appli où couper ni combien de lignes composer. */
  const BRUTS: [string, number, [number, number]][] = [
    ['LE MUY', 100, [800, 300]],
    ['ATTIGNAT', 100, [1000, 300]],
    ['LES PENNES-MIRABEAU', 100, [1300, 500]],
    ['SAINT ANDRE SUR VIEUX JONC', 100, [1600, 500]],
    ['ST MAXIMIN LA STE BAUME', 100, [1300, 500]],
    ['BORMES LES MIMOSAS', 125, [1600, 600]],
  ];

  for (const [nom, hc, attendu] of BRUTS) {
    it(`compose seul « ${nom} » comme le plan`, () => {
      const p = dimensionnerAgglomerationAuto(nom, { hc })!;
      expect(p).not.toBeNull();
      expect([p.largeur, p.hauteur]).toEqual(attendu);
    });
  }
});
