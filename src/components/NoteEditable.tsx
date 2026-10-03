import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { COULEURS_NOTE, formaterPlage, noteSegments, segmentsEnNote, type SegmentNote } from '@/lib/noteRiche';

/**
 * Note de ligne éditable AVEC sa mise en forme visible (gras, couleur) : on
 * tape, on sélectionne, on met en gras ou en couleur, sans jamais voir les
 * balises (`**`, `{{#cc0000|…}}`) que `noteRiche.ts` écrit dans la chaîne
 * enregistrée. Le champ n'est pas piloté par React pendant la frappe — sinon
 * le curseur sauterait à chaque touche — mais redessiné quand la valeur change
 * de l'extérieur ou qu'une mise en forme est posée.
 */

function dessiner(el: HTMLElement, note: string) {
  el.textContent = '';
  for (const seg of noteSegments(note)) {
    const span = document.createElement('span');
    if (seg.gras) { span.dataset.gras = '1'; span.style.fontWeight = '700'; }
    if (seg.couleur) { span.dataset.couleur = seg.couleur; span.style.color = seg.couleur; }
    seg.texte.split('\n').forEach((ligne, i) => {
      if (i > 0) span.appendChild(document.createElement('br'));
      if (ligne) span.appendChild(document.createTextNode(ligne));
    });
    el.appendChild(span);
  }
}

/** Relit le contenu du champ en segments stylés. */
function lire(racine: HTMLElement): SegmentNote[] {
  const segs: SegmentNote[] = [];
  const visite = (n: Node, gras: boolean, couleur?: string) => {
    if (n.nodeType === Node.TEXT_NODE) { segs.push({ texte: n.textContent || '', gras, couleur }); return; }
    if (!(n instanceof HTMLElement)) return;
    if (n.tagName === 'BR') { segs.push({ texte: '\n', gras, couleur }); return; }
    const g = gras || n.dataset.gras === '1' || n.tagName === 'B' || n.tagName === 'STRONG';
    const c = n.dataset.couleur ?? couleur;
    // Un bloc (div/p) ouvert par le navigateur sur un retour à la ligne compte pour un saut de ligne.
    if ((n.tagName === 'DIV' || n.tagName === 'P') && n !== racine && segs.length) segs.push({ texte: '\n', gras, couleur });
    n.childNodes.forEach(ch => visite(ch, g, c));
  };
  racine.childNodes.forEach(ch => visite(ch, false));
  // Le <br> de réserve que le navigateur laisse en fin de champ n'est pas un saut de ligne saisi.
  const dernier = racine.lastChild;
  const finParBr = dernier instanceof HTMLElement && (dernier.tagName === 'BR' || dernier.lastChild instanceof HTMLBRElement);
  if (finParBr && segs.length && segs[segs.length - 1].texte === '\n') segs.pop();
  return segs;
}

const texteDe = (segs: SegmentNote[]) => segs.map(s => s.texte).join('');

/** Position, dans le TEXTE AFFICHÉ, d'un point du DOM. */
function positionTexte(champ: HTMLElement, noeud: Node, decalage: number): number {
  const r = document.createRange();
  r.selectNodeContents(champ);
  r.setEnd(noeud, decalage);
  const conteneur = document.createElement('div');
  conteneur.appendChild(r.cloneContents());
  return texteDe(lire(conteneur)).length;
}

/** Point du DOM correspondant à une position dans le texte affiché. */
function pointDe(champ: HTMLElement, pos: number): [Node, number] {
  let restant = pos;
  let trouve: [Node, number] | null = null;
  const visite = (n: Node) => {
    if (trouve) return;
    if (n.nodeType === Node.TEXT_NODE) {
      const l = (n.textContent || '').length;
      if (restant <= l) trouve = [n, restant]; else restant -= l;
      return;
    }
    if (n instanceof HTMLElement && n.tagName === 'BR') {
      if (restant === 0) trouve = [n.parentNode!, Array.prototype.indexOf.call(n.parentNode!.childNodes, n)];
      else restant -= 1;
      return;
    }
    n.childNodes.forEach(visite);
  };
  champ.childNodes.forEach(visite);
  return trouve ?? [champ, champ.childNodes.length];
}

interface Props {
  value: string;
  onChange: (note: string) => void;
  /** Collage : gère les images collées (retourne en ayant fait `preventDefault`) ; le texte collé est inséré sans mise en forme. */
  onPaste?: (e: ClipboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  id?: string;
}

export default function NoteEditable({ value, onChange, onPaste, placeholder, id }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const dernier = useRef<string | null>(null);
  const [barre, setBarre] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && value !== dernier.current) { dessiner(el, value); dernier.current = value; }
  }, [value]);

  // La barre n'apparaît que lorsque du texte de CE champ est sélectionné.
  useEffect(() => {
    const surSelection = () => {
      const el = ref.current;
      const sel = window.getSelection();
      setBarre(!!(el && sel && sel.rangeCount && !sel.isCollapsed && el.contains(sel.anchorNode) && el.contains(sel.focusNode)));
    };
    document.addEventListener('selectionchange', surSelection);
    return () => document.removeEventListener('selectionchange', surSelection);
  }, []);

  function emettre() {
    const el = ref.current;
    if (!el) return;
    const segs = lire(el);
    if (!texteDe(segs)) el.innerHTML = '';
    const note = segmentsEnNote(segs);
    dernier.current = note;
    onChange(note);
  }

  function formater(format: { gras: true } | { couleur: string | null }) {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const debut = positionTexte(el, r.startContainer, r.startOffset);
    const fin = positionTexte(el, r.endContainer, r.endOffset);
    const note = formaterPlage(segmentsEnNote(lire(el)), debut, fin, format);
    if (note == null) return;
    dessiner(el, note);
    dernier.current = note;
    onChange(note);
    const [n1, o1] = pointDe(el, debut);
    const [n2, o2] = pointDe(el, fin);
    const nr = document.createRange();
    nr.setStart(n1, o1);
    nr.setEnd(n2, o2);
    sel.removeAllRanges();
    sel.addRange(nr);
  }

  return (
    <div>
      {barre && (
        <div className="flex items-center gap-1 mb-1 rounded-md border border-border bg-background px-1.5 py-1 w-fit shadow-sm" onMouseDown={e => e.preventDefault()}>
          <button type="button" onClick={() => formater({ gras: true })} title="Gras" className="h-6 w-6 rounded text-xs font-bold hover:bg-muted">G</button>
          <span className="w-px h-4 bg-border mx-0.5" />
          {COULEURS_NOTE.map(c => (
            <button key={c.nom} type="button" onClick={() => formater({ couleur: c.hex })} title={c.hex ? `Texte ${c.nom.toLowerCase()}` : 'Couleur par défaut'}
              className="h-5 w-5 rounded-full border border-border hover:scale-110 transition-transform flex items-center justify-center text-[10px] text-muted-foreground"
              style={c.hex ? { backgroundColor: c.hex } : undefined}>{c.hex ? '' : '×'}</button>
          ))}
        </div>
      )}
      <div
        ref={ref}
        id={id}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emettre}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); } }}
        onPaste={e => {
          onPaste?.(e);
          if (e.defaultPrevented) return;
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
        }}
        className="w-full min-h-6 whitespace-pre-wrap break-words text-xs text-muted-foreground bg-transparent border border-transparent hover:border-input focus:border-input rounded-md px-3 py-1 outline-none leading-5 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/60"
      />
    </div>
  );
}
