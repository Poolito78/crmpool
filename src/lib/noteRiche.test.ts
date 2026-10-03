import { describe, it, expect } from 'vitest';
import { formaterSelection, noteEnHtml, noteEnTexte, noteSegments } from './noteRiche';

describe('noteRiche', () => {
  it('lit gras et couleur, imbriqués', () => {
    expect(noteEnTexte('a **b** {{#cc0000|c **d**}} e')).toBe('a b c d e');
    expect(noteSegments('**{{#cc0000|x}}**')).toEqual([{ texte: 'x', gras: true, couleur: '#cc0000' }]);
  });
  it('laisse littérale une balise mal fermée', () => {
    expect(noteEnTexte('prix ** à voir')).toBe('prix ** à voir');
  });
  it('échappe le HTML', () => {
    expect(noteEnHtml('<b>**x**')).toBe('&lt;b&gt;<strong>x</strong>');
  });
  it('met en gras la sélection (espaces de bord laissés dehors) et bascule', () => {
    const v = 'FINITION (OPTIONNELLE) fin';
    const r = formaterSelection(v, 9, 23, { gras: true })!;
    expect(r.valeur).toBe('FINITION **(OPTIONNELLE)** fin');
    const back = formaterSelection(r.valeur, r.debut, r.fin, { gras: true })!;
    expect(back.valeur).toBe(v);
  });
  it('pose, change puis retire une couleur', () => {
    const v = 'un texte';
    const r = formaterSelection(v, 3, 8, { couleur: '#cc0000' })!;
    expect(r.valeur).toBe('un {{#cc0000|texte}}');
    const r2 = formaterSelection(r.valeur, r.debut, r.fin, { couleur: '#16a34a' })!;
    expect(r2.valeur).toBe('un {{#16a34a|texte}}');
    expect(formaterSelection(r2.valeur, r2.debut, r2.fin, { couleur: null })!.valeur).toBe(v);
  });
});
