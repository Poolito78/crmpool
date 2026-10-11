import { ChevronDown, ChevronUp } from 'lucide-react';

/** Monter / descendre un élément d'une liste modifiable. */
export default function BoutonsOrdre({ index, total, onMove }: {
  index: number; total: number; onMove: (delta: -1 | 1) => void;
}) {
  const bouton = 'p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-25 disabled:hover:bg-transparent';
  return (
    <span className="inline-flex flex-col shrink-0">
      <button type="button" title="Monter" disabled={index === 0} onClick={() => onMove(-1)} className={bouton}>
        <ChevronUp className="w-3 h-3" />
      </button>
      <button type="button" title="Descendre" disabled={index >= total - 1} onClick={() => onMove(1)} className={bouton}>
        <ChevronDown className="w-3 h-3" />
      </button>
    </span>
  );
}
