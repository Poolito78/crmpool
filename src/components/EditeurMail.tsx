/**
 * Éditeur du texte d'un mail : police, taille, couleur, gras, italique,
 * souligné. Valeur = HTML (celui qui part dans le .eml).
 *
 * contentEditable + `document.execCommand`, sans dépendance, comme
 * `RichTextEditor`. Deux précautions :
 * - les listes déroulantes sont le `Select` du projet (un `<select>` natif
 *   dans un dialogue Radix voit son choix annulé) ; il prend le focus, donc
 *   la sélection du texte est mémorisée à chaque changement et rétablie
 *   avant d'appliquer la mise en forme ;
 * - la taille sort en `<font size=7>` d'`execCommand`, aussitôt réécrit en
 *   `style="font-size:Npt"` sur la même balise : Outlook lit les points, pas
 *   les tailles 1-7 du HTML ancien.
 *
 * `inserer(texte)` (via ref) place un champ `{numero}` ou un repère d'image
 * au curseur — ou à la fin si le texte n'a jamais eu le focus.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Bold, Italic, Underline, Eraser } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POLICE_MAIL, TAILLE_MAIL } from '@/lib/mailsTypes';

const POLICES = ['Calibri', 'Aptos', 'Arial', 'Verdana', 'Tahoma', 'Segoe UI', 'Georgia', 'Times New Roman', 'Courier New'];
const TAILLES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24];
const COULEURS = ['#000000', '#404040', '#7F7F7F', '#CC0000', '#C55A11', '#BF8F00', '#548235', '#1F4E79', '#2E75B6', '#7030A0'];

export interface EditeurMailRef {
  /** Insère du texte brut au curseur (ou à la fin). */
  inserer: (texte: string) => void;
}

interface Props {
  value: string;
  onChange: (html: string) => void;
  onFocus?: () => void;
  className?: string;
  minHeight?: number;
}

const EditeurMail = forwardRef<EditeurMailRef, Props>(function EditeurMail({ value, onChange, onFocus, className = '', minHeight = 260 }, ref) {
  const zone = useRef<HTMLDivElement>(null);
  const plage = useRef<Range | null>(null);

  // Valeur entrante appliquée seulement si elle diffère (sinon le curseur saute).
  useEffect(() => {
    if (zone.current && zone.current.innerHTML !== value) zone.current.innerHTML = value || '';
  }, [value]);

  // Mémorise la sélection tant qu'elle est dans la zone : un Select qui prend le focus ne la perd pas.
  useEffect(() => {
    const suivre = () => {
      const sel = document.getSelection();
      if (sel && sel.rangeCount && zone.current?.contains(sel.anchorNode)) plage.current = sel.getRangeAt(0).cloneRange();
    };
    document.addEventListener('selectionchange', suivre);
    return () => document.removeEventListener('selectionchange', suivre);
  }, []);

  const restaurer = useCallback(() => {
    const el = zone.current;
    if (!el) return;
    el.focus();
    const sel = document.getSelection();
    if (!sel) return;
    if (plage.current && el.contains(plage.current.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(plage.current);
    } else {
      // Jamais touché : curseur en fin de texte.
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }, []);

  const publier = useCallback(() => { if (zone.current) onChange(zone.current.innerHTML); }, [onChange]);

  const exec = useCallback((cmd: string, arg?: string) => {
    restaurer();
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(cmd, false, arg);
    publier();
  }, [restaurer, publier]);

  const taille = useCallback((pt: number) => {
    restaurer();
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand('fontSize', false, '7');
    /* Modifié SUR PLACE, pas remplacé : la même balise porte souvent la couleur
       ou la police (`<font color size>`), et la sélection en cours y est
       ancrée — la remplacer perdait l'une et l'autre. */
    zone.current?.querySelectorAll<HTMLElement>('font[size="7"]').forEach(f => {
      f.removeAttribute('size');
      f.style.fontSize = `${pt}pt`;
    });
    publier();
  }, [restaurer, publier]);

  useImperativeHandle(ref, () => ({
    inserer: (texte: string) => {
      restaurer();
      document.execCommand('insertText', false, texte);
      publier();
    },
  }), [restaurer, publier]);

  const Btn = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => (
    <button type="button" onMouseDown={e => { e.preventDefault(); onClick(); }} title={title}
      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
      {children}
    </button>
  );

  return (
    <div className={`flex flex-col border border-input rounded-lg overflow-hidden bg-background ${className}`}>
      <div className="flex items-center gap-1 flex-wrap border-b border-border bg-muted/30 px-1.5 py-1">
        <Select value="" onValueChange={v => exec('fontName', v)}>
          <SelectTrigger className="h-7 w-[130px] text-xs" title="Police"><SelectValue placeholder="Police" /></SelectTrigger>
          <SelectContent>
            {POLICES.map(p => <SelectItem key={p} value={p}><span style={{ fontFamily: p }}>{p}</span></SelectItem>)}
          </SelectContent>
        </Select>
        <Select value="" onValueChange={v => taille(Number(v))}>
          <SelectTrigger className="h-7 w-[78px] text-xs" title="Taille"><SelectValue placeholder="Taille" /></SelectTrigger>
          <SelectContent>
            {TAILLES.map(t => <SelectItem key={t} value={String(t)}>{t} pt</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="w-px h-5 bg-border mx-0.5" />
        <Btn onClick={() => exec('bold')} title="Gras (Ctrl+B)"><Bold className="w-4 h-4" /></Btn>
        <Btn onClick={() => exec('italic')} title="Italique (Ctrl+I)"><Italic className="w-4 h-4" /></Btn>
        <Btn onClick={() => exec('underline')} title="Souligné (Ctrl+U)"><Underline className="w-4 h-4" /></Btn>
        <span className="w-px h-5 bg-border mx-0.5" />
        <span className="inline-flex items-center gap-0.5" title="Couleur du texte">
          {COULEURS.map(c => (
            <button key={c} type="button" title={c} onMouseDown={e => { e.preventDefault(); exec('foreColor', c); }}
              className="w-4 h-4 rounded-sm border border-border/60 hover:scale-110 transition-transform" style={{ backgroundColor: c }} />
          ))}
          <label className="relative w-5 h-5 rounded-sm border border-border/60 cursor-pointer overflow-hidden"
            title="Autre couleur" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
            <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => exec('foreColor', e.target.value)} />
          </label>
        </span>
        <span className="w-px h-5 bg-border mx-0.5" />
        <Btn onClick={() => exec('removeFormat')} title="Effacer la mise en forme de la sélection"><Eraser className="w-4 h-4" /></Btn>
      </div>
      <div
        ref={zone}
        contentEditable
        suppressContentEditableWarning
        onInput={publier}
        onBlur={publier}
        onFocus={onFocus}
        className="px-3 py-2 outline-none overflow-auto"
        style={{ minHeight, fontFamily: POLICE_MAIL, fontSize: TAILLE_MAIL }}
      />
    </div>
  );
});

export default EditeurMail;
