import { describe, it, expect } from 'vitest';
import { allegerProjetChiffrage, codesEmployes, estProjetChiffrage, preparerPieceJointe } from './projetChiffrage';

const IMG = 'data:image/png;base64,' + 'A'.repeat(5000);

/** Le cas DISPAM 45 : un marquage au sol, aucune pose de panneau, 3 visuels en bibliothèque. */
const marquage = () => ({
  bordereau: [{ code: 'B21a2' }, { code: 'MQ-CONT' }],
  panels: [], manual: [], batEnsembles: [],
  linears: [{ id: 1, code: 'MQ-CONT', pts: [], len: 14.3 }],
  areas: [{ id: 2, code: 'MQ-ZEB', pts: [], area: 35.5 }],
  qtyOverride: { 'MQ-CONT|col:blanc|zone:CENTRE': 14.21 },
  artRename: { BRIDE40: 'BRIDE8040' },
  planName: 'Plan DISPAM 45.png',
  planData: 'data:image/jpeg;base64,PLAN',
  artImg: { B21a2: IMG, B9a: IMG, C27: IMG },
});

describe('projet du Chiffrage ISOSIGN allégé', () => {
  it('reconnaît un projet, pas un JSON quelconque', () => {
    expect(estProjetChiffrage(marquage())).toBe(true);
    expect(estProjetChiffrage({ artImg: {} })).toBe(false);
    expect(estProjetChiffrage([1, 2])).toBe(false);
  });

  it('retire les visuels des articles que le projet ne pose pas — le bordereau ne compte pas', () => {
    const { projet, retirees } = allegerProjetChiffrage(marquage());
    expect(retirees).toBe(3);
    expect(projet.artImg).toEqual({});
    expect(projet.planData).toBe('data:image/jpeg;base64,PLAN');
    expect(projet.linears).toEqual(marquage().linears);
  });

  it('garde le visuel d\'un panneau posé, d\'une saisie manuelle et d\'une quantité forcée', () => {
    const p = { ...marquage(), panels: [{ id: 3, code: 'B9a', x: 1, y: 1 }], qtyMult: { 'C27|col:blanc': 2 } };
    expect(Object.keys(allegerProjetChiffrage(p).projet.artImg).sort()).toEqual(['B9a', 'C27']);
  });

  it('suit un renommage d\'article dans les deux sens', () => {
    const p = { ...marquage(), manual: [{ id: 4, code: 'BRIDE40', qty: 2 }], artImg: { BRIDE8040: IMG } };
    expect(codesEmployes(p).has('BRIDE8040')).toBe(true);
    expect(allegerProjetChiffrage(p).retirees).toBe(0);
  });

  it('allège le fichier joint, laisse passer tout autre fichier', async () => {
    const projet = new File([JSON.stringify(marquage())], 'Projet_Plan DISPAM 45.json', { type: 'application/json' });
    const leger = await preparerPieceJointe(projet);
    expect(leger.name).toBe('Projet_Plan DISPAM 45.json');
    expect(leger.size).toBeLessThan(projet.size / 10);
    const texte = await new Promise<string>(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsText(leger); });
    expect(JSON.parse(texte).artImg).toEqual({});

    const autre = new File(['{"a":1}'], 'donnees.json');
    expect(await preparerPieceJointe(autre)).toBe(autre);
    const casse = new File(['{pas du json'], 'x.json');
    expect(await preparerPieceJointe(casse)).toBe(casse);
    const pdf = new File(['%PDF'], 'plan.pdf');
    expect(await preparerPieceJointe(pdf)).toBe(pdf);
  });
});
