import { useState, useRef, useEffect } from 'react';
import { X as XIcon } from 'lucide-react';

// Champ de filtre de colonne avec liste déroulante de suggestions qui s'ouvre
// dès le focus (sélection au clic OU saisie libre). Optionnellement un bouton ≠∅.
export default function FilterSuggestInput({
  value,
  onChange,
  suggestions,
  placeholder = 'Filtrer…',
  allowNonEmpty = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  allowNonEmpty?: boolean;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const isNV = value === '!empty';
  const q = (isNV ? '' : value).toLowerCase();
  const list = suggestions
    .filter((n, i, arr) => n && arr.indexOf(n) === i)
    .filter(n => !q || n.toLowerCase().includes(q))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 50);

  if (isNV) {
    return (
      <button onClick={() => onChange('')} className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full whitespace-nowrap">
        ≠ vide <XIcon className="w-3 h-3" />
      </button>
    );
  }

  return (
    <div className="relative flex items-center gap-0.5" ref={ref}>
      <div className="relative flex-1 min-w-0">
        <input
          placeholder={placeholder}
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="h-6 text-xs w-full rounded border border-input bg-background px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
          autoFocus={autoFocus}
        />
        {open && list.length > 0 && (
          <div className="absolute left-0 top-full mt-1 z-30 bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto min-w-full w-max max-w-[280px]">
            {value && (
              <button onClick={() => { onChange(''); setOpen(false); }} className="flex items-center gap-1 w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/60 border-b border-border">
                <XIcon className="w-3 h-3" /> Effacer le filtre
              </button>
            )}
            {list.map(n => (
              <button key={n} onClick={() => { onChange(n); setOpen(false); }} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60 truncate">
                {n}
              </button>
            ))}
          </div>
        )}
      </div>
      {allowNonEmpty && (
        <button onClick={() => onChange('!empty')} title="Non vide" className="shrink-0 text-xs text-muted-foreground hover:text-primary px-0.5 rounded leading-none">≠∅</button>
      )}
    </div>
  );
}
