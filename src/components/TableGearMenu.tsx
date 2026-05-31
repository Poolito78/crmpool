import { useState, useRef, useEffect } from 'react';
import { Settings, Download } from 'lucide-react';

// Roue crantée à poser dans la dernière cellule d'en-tête d'un tableau.
// Regroupe le choix des colonnes visibles + l'export (convention vues tableau).
export default function TableGearMenu<K extends string>({
  cols,
  visible,
  onToggle,
  onExport,
}: {
  cols: readonly { key: K; label: string }[];
  visible: Set<K>;
  onToggle: (k: K) => void;
  onExport?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button onClick={() => setOpen(o => !o)} title="Colonnes & export" className="p-1.5 rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground transition-colors">
        <Settings className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 bg-card border border-border rounded-xl shadow-lg py-1 min-w-48 text-left font-normal">
          <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Colonnes affichées</p>
          <div className="max-h-72 overflow-y-auto">
            {cols.map(c => (
              <label key={c.key} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted/50 cursor-pointer text-sm select-none">
                <input type="checkbox" checked={visible.has(c.key)} onChange={() => onToggle(c.key)} className="rounded accent-primary w-3.5 h-3.5" />
                {c.label}
              </label>
            ))}
          </div>
          {onExport && (
            <button onClick={() => { setOpen(false); onExport(); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 text-foreground border-t border-border mt-1">
              <Download className="w-4 h-4 text-muted-foreground" /> Exporter (Excel)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
