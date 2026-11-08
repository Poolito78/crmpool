import { describe, expect, it } from 'vitest';
import { codeDeTeinte, delaiDeTeinte, familleNuancier, libelleNuancier, teinteParRal } from './nuancierFlowcrete';

const EPW = { reference: 'FLOWSEALEPWMAT.10,1', description: 'FLOWSEAL EPW MAT (10,1KG) - A (3,1 kg) + B (7kg)' };
const LXP = { reference: 'X', description: 'Flowshield LXP HD' };

describe('nuancier Flowcrete', () => {
  it('reconnaît la gamme de l’article', () => {
    expect(familleNuancier(EPW)).toBe('EPW');
    expect(familleNuancier(LXP)).toBe('LXP');
    expect(familleNuancier({ reference: 'B14', description: 'Panneau' })).toBeUndefined();
  });

  it('le RAL 5015 de l’EPW est le 479, en Tier 2', () => {
    const e = teinteParRal(EPW, '5015')!;
    expect(e.tier).toBe(2);
    expect(libelleNuancier(e)).toBe('479 (RAL 5015, Sky Blue)');
  });

  it('le tier dépend de la gamme', () => {
    expect(delaiDeTeinte(EPW, '232 (RAL 7035, Light Grey)')?.tier).toBe(2);
    expect(delaiDeTeinte(LXP, '232 (RAL 7035, Light Grey)')?.tier).toBe(1);
  });

  it('donne le délai de la maison', () => {
    expect(delaiDeTeinte(EPW, '050 (Signal White)')).toEqual({ tier: 1, delai: 'disponible', minimum: '1 kit complet' });
    expect(delaiDeTeinte(EPW, '479 (RAL 5015, Sky Blue)')).toEqual({ tier: 2, delai: '10 à 15 jours ouvrés', minimum: '100 kg' });
  });

  it('lit aussi un RAL sans code', () => {
    expect(delaiDeTeinte(EPW, 'RAL 5015')?.tier).toBe(2);
  });

  it('n’invente rien pour une teinte absente ou une autre gamme', () => {
    expect(teinteParRal(EPW, '9999')).toBeUndefined();
    expect(delaiDeTeinte(EPW, '920 (RAL 4006, Traffic Purple)')).toBeUndefined();
    expect(delaiDeTeinte({ reference: 'B14', description: 'Panneau' }, 'RAL 5015')).toBeUndefined();
    expect(delaiDeTeinte(EPW, undefined)).toBeUndefined();
  });

  it('lit le code d’un libellé', () => {
    expect(codeDeTeinte('2012 (RAL 7040, Window Grey)')).toBe('2012');
    expect(codeDeTeinte('RAL 5015')).toBeUndefined();
  });
});
