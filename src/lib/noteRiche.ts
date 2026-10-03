/**
 * noteRiche.ts — gras et couleur dans la note d'une ligne de devis.
 *
 * La note reste une CHAÎNE (colonne et JSON inchangés, aucune migration) ;
 * la mise en forme s'y écrit en balises légères :
 *
 *   **gras**                 {{#cc0000|texte en rouge}}
 *
 * Les deux s'imbriquent : `**{{#cc0000|attention}}**`. Une balise mal fermée
 * reste du texte littéral — rien ne disparaît. Tout ce qui doit lire la note
 * en clair (recherche, conso lue dans le texte, MO) passe par `noteEnTexte` ;
 * l'aperçu et le PDF par `noteSegments`, la MO HTML par `noteEnHtml`.
 */

export interface SegmentNote { texte: string; gras?: boolean; couleur?: string }

/** Couleurs proposées à la sélection. `null` = couleur par défaut (grise) de la note. */
export const COULEURS_NOTE: { nom: string; hex: string | null }[] = [
  { nom: 'Par défaut', hex: null },
  { nom: 'Noir', hex: '#111111' },
  { nom: 'Rouge', hex: '#cc0000' },
  { nom: 'Orange', hex: '#ea580c' },
  { nom: 'Vert', hex: '#16a34a' },
  { nom: 'Bleu', hex: '#2563eb' },
];

const RE_GRAS = /\*\*([\s\S]+?)\*\*/;
const RE_COULEUR = /\{\{(#[0-9a-fA-F]{3,8})\|([\s\S]+?)\}\}/;

type Style = { gras?: boolean; couleur?: string };

function analyser(s: string, style: Style, sortie: SegmentNote[]): void {
  while (s.length > 0) {
    const g = RE_GRAS.exec(s);
    const c = RE_COULEUR.exec(s);
    const m = g && c ? (g.index <= c.index ? g : c) : (g || c);
    if (!m) { sortie.push({ texte: s, ...style }); return; }
    if (m.index > 0) sortie.push({ texte: s.slice(0, m.index), ...style });
    if (m === g) analyser(m[1], { ...style, gras: true }, sortie);
    else analyser(m[2], { ...style, couleur: m[1] }, sortie);
    s = s.slice(m.index + m[0].length);
  }
}

export function noteSegments(note: string): SegmentNote[] {
  const sortie: SegmentNote[] = [];
  analyser(note, {}, sortie);
  return sortie;
}

/** La note sans aucune balise, pour toute lecture « en clair ». */
export function noteEnTexte(note: string | undefined | null): string {
  if (!note) return '';
  return noteSegments(note).map(s => s.texte).join('');
}

export function noteEstMiseEnForme(note: string | undefined | null): boolean {
  return !!note && (RE_GRAS.test(note) || RE_COULEUR.test(note));
}

const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Note en HTML échappé (retours à la ligne en <br>), balises converties en <strong> / <span style>. */
export function noteEnHtml(note: string): string {
  return noteSegments(note).map(s => {
    let h = echapper(s.texte).replace(/\n/g, '<br>');
    if (s.couleur) h = `<span style="color:${s.couleur}">${h}</span>`;
    if (s.gras) h = `<strong>${h}</strong>`;
    return h;
  }).join('');
}

export interface ResultatFormat { valeur: string; debut: number; fin: number }

/** Sépare les espaces de bord de la sélection : les balises doivent coller au texte. */
function rogner(valeur: string, debut: number, fin: number): [number, number] {
  while (debut < fin && /\s/.test(valeur[debut])) debut++;
  while (fin > debut && /\s/.test(valeur[fin - 1])) fin--;
  return [debut, fin];
}

/**
 * Met la sélection en gras (bascule : déjà en gras → on l'enlève) ou lui pose
 * une couleur (`null` = retire la couleur posée juste autour de la sélection).
 * Rend la nouvelle valeur et la sélection à restaurer, ou `null` si rien à faire.
 */
export function formaterSelection(
  valeur: string,
  debutBrut: number,
  finBrut: number,
  format: { gras: true } | { couleur: string | null },
): ResultatFormat | null {
  const [debut, fin] = rogner(valeur, debutBrut, finBrut);
  if (fin <= debut) return null;
  const avant = valeur.slice(0, debut);
  const sel = valeur.slice(debut, fin);
  const apres = valeur.slice(fin);

  if ('gras' in format) {
    if (avant.endsWith('**') && apres.startsWith('**')) {
      return { valeur: avant.slice(0, -2) + sel + apres.slice(2), debut: debut - 2, fin: fin - 2 };
    }
    return { valeur: `${avant}**${sel}**${apres}`, debut: debut + 2, fin: fin + 2 };
  }

  // Couleur : d'abord retirer celle qui entoure exactement la sélection.
  const m = /\{\{#[0-9a-fA-F]{3,8}\|$/.exec(avant);
  if (m && apres.startsWith('}}')) {
    const nu = avant.slice(0, m.index) + sel + apres.slice(2);
    const d = debut - m[0].length;
    if (format.couleur == null) return { valeur: nu, debut: d, fin: d + sel.length };
    const balise = `{{${format.couleur}|`;
    return { valeur: `${avant.slice(0, m.index)}${balise}${sel}}}${apres.slice(2)}`, debut: m.index + balise.length, fin: m.index + balise.length + sel.length };
  }
  if (format.couleur == null) return null;
  const balise = `{{${format.couleur}|`;
  return { valeur: `${avant}${balise}${sel}}}${apres}`, debut: debut + balise.length, fin: fin + balise.length };
}
