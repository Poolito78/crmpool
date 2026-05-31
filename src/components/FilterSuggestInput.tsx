import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { X as XIcon } from 'lucide-react';

// Champ de filtre de colonne avec liste déroulante de suggestions qui s'ouvre
// dès le focus. La liste est rendue via portail (position fixe) pour échapper
// au conteneur scrollable du tableau.
export default function FilterSuggestInput({
  value,
  onChange,
  suggestions,
  placeholder = 'Filtrer…',
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  onClose?: () => void;
  /** @deprecated conservé pour compat — ≠∅ retiré */
  allowNonEmpty?: boolean;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const computePos = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.max(r.width, 160);
    let left = Math.min(r.left, window.innerWidth - w - 8);
    left = Math.max(8, left);
    setPos({ top: r.bottom + 4, left, width: w });
  };

  useLayoutEffect(() => { if (open) computePos(); }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => computePos();
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      if (listRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      onClose?.();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const q = value.toLowerCase();
  const list = suggestions
    .filter((n, i, arr) => n && arr.indexOf(n) === i)
    .filter(n => !q || n.toLowerCase().includes(q))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 50);

  return (
    <div className="relative" ref={wrapRef}>
      <input
        ref={inputRef}
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className="h-6 text-xs w-full rounded border border-input bg-background px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {open && list.length > 0 && pos && createPortal(
        <div
          ref={listRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width }}
          className="z-[60] bg-card border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto w-max max-w-[280px]"
        >
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
        </div>,
        document.body,
      )}
    </div>
  );
}
