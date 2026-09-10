import { describe, it, expect } from 'vitest';
import { buildFunnel, classifySegment, variantesParDefaut } from './variantFunnel';

/** Références réelles du catalogue (table `produits`), copiées telles quelles. */
const KD22 = [
  'KD22.1000.300.3430.BTR.P.IS.BRUT',
  'KD22.1000.300.C1.BTR.IS.BRUT',
  'KD22.1000.300.C1.BTR.P.IS.BRUT',
  'KD22.1000.300.C1.BTR.R.IS.BRUT',
  'KD22.1000.300.C2.BP.ST.IS.BRUT',
  'KD22.1000.300.C2.BTR.IS.BRUT',
  'KD22.1000.300.C2.BTR.P.IS.BRUT',
  'KD22.1000.300.C2.BTR.R.IS.BRUT',
  'KD22.1300.300.C1.BTR.IS.BRUT',
  'KD22.1300.300.C1.BTR.P.IS.BRUT',
  'KD22.1300.300.C2.BP.ST.IS.BRUT',
  'KD22.1300.300.C2.BTR.IS.BRUT',
  'KD22.1300.300.C2.BTR.P.IS.BRUT',
  'KD22.1300.300.C2.BTR.R.IS.BRUT',
];

/** Panneau permanent : aucune variante ne porte P ni R. */
const A13A = [
  'A13A.700.3430.BTR.IS.BRUT',
  'A13A.700.C1.BTR.IS.BRUT',
  'A13A.700.C1.F.BTR.IS.BRUT',
  'A13A.700.C2.BTR.IS.BRUT',
  'A13A.700.C2.BTR.IS.L7016',
  'A13A.700.C2.BTR.ST.IS.L7002',
  'A13A.700.C2.F.BTR.IS.BRUT',
  'A13A.1000.C2.BTR.IS.BRUT',
];

const funnel = (refs: string[], query: string, chips?: Record<string, string>) =>
  buildFunnel({
    candidates: refs.map((reference) => ({ reference, description: '' })),
    query,
    chipOverrides: chips as never,
  });

describe('classifySegment — équipement', () => {
  it('reconnaît le support et le kit rail', () => {
    expect(classifySegment('P')).toBe('equipement');
    expect(classifySegment('R')).toBe('equipement');
  });

  it("ne confond pas le kit rail avec un RAL (qui commence par L)", () => {
    expect(classifySegment('L7016')).toBe('ral');
    expect(classifySegment('BRUT')).toBe('ral');
  });
});

describe("entonnoir — équipement de la signalisation temporaire", () => {
  it('retient le kit rail par défaut et résout la référence', () => {
    const r = funnel(KD22, '1000 300 c2');
    expect(r.matches).toEqual(['KD22.1000.300.C2.BTR.R.IS.BRUT']);
    expect(r.defaultsApplied).toContain('equipement');
    expect(r.resolved.equipement).toBe('R');
  });

  it('propose les trois possibilités : sans rail, avec support, kit rail', () => {
    const r = funnel(KD22, '1000 300 c2');
    const opts = r.defaultOptions.find((o) => o.category === 'equipement');
    expect(opts?.options.sort()).toEqual(['AUCUN', 'P', 'R']);
  });

  it('rend le panneau nu quand on demande « sans rail »', () => {
    const r = funnel(KD22, '1000 300 c2', { equipement: 'AUCUN' });
    expect(r.matches).toEqual(['KD22.1000.300.C2.BTR.IS.BRUT']);
  });

  it('rend la variante support quand on le demande', () => {
    const r = funnel(KD22, '1000 300 c2', { equipement: 'P' });
    expect(r.matches).toEqual(['KD22.1000.300.C2.BTR.P.IS.BRUT']);
  });
});

/** Famille sans kit rail : seulement le nu et le support. */
const ISOTEXTE = [
  'ISOTEXTE.1200.1600.C1.50.IS',
  'ISOTEXTE.1200.1600.C1.50.P.IS',
  'ISOTEXTE.1200.1600.C2.50.IS',
  'ISOTEXTE.1200.1600.C2.50.P.IS',
];

describe("entonnoir — repli quand la famille n'a pas de kit rail", () => {
  it('retombe sur « sans rail » plutôt que de poser la question', () => {
    const r = funnel(ISOTEXTE, '1200 1600 c2');
    expect(r.matches).toEqual(['ISOTEXTE.1200.1600.C2.50.IS']);
    expect(r.resolved.equipement).toBe('AUCUN');
    expect(r.pending.map((p) => p.category)).not.toContain('equipement');
  });

  it('ne laisse alors que le choix avec ou sans pied', () => {
    const r = funnel(ISOTEXTE, '1200 1600 c2');
    const opts = r.defaultOptions.find((o) => o.category === 'equipement');
    expect(opts?.options.sort()).toEqual(['AUCUN', 'P']);
  });

  it('rend la variante support quand on le demande', () => {
    const r = funnel(ISOTEXTE, '1200 1600 c2', { equipement: 'P' });
    expect(r.matches).toEqual(['ISOTEXTE.1200.1600.C2.50.P.IS']);
  });
});

describe('entonnoir — les panneaux permanents ne bougent pas', () => {
  it("ne demande ni n'applique d'équipement là où la notion n'existe pas", () => {
    const r = funnel(A13A, '700 c2');
    expect(r.matches).toEqual(['A13A.700.C2.BTR.IS.BRUT']);
    expect(r.defaultsApplied).not.toContain('equipement');
    expect(r.pending.map((p) => p.category)).not.toContain('equipement');
  });
});

describe('reprise d’office d’une proposition Odoo', () => {
  /* Propositions rendues par Odoo sur « panneau AK3 », dans SON ordre —
     le 1000 avant le 700. C'est le cas qui a motivé la fonction. */
  const AK3 = [
    { reference: 'AK3.1000.C1.BTR.R.IS.BRUT', description: 'IS AK3' },
    { reference: 'AK3.700.C1.BTR.R.IS.BRUT', description: 'IS AK3' },
    { reference: 'TRIFLASHAK3.700.C1.BTR.ST.R.Acier1.IS.BRUT', description: 'IS AK3 3 FEUX LEDS' },
    { reference: 'AK3.1000.C1.BTR.IS.BRUT', description: 'IS AK3' },
  ];

  /* ⚠️ Retenir le premier d'Odoo posait un 1000 à 50,02 € sur le devis là où
     la règle dit gamme Petite — le 700 à 39,41 €. */
  it('retient la gamme Petite quand la demande ne précise pas la taille', () => {
    const gardees = variantesParDefaut(AK3, 'panneau AK3');
    expect(gardees[0]).toBe('AK3.700.C1.BTR.R.IS.BRUT');
    expect(gardees).not.toContain('AK3.1000.C1.BTR.R.IS.BRUT');
  });

  /* Ce que le client écrit l'emporte sur le défaut : sinon on lui vendrait un
     700 quand il a demandé un 1000. */
  it('laisse la taille demandée l’emporter sur le défaut', () => {
    const gardees = variantesParDefaut(AK3, 'panneau AK3 1000');
    expect(gardees).toContain('AK3.1000.C1.BTR.R.IS.BRUT');
    expect(gardees).not.toContain('AK3.700.C1.BTR.R.IS.BRUT');
  });

  /* ⚠️ LE DÉFAUT NE DOIT PAS COMBLER UN SILENCE QUE L'ÉCRAN A DÉJÀ ROMPU.
     « panneau KC1 chantier interdit au public » ne dit pas la classe ; le
     défaut métier posait alors C2 et écartait KC1.800.600.C1.BTR.R.IS.BRUT,
     l'article que le devis AF036911 facture 48,185 €. L'appelant passe donc
     le texte ENRICHI des sélecteurs Gamme/Classe, où la classe est écrite. */
  it('laisse la classe de l’écran l’emporter sur le défaut C2', () => {
    const KC1 = [
      { reference: 'KC1.800.600.C1.BTR.R.IS.BRUT', description: 'IS KC1' },
      { reference: 'KC1.800.600.C2.BTR.R.IS.BRUT', description: 'IS KC1' },
      { reference: 'KC1.1000.750.C1.BTR.R.IS.BRUT', description: 'IS KC1' },
    ];
    // Sans la classe, le défaut C2 tranche — et se trompe.
    expect(variantesParDefaut(KC1, 'panneau KC1 chantier interdit au public'))
      .toEqual(['KC1.800.600.C2.BTR.R.IS.BRUT']);
    // Avec le texte enrichi, la C1 demandée l'emporte.
    expect(variantesParDefaut(KC1, 'panneau KC1 chantier interdit au public 800 C1'))
      .toContain('KC1.800.600.C1.BTR.R.IS.BRUT');
  });

  /* ⚠️ Une liste vide vaut « aucune proposition », donc une ligne au devis
     SANS PRIX. On préfère toujours rendre ce qu'Odoo a proposé. */
  it('ne filtre jamais jusqu’au vide', () => {
    const seul = [{ reference: 'FLOWFASTF107', description: 'Resine epoxy' }];
    expect(variantesParDefaut(seul, 'resine')).toEqual(['FLOWFASTF107']);

    const resines = [
      { reference: 'FLOWFASTF107', description: 'Resine epoxy 180KG' },
      { reference: 'FLOWFASTPRIMER107.20', description: 'Primaire 20KG' },
    ];
    expect(variantesParDefaut(resines, 'resine epoxy')).toHaveLength(2);

    /* Une cote que personne ne porte ne doit pas tout supprimer — et elle ne
       doit pas non plus rendre la main à l'ordre d'Odoo : la contrainte est
       écartée, les défauts métier tranchent comme si elle n'avait pas été
       écrite. On garde donc la gamme Petite, pas le 1000 qu'Odoo met en tête. */
    const large = variantesParDefaut(AK3, 'panneau AK3 9999');
    expect(large.length).toBeGreaterThan(0);
    expect(large[0]).toBe('AK3.700.C1.BTR.R.IS.BRUT');
  });

  /* ⚠️ **LE FRANÇAIS DU CLIENT N'EST PAS UNE RÉFÉRENCE.**
   *
   * `classifySegment` lit des segments de référence, où « L… » ne peut être
   * qu'un RAL. Sur les mots d'une demande, « LONGUEUR », « LONG » et « LG »
   * passent le même filtre — et la classe `C2` que l'écran ajoute à toute
   * ligne n'a aucun sens sur un mât d'acier, qui ne porte pas de film.
   *
   * Le 10/09/2026, sur la demande AGILIS « 10 supports 40×80 mm, longueur
   * 3 m », ces deux faux jetons vidaient le vivier : le garde-fou anti-vide
   * rendait les neuf déclinaisons à égalité, la reprise d'office prenait la
   * première d'Odoo — SG80401_5.3000.IS.L1000, en rupture et hors barème —
   * alors que la commande facture bien la brute. */
  it('ignore un mot de la demande qu’aucune déclinaison ne porte', () => {
    const SUPPORTS = [
      { reference: 'SG80401_5.3000.IS.BRUT', description: 'SUPPORT ACIER GALVA 80X40 1.5 LG 3000 + BOUCHON BRUT' },
      ...Array.from({ length: 8 }, (_, n) => ({
        reference: `SG80401_5.3000.IS.L100${n}`,
        description: `SUPPORT ACIER GALVA 80X40 1.5 LG 3000 + BOUCHON LAQUE RAL 100${n}`,
      })),
    ];

    // Le texte tel que l'écran l'envoie : la demande, plus la classe du panneau.
    expect(variantesParDefaut(SUPPORTS, '10 supports 40x80mm, longueur 3m C2'))
      .toEqual(['SG80401_5.3000.IS.BRUT']);

    // Un RAL vraiment nommé reste maître : on ne lui impose pas la brute.
    expect(variantesParDefaut(SUPPORTS, '10 supports 40x80mm longueur 3m L1003 C2'))
      .toEqual(['SG80401_5.3000.IS.L1003']);
  });
});
