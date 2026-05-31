import { useRef } from 'react';
import FilterPopover from './FilterPopover';

// Filtre de colonne à choix fixes, dont la liste s'ouvre directement à l'affichage.
//
// Mode "exclusion" (excludable=true) : un clic prolongé (≥450ms) sur une option
// la barre et l'exclut des résultats. La valeur est alors encodée "!a,b,c".
// Un clic simple sélectionne l'option seule (mode inclusion classique).
//
// Helpers exportés pour la logique de filtrage :
//   parseChoiceFilter(value) → { mode: 'none'|'only'|'exclude', only, excluded }

export function parseChoiceFilter(value: string): { mode: 'none' | 'only' | 'exclude'; only: string; excluded: string[] } {
  if (!value) return { mode: 'none', only: '', excluded: [] };
  if (value.startsWith('!')) {
    const excluded = value.slice(1).split(',').filter(Boolean);
    return { mode: excluded.length ? 'exclude' : 'none', only: '', excluded };
  }
  return { mode: 'only', only: value, excluded: [] };
}

export default function FilterChoiceInput({
  value,
  onChange,
  options,
  placeholder = 'Tous',
  excludable = false,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  excludable?: boolean;
  onClose?: () => void;
}) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const { mode, only, excluded } = parseChoiceFilter(value);

  // Résumé complet (pour l'infobulle au survol)
  const fullSummary = (() => {
    if (mode === 'none') return placeholder;
    if (mode === 'only') return options.find(o => o.value === only)?.label || placeholder;
    const labels = excluded.map(v => options.find(o => o.value === v)?.label || v);
    return `Sauf : ${labels.join(', ')}`;
  })();
  // Libellé court affiché dans le bouton (pas de "Sauf : …" permanent)
  const summary = (() => {
    if (mode === 'only') return options.find(o => o.value === only)?.label || placeholder;
    if (mode === 'exclude') return `(${excluded.length})`;
    return placeholder;
  })();

  function toggleExclude(v: string) {
    if (!v) return;
    const set = new Set(excluded);
    set.has(v) ? set.delete(v) : set.add(v);
    const arr = [...set];
    onChange(arr.length ? `!${arr.join(',')}` : '');
  }

  function selectOnly(v: string) {
    onChange(v); // '' = tous, sinon seul ce statut
  }

  function startPress(v: string) {
    if (!excludable || !v) return;
    longPressed.current = false;
    pressTimer.current = setTimeout(() => { longPressed.current = true; toggleExclude(v); }, 450);
  }
  function endPress() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }
  return (
    <FilterPopover
      defaultOpen
      width={200}
      onOpenChange={o => { if (!o) onClose?.(); }}
      trigger={({ toggle }) => (
        <button
          onClick={toggle}
          title={fullSummary}
          className={`h-6 text-xs w-auto max-w-[160px] rounded border px-2 py-0.5 flex items-center gap-1 bg-background hover:border-primary/60 ${mode !== 'none' ? 'border-primary text-primary' : 'border-input text-muted-foreground'}`}
        >
          <span className="truncate">{summary}</span>
          <span className="opacity-50">▾</span>
        </button>
      )}
    >
      {({ close }) => {
        const handleClick = (v: string) => {
          if (longPressed.current) { longPressed.current = false; return; }
          selectOnly(v);
          close();
        };
        return (
          <div className="max-h-72 overflow-y-auto">
            {options.map(o => {
              const isExcluded = excluded.includes(o.value);
              const isOnly = mode === 'only' && only === o.value;
              return (
                <button
                  key={o.value || '__all'}
                  onClick={() => handleClick(o.value)}
                  onMouseDown={() => startPress(o.value)}
                  onMouseUp={endPress}
                  onMouseLeave={endPress}
                  onContextMenu={e => { if (excludable && o.value) { e.preventDefault(); toggleExclude(o.value); } }}
                  title={excludable && o.value ? 'Clic = afficher seulement · clic prolongé / clic droit = masquer' : undefined}
                  className={`flex items-center justify-between gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60 ${isOnly ? 'bg-primary/10 text-primary font-medium' : ''} ${isExcluded ? 'line-through text-muted-foreground/60' : ''}`}
                >
                  <span>{o.label}</span>
                  {isExcluded && <span className="text-[10px] text-destructive shrink-0">masqué</span>}
                </button>
              );
            })}
            {excludable && (
              <p className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border leading-tight">
                Clic = afficher seulement.<br />Clic prolongé = masquer (barré).
              </p>
            )}
          </div>
        );
      }}
    </FilterPopover>
  );
}
