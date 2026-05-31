import { useState, useRef, useEffect } from 'react';

// Filtre de colonne à choix fixes, dont la liste s'ouvre directement à l'affichage.
export default function FilterChoiceInput({
  value,
  onChange,
  options,
  placeholder = 'Tous',
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const current = options.find(o => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`h-6 text-xs w-full rounded border px-2 py-0.5 flex items-center justify-between gap-1 bg-background hover:border-primary/60 ${value ? 'border-primary text-primary' : 'border-input text-muted-foreground'}`}
      >
        <span className="truncate">{current?.label || placeholder}</span>
        <span className="opacity-50">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto min-w-full w-max">
          {options.map(o => (
            <button
              key={o.value || '__all'}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60 ${o.value === value ? 'bg-primary/10 text-primary font-medium' : ''}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
