import { useRef, useEffect } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Heading1, Heading2, Type, Eraser } from 'lucide-react';

// Éditeur de texte riche minimal basé sur contentEditable + document.execCommand.
// Valeur = HTML. Pas de dépendance externe.
export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Saisissez le texte…',
  className = '',
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Synchronise la valeur entrante seulement si différente (évite de casser le curseur)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const Btn = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => (
    <button type="button" onMouseDown={e => { e.preventDefault(); onClick(); }} title={title} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
      {children}
    </button>
  );

  return (
    <div className={`flex flex-col border border-input rounded-lg overflow-hidden bg-background ${className}`}>
      {/* Barre d'outils */}
      <div className="flex items-center gap-0.5 flex-wrap border-b border-border bg-muted/30 px-1.5 py-1 sticky top-0 z-10">
        <Btn onClick={() => exec('bold')} title="Gras (Ctrl+B)"><Bold className="w-4 h-4" /></Btn>
        <Btn onClick={() => exec('italic')} title="Italique (Ctrl+I)"><Italic className="w-4 h-4" /></Btn>
        <Btn onClick={() => exec('underline')} title="Souligné (Ctrl+U)"><Underline className="w-4 h-4" /></Btn>
        <span className="w-px h-5 bg-border mx-1" />
        <Btn onClick={() => exec('formatBlock', 'h1')} title="Titre 1"><Heading1 className="w-4 h-4" /></Btn>
        <Btn onClick={() => exec('formatBlock', 'h2')} title="Titre 2"><Heading2 className="w-4 h-4" /></Btn>
        <Btn onClick={() => exec('formatBlock', 'p')} title="Paragraphe"><Type className="w-4 h-4" /></Btn>
        <span className="w-px h-5 bg-border mx-1" />
        <Btn onClick={() => exec('insertUnorderedList')} title="Liste à puces"><List className="w-4 h-4" /></Btn>
        <Btn onClick={() => exec('insertOrderedList')} title="Liste numérotée"><ListOrdered className="w-4 h-4" /></Btn>
        <span className="w-px h-5 bg-border mx-1" />
        {/* Taille de police */}
        <select
          onMouseDown={e => e.stopPropagation()}
          onChange={e => { exec('fontSize', e.target.value); e.currentTarget.selectedIndex = 0; }}
          className="h-7 text-xs rounded border border-input bg-background px-1"
          title="Taille du texte"
          defaultValue=""
        >
          <option value="" disabled>Taille</option>
          <option value="2">Petit</option>
          <option value="3">Normal</option>
          <option value="5">Grand</option>
          <option value="6">Très grand</option>
        </select>
        <Btn onClick={() => exec('removeFormat')} title="Effacer la mise en forme"><Eraser className="w-4 h-4" /></Btn>
      </div>
      {/* Zone éditable */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => { if (ref.current) onChange(ref.current.innerHTML); }}
        data-placeholder={placeholder}
        className="rte-content flex-1 min-h-[300px] overflow-y-auto px-4 py-3 text-sm focus:outline-none [&_h1]:text-xl [&_h1]:font-bold [&_h1]:my-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:my-1.5 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-1"
      />
    </div>
  );
}
