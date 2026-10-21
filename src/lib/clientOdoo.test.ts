import { describe, it, expect } from 'vitest';
import { motsRechercheOdoo, classerClientsOdoo, natureFicheOdoo, type CandidatOdoo } from './clientOdoo';

const fiche = (id: number, nom: string, autres: Partial<CandidatOdoo> = {}): CandidatOdoo => ({
  id, nom, ville: '', estSociete: true, societeMere: '', ...autres,
});

/* Le cas qui a fait naître ce module : la société MonCRM et ses voisines
   chez Odoo, telles que `odoo-devis` les rend sur les mots du nom. */
const MERE = '01ISO16621 – T1 GROUPE HELIOS (62 ST MARTIN B.)';
const HELIOS: CandidatOdoo[] = [
  fiche(1, MERE, { ville: 'ST MARTIN BOULOGNE' }),
  fiche(2, 'AGENCE CÔTE D’OPALE', { estSociete: false, societeMere: MERE, type: 'other' }),
  fiche(3, '01ISO17000 – HELIOS (59 LILLE)', { ville: 'LILLE' }),
  fiche(4, 'OPALE PEINTURE', { ville: 'CALAIS' }),
  fiche(5, 'AGENCE NORD', { estSociete: false, societeMere: 'COLAS NORD', type: 'other' }),
];

describe('motsRechercheOdoo', () => {
  it('garde les mots distinctifs, sans chiffre, mot générique ni lettre seule', () => {
    const mots = motsRechercheOdoo('HELIOS 62 AGENCE CÔTE D’OPALE');
    expect(mots).toContain('HELIOS');
    expect(mots).toContain('OPALE');
    expect(mots).toContain('COTE');
    expect(mots).not.toContain('62');
    expect(mots).not.toContain('AGENCE');
    expect(mots).not.toContain('D');
  });

  it('envoie aussi la forme accentuée : Odoo ne rapproche pas COTE de CÔTE sans unaccent', () => {
    expect(motsRechercheOdoo('Côte d\'Opale')).toEqual(['OPALE', 'COTE', 'CÔTE']);
  });

  it('ignore les codes de fiche, les tirets et les parenthèses', () => {
    expect(motsRechercheOdoo(MERE)).toEqual(['HELIOS', 'MARTIN']);
  });

  it('rend une liste vide quand rien ne distingue', () => {
    expect(motsRechercheOdoo('SARL Agence 62')).toEqual([]);
  });
});

describe('classerClientsOdoo', () => {
  it('met en tête la fiche qui porte tous les mots, avec sa société mère', () => {
    const r = classerClientsOdoo('HELIOS 62 AGENCE CÔTE D\'OPALE', HELIOS);
    expect(r[0].id).toBe(2);
    expect(r[0].score).toBe(1);
    expect(r.map(c => c.id)).toContain(1);
    /* La mère porte HELIOS et 62 : elle passe devant l'autre HELIOS. */
    expect(r.findIndex(c => c.id === 1)).toBeLessThan(r.findIndex(c => c.id === 3));
  });

  it('écarte une fiche qui ne partage qu’un mot générique', () => {
    const r = classerClientsOdoo('HELIOS 62 AGENCE CÔTE D\'OPALE', HELIOS);
    expect(r.map(c => c.id)).not.toContain(5);
  });

  it('lit la ligne d’adresse quand l’agence n’est pas une fiche fille', () => {
    const r = classerClientsOdoo('HELIOS 62 AGENCE CÔTE D’OPALE', [
      fiche(1, MERE, { rue: 'AGENCE CÔTE D\'OPALE' }),
      fiche(3, '01ISO17000 – HELIOS (59 LILLE)'),
    ]);
    expect(r[0].id).toBe(1);
    expect(r[0].score).toBe(1);
  });

  it('ne retient rien : deux fiches égales restent toutes deux proposées', () => {
    const r = classerClientsOdoo('HELIOS', [fiche(1, 'HELIOS NORD'), fiche(2, 'HELIOS SUD')]);
    expect(r).toHaveLength(2);
    expect(r[0].score).toBe(r[1].score);
  });

  it('rend une liste vide quand aucun mot ne se retrouve', () => {
    expect(classerClientsOdoo('HELIOS', [fiche(1, 'COLAS')])).toEqual([]);
  });

  it('ne garde pas deux fois la même fiche', () => {
    expect(classerClientsOdoo('HELIOS', [fiche(1, 'HELIOS'), fiche(1, 'HELIOS')])).toHaveLength(1);
  });
});

describe('natureFicheOdoo', () => {
  it('dit ce qu’est une fiche fille', () => {
    expect(natureFicheOdoo({ estSociete: false, societeMere: 'X', type: 'other' })).toBe('adresse de X');
    expect(natureFicheOdoo({ estSociete: false, societeMere: 'X', type: 'contact' })).toBe('contact de X');
    expect(natureFicheOdoo({ estSociete: true, societeMere: '' })).toBe('');
  });
});
