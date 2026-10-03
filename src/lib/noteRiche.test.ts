import { describe, it, expect } from 'vitest';
import { formaterPlage, noteEnHtml, noteEnTexte, noteSegments } from './noteRiche';

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
  it('met en gras une plage du texte affiché, et bascule', () => {
    const v = 'FINITION (OPTIONNELLE) fin';
    const g = formaterPlage(v, 9, 22, { gras: true })!;
    expect(g).toBe('FINITION **(OPTIONNELLE)** fin');
    expect(formaterPlage(g, 9, 22, { gras: true })).toBe(v);
  });
  it('compte la plage sur le texte affiché, pas sur les balises', () => {
    const r = formaterPlage('a **bc** d', 3, 4, { couleur: '#cc0000' })!;
    expect(noteEnTexte(r)).toBe('a bc d');
    expect(noteSegments(r)).toEqual([{ texte: 'a ' }, { texte: 'b', gras: true }, { texte: 'c', gras: true, couleur: '#cc0000' }, { texte: ' d' }]);
  });
  it('pose, change puis retire une couleur', () => {
    const r = formaterPlage('un texte', 3, 8, { couleur: '#cc0000' })!;
    expect(r).toBe('un {{#cc0000|texte}}');
    const r2 = formaterPlage(r, 3, 8, { couleur: '#16a34a' })!;
    expect(r2).toBe('un {{#16a34a|texte}}');
    expect(formaterPlage(r2, 3, 8, { couleur: null })).toBe('un texte');
  });
});
