import { Settings, Download } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';

// Roue crantée à poser dans la dernière cellule d'en-tête d'un tableau.
// Regroupe le choix des colonnes visibles + l'export (convention vues tableau).
// Menu rendu via Radix (portail) → toujours au premier plan, jamais rogné par
// le conteneur scrollable du tableau.
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button title="Colonnes & export" className="p-1.5 rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground transition-colors">
          <Settings className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 max-h-[70vh] overflow-y-auto">
        <p className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Colonnes affichées</p>
        {cols.map(c => (
          <DropdownMenuCheckboxItem
            key={c.key}
            checked={visible.has(c.key)}
            onSelect={e => e.preventDefault()}
            onCheckedChange={() => onToggle(c.key)}
          >
            {c.label}
          </DropdownMenuCheckboxItem>
        ))}
        {onExport && (
          <DropdownMenuItem className="border-t border-border mt-1" onClick={onExport}>
            <Download className="w-4 h-4 mr-2 text-muted-foreground" /> Exporter (Excel)
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
