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

    // Une demande qui ne correspond à rien ne doit pas tout supprimer.
    expect(variantesParDefaut(AK3, 'panneau AK3 9999')).toHaveLength(AK3.length);
  });
});
