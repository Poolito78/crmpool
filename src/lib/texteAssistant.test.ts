import { describe, it, expect } from 'vitest';
import { nettoyerLatex, blocsAssistant, segmentsGras } from './texteAssistant';

describe('texteAssistant', () => {
  it('rend le LaTeX de la réponse en texte lisible', () => {
    const brut = String.raw`  * Catalyst ($3\%$) : $0,5 \times 0,03 = \mathbf{0,015\text{ kg/m²}}$ *(15 g)*`;
    expect(nettoyerLatex(brut)).toBe('  * Catalyst (3%) : 0,5 × 0,03 = **0,015 kg/m²** *(15 g)*');
  });
  it('rend un total en display', () => {
    const brut = String.raw`$$\mathbf{0,072\text{ kg/m²}} \quad \text{soit } \mathbf{72\text{ g}}$$`;
    const t = nettoyerLatex(brut);
    expect(t).toContain('**0,072 kg/m²**');
    expect(t).toContain('**72 g**');
    expect(t).not.toContain('\\');
  });
  it('découpe titres, puces et séparateurs', () => {
    const b = blocsAssistant('### Détail\n* a\n---\ntexte');
    expect(b.map(x => x.type)).toEqual(['titre', 'puce', 'separateur', 'ligne']);
  });
  it('isole le gras', () => {
    expect(segmentsGras('x **y** z')).toEqual([{ gras: false, texte: 'x ' }, { gras: true, texte: 'y' }, { gras: false, texte: ' z' }]);
  });
});
