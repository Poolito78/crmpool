import { X as XIcon, Euro } from 'lucide-react';
import FilterPopover from './FilterPopover';

// Filtre de colonne montant. Valeur encodée : "op|n1|n2"
//   op ∈ '' | 'eq' | 'lt' | 'gt' | 'between'
export function parseAmountFilter(v: string): { op: string; n1: string; n2: string } {
  const [op = '', n1 = '', n2 = ''] = (v || '').split('|');
  return { op, n1, n2 };
}
export function matchAmountFilter(v: string, amount: number): boolean {
  const { op, n1, n2 } = parseAmountFilter(v);
  if (!op) return true;
  const a = Number(n1);
  const b = Number(n2);
  switch (op) {
    case 'eq': return n1 === '' || Math.abs(amount - a) < 0.005;
    case 'lt': return n1 === '' || amount < a;
    case 'gt': return n1 === '' || amount > a;
    case 'between': return (n1 === '' || amount >= a) && (n2 === '' || amount <= b);
    default: return true;
  }
}

const OP_LABELS: Record<string, string> = { eq: '=', lt: '<', gt: '>', between: 'Entre' };

export default function FilterAmountInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { op, n1, n2 } = parseAmountFilter(value);
  const summary = !op ? '' :
    op === 'between' ? `${n1 || '…'} – ${n2 || '…'} €` :
    `${OP_LABELS[op]} ${n1 || '…'} €`;
  const setOp = (newOp: string) => onChange(`${newOp}|${n1}|${n2}`);
  const setN1 = (v: string) => onChange(`${op || 'eq'}|${v}|${n2}`);
  const setN2 = (v: string) => onChange(`${op || 'between'}|${n1}|${v}`);

  return (
    <FilterPopover
      align="right"
      width={208}
      defaultOpen
      trigger={({ toggle }) => (
        <button onClick={toggle} className={`h-6 text-xs w-full rounded border px-2 py-0.5 flex items-center gap-1 ${op ? 'border-primary text-primary' : 'border-input text-muted-foreground'} bg-background hover:border-primary/60`}>
          <Euro className="w-3 h-3 shrink-0" />
          <span className="truncate flex-1 text-left">{summary || 'Filtrer montant…'}</span>
          {op && <span role="button" tabIndex={0} onClick={e => { e.stopPropagation(); onChange(''); }} className="shrink-0 hover:text-destructive cursor-pointer"><XIcon className="w-3 h-3" /></span>}
        </button>
      )}
    >
      {({ close }) => (
        <div className="p-2 space-y-2">
          <div className="grid grid-cols-4 gap-1">
            {(['eq', 'lt', 'gt', 'between'] as const).map(o => (
              <button key={o} onClick={() => setOp(o)} className={`text-xs px-1 py-1 rounded ${op === o ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted text-foreground'}`}>{OP_LABELS[o]}</button>
            ))}
          </div>
          <div className="space-y-1">
            <input type="number" step="0.01" placeholder="Montant €" value={n1} onChange={e => setN1(e.target.value)} className="h-7 text-xs w-full rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring" autoFocus />
            {op === 'between' && <input type="number" step="0.01" placeholder="Montant max €" value={n2} onChange={e => setN2(e.target.value)} className="h-7 text-xs w-full rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring" />}
          </div>
          <div className="flex justify-between">
            <button onClick={() => { onChange(''); close(); }} className="text-xs text-muted-foreground hover:text-foreground">Effacer</button>
            <button onClick={close} className="text-xs text-primary font-medium">OK</button>
          </div>
        </div>
      )}
    </FilterPopover>
  );
}
