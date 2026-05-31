import { useState, useRef, useEffect } from 'react';
import { X as XIcon, Calendar } from 'lucide-react';

// Filtre de colonne date. Valeur encodée : "op|d1|d2"
//   op ∈ '' | 'eq' | 'before' | 'after' | 'between'  (dates au format YYYY-MM-DD)
// parseDateFilter / matchDateFilter exportés pour la logique de filtrage.
export function parseDateFilter(v: string): { op: string; d1: string; d2: string } {
  const [op = '', d1 = '', d2 = ''] = (v || '').split('|');
  return { op, d1, d2 };
}
export function matchDateFilter(v: string, dateStr: string | undefined): boolean {
  const { op, d1, d2 } = parseDateFilter(v);
  if (!op) return true;
  const d = (dateStr || '').split('T')[0];
  if (!d) return false;
  switch (op) {
    case 'eq': return !d1 || d === d1;
    case 'before': return !d1 || d < d1;
    case 'after': return !d1 || d > d1;
    case 'between': return (!d1 || d >= d1) && (!d2 || d <= d2);
    default: return true;
  }
}

const OP_LABELS: Record<string, string> = { eq: 'Le', before: 'Avant', after: 'Après', between: 'Entre' };

export default function FilterDateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { op, d1, d2 } = parseDateFilter(value);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const fmt = (s: string) => s ? new Date(s + 'T00:00:00').toLocaleDateString('fr-FR') : '';
  const summary = !op ? '' :
    op === 'between' ? `${fmt(d1)} – ${fmt(d2)}` :
    `${OP_LABELS[op]} ${fmt(d1)}`;

  const setOp = (newOp: string) => onChange(`${newOp}|${d1}|${d2}`);
  const setD1 = (v: string) => onChange(`${op || 'eq'}|${v}|${d2}`);
  const setD2 = (v: string) => onChange(`${op || 'between'}|${d1}|${v}`);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className={`h-6 text-xs w-full rounded border px-2 py-0.5 flex items-center gap-1 ${op ? 'border-primary text-primary' : 'border-input text-muted-foreground'} bg-background hover:border-primary/60`}>
        <Calendar className="w-3 h-3 shrink-0" />
        <span className="truncate flex-1 text-left">{summary || 'Filtrer date…'}</span>
        {op && <span role="button" tabIndex={0} onClick={e => { e.stopPropagation(); onChange(''); }} className="shrink-0 hover:text-destructive cursor-pointer"><XIcon className="w-3 h-3" /></span>}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 bg-card border border-border rounded-lg shadow-lg p-2 w-56 space-y-2">
          <div className="grid grid-cols-2 gap-1">
            {(['eq', 'before', 'after', 'between'] as const).map(o => (
              <button key={o} onClick={() => setOp(o)} className={`text-xs px-2 py-1 rounded ${op === o ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted text-foreground'}`}>{OP_LABELS[o]}</button>
            ))}
          </div>
          <div className="space-y-1">
            <input type="date" value={d1} onChange={e => setD1(e.target.value)} className="h-7 text-xs w-full rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring" />
            {op === 'between' && <input type="date" value={d2} onChange={e => setD2(e.target.value)} className="h-7 text-xs w-full rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring" />}
          </div>
          <div className="flex justify-between">
            <button onClick={() => { onChange(''); setOpen(false); }} className="text-xs text-muted-foreground hover:text-foreground">Effacer</button>
            <button onClick={() => setOpen(false)} className="text-xs text-primary font-medium">OK</button>
          </div>
        </div>
      )}
    </div>
  );
}
