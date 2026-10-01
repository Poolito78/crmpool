import { describe, it, expect } from 'vitest';
import { lireReponseBpe, ensemblesBpe, estTasmanPal } from './bonPourExecution';
import { lignesDuPlan } from './planDirectionnel';

/* Les deux pages de AF038821 : « CAR FERRIES » et « PARC DES GARES ». */
const REPONSE = '```json\n[{"gamme":"Tasman","fabrication":"PAL","largeur":2200,"hauteur":2100,"classe":2,"laquage":"Brut","quantite":1},'
  + '{"gamme":"Tasman","fabrication":"PAL","largeur":2200,"hauteur":2100,"classe":2,"quantite":1}]\n```';

describe('bons pour exécution', () => {
  it('lit les cotes et écarte ce qui n\'en a pas', () => {
    const b = lireReponseBpe(REPONSE);
    expect(b).toHaveLength(2);
    expect(b[0]).toMatchObject({ largeur: 2200, hauteur: 2100, classe: 2, quantite: 1, page: 1 });
    expect(lireReponseBpe('[{"gamme":"Tasman","fabrication":"PAL"}]')).toEqual([]);
    expect(lireReponseBpe('pas de json')).toEqual([]);
  });

  it('deux PAL 2200×2100 classe 2 → une ligne D3 × 2, au m², sans bride', () => {
    const e = ensemblesBpe(lireReponseBpe(REPONSE), 'AF038821');
    expect(e).toHaveLength(1);
    const l = lignesDuPlan(e, {}, undefined, 'ensemble');
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({
      reference: 'D3.2200.2100.C2.ST.IS.BRUT', quantite: 2,
      tasman: { surface: 4.62, classe: 2 },
    });
  });

  it("ne retient que Tasman / PAL", () => {
    expect(estTasmanPal({ gamme: 'Lapérouse', fabrication: 'Caisson' })).toBe(false);
    expect(estTasmanPal({ gamme: '', fabrication: 'PAL' })).toBe(true);
  });
});
