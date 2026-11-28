import { describe, it, expect } from 'vitest';
import { buildOdooPayload } from './odooSync';
import type { Client, Devis, LigneDevis } from './store';

const ligne = (p: Partial<LigneDevis>): LigneDevis => ({
  id: Math.random().toString(36).slice(2), description: '', quantite: 1, unite: 'u',
  prixUnitaireHT: 10, tva: 20, remise: 0, ...p,
});

describe('envoi Odoo : note de ligne', () => {
  it('part en ligne de note juste sous son article', () => {
    const devis = {
      id: 'd', numero: 'DEV-TEST', clientId: 'c', lignes: [
        ligne({ description: 'Quartz 0,3- 0,8 (25 kg)', note: 'Option anti glisse à saupoudrer dans première couche de SF41' }),
        ligne({ description: 'Frais divers', note: '   ' }),
      ],
    } as unknown as Devis;
    const p = buildOdooPayload(devis, { id: 'c', societe: 'X' } as unknown as Client, []);
    expect(p.lines.map(l => [l.type, l.desc])).toEqual([
      ['product', 'Quartz 0,3- 0,8 (25 kg)'],
      ['note', 'Option anti glisse à saupoudrer dans première couche de SF41'],
      ['product', 'Frais divers'],
    ]);
  });
});
