/**
 * Lisibilité des réponses de l'assistant IA du devis.
 *
 * Le modèle répond en markdown et, pour les calculs, en LaTeX
 * (`$0,5 \times 0,03 = \mathbf{0,015}\text{ kg/m²}$`) : l'écran n'affiche que du
 * texte, donc le résultat s'y lisait en symboles bruts. Deux gestes :
 * `nettoyerLatex` rend le LaTeX courant en texte lisible, `blocsAssistant`
 * découpe le markdown léger (titres, listes, gras) pour que l'écran le mette en
 * forme sans bibliothèque. Le prompt de la fonction demande aussi de ne plus
 * écrire de LaTeX ; ceci protège des réponses qui en portent quand même.
 */

export function nettoyerLatex(texte: string): string {
  let t = texte;
  // \text{ kg/m² } → kg/m²  (les accolades imbriquées simples suffisent ici)
  t = t.replace(/\\(?:text|mathrm|textbf)\{([^{}]*)\}/g, (_m, s: string) => s);
  t = t.replace(/\\mathbf\{([^{}]*)\}/g, (_m, s: string) => `**${s.trim()}**`);
  t = t.replace(/\\times/g, '×').replace(/\\cdot/g, '·').replace(/\\approx/g, '≈')
    .replace(/\\div/g, '÷').replace(/\\rightarrow|\\to/g, '→').replace(/\\leq?/g, '≤').replace(/\\geq?/g, '≥')
    .replace(/\\%/g, '%').replace(/\\(?:quad|qquad)/g, '   ').replace(/\\[,;: ]/g, ' ');
  // Délimiteurs $…$ et $$…$$ : on garde le contenu.
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, (_m, s: string) => s.trim());
  t = t.replace(/\$([^$\n]*)\$/g, (_m, s: string) => s);
  // Le gras collé à une accolade ou à un espace : « ** 15 g ** » → « **15 g** ».
  t = t.replace(/\*\*\s+([^*]+?)\s+\*\*/g, '**$1**');
  return t;
}

export type BlocAssistant =
  | { type: 'titre'; texte: string }
  | { type: 'puce'; texte: string }
  | { type: 'ligne'; texte: string }
  | { type: 'separateur' }
  | { type: 'vide' };

export function blocsAssistant(texte: string): BlocAssistant[] {
  return nettoyerLatex(texte).split('\n').map((brut): BlocAssistant => {
    const l = brut.replace(/\s+$/, '');
    if (!l.trim()) return { type: 'vide' };
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) return { type: 'separateur' };
    const titre = l.match(/^\s*#{1,6}\s+(.*)$/);
    if (titre) return { type: 'titre', texte: titre[1] };
    const puce = l.match(/^\s*[*•-]\s+(.*)$/);
    if (puce) return { type: 'puce', texte: puce[1] };
    return { type: 'ligne', texte: l.trim() };
  });
}

/** Découpe un texte en segments gras / normal selon les `**…**`. */
export function segmentsGras(texte: string): { gras: boolean; texte: string }[] {
  return texte.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(s =>
    s.startsWith('**') && s.endsWith('**') && s.length > 4
      ? { gras: true, texte: s.slice(2, -2) }
      : { gras: false, texte: s.replace(/\*\*/g, '') });
}
