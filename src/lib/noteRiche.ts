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

/** Segments voisins de même style fusionnés, segments vides écartés. */
function fusionner(segs: SegmentNote[]): SegmentNote[] {
  const sortie: SegmentNote[] = [];
  for (const s of segs) {
    if (!s.texte) continue;
    const d = sortie[sortie.length - 1];
    if (d && !!d.gras === !!s.gras && d.couleur === s.couleur) d.texte += s.texte;
    else sortie.push({ ...s });
  }
  return sortie;
}

/** Segments → note balisée (le contraire de `noteSegments`). */
export function segmentsEnNote(segs: SegmentNote[]): string {
  return fusionner(segs).map(s => {
    let t = s.texte;
    if (s.couleur) t = `{{${s.couleur}|${t}}}`;
    if (s.gras) t = `**${t}**`;
    return t;
  }).join('');
}

/**
 * Met en gras (bascule : tout déjà en gras → on l'enlève) ou colore (`null` =
 * couleur par défaut) la plage [debut, fin[ du TEXTE AFFICHÉ de la note — les
 * balises n'y comptent pas. Rend la nouvelle note, ou `null` si rien à faire.
 */
export function formaterPlage(
  note: string,
  debut: number,
  fin: number,
  format: { gras: true } | { couleur: string | null },
): string | null {
  if (fin <= debut) return null;
  const decoupe: { seg: SegmentNote; dedans: boolean }[] = [];
  let pos = 0;
  for (const seg of noteSegments(note)) {
    const a = pos, b = pos + seg.texte.length;
    pos = b;
    const x = Math.max(a, debut) - a, y = Math.min(b, fin) - a;
    if (y <= x) { decoupe.push({ seg, dedans: false }); continue; }
    if (x > 0) decoupe.push({ seg: { ...seg, texte: seg.texte.slice(0, x) }, dedans: false });
    decoupe.push({ seg: { ...seg, texte: seg.texte.slice(x, y) }, dedans: true });
    if (y < seg.texte.length) decoupe.push({ seg: { ...seg, texte: seg.texte.slice(y) }, dedans: false });
  }
  const choisis = decoupe.filter(d => d.dedans).map(d => d.seg);
  if (!choisis.length) return null;
  const toutGras = choisis.every(sg => sg.gras);
  const segs = decoupe.map(({ seg, dedans }) => {
    if (!dedans) return seg;
    if ('gras' in format) return { ...seg, gras: !toutGras };
    return { ...seg, couleur: format.couleur ?? undefined };
  });
  return segmentsEnNote(segs.map(sg => (sg.gras ? sg : { texte: sg.texte, couleur: sg.couleur })));
}
