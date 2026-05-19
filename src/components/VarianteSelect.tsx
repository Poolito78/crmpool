import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { type VarianteDimension, type VarianteOption } from '@/lib/store';
import { cn } from '@/lib/utils';

interface Props {
  dimension: VarianteDimension;
  value: string;
  onChange: (label: string) => void;
  className?: string;
}

function SwatchPreview({ opt, size = 'sm' }: { opt: VarianteOption; size?: 'sm' | 'lg' }) {
  const dim = size === 'sm' ? 'w-5 h-5' : 'w-14 h-14';
  if (opt.imageUrl) {
    return (
      <img
        src={opt.imageUrl}
        alt={opt.label}
        className={cn(dim, 'rounded object-cover shrink-0')}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  if (opt.couleur) {
    return (
      <div
        className={cn(dim, 'rounded shrink-0 border border-black/10')}
        style={{ backgroundColor: opt.couleur }}
      />
    );
  }
  return null;
}

export default function VarianteSelect({ dimension, value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<VarianteOption | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const selectedOpt = dimension.options.find(o => o.label === value) ?? dimension.options[0];
  const hasVisuals = dimension.options.some(o => o.couleur || o.imageUrl);

  // Fermer au clic extérieur
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      {/* Bouton déclencheur */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="h-8 w-full flex items-center gap-1.5 rounded border border-input bg-background px-2 text-sm hover:bg-accent/50 transition-colors"
      >
        {selectedOpt && <SwatchPreview opt={selectedOpt} size="sm" />}
        <span className="flex-1 text-left truncate">
          {selectedOpt?.label ?? '—'}
          {selectedOpt?.prixDiff ? ` (${selectedOpt.prixDiff > 0 ? '+' : ''}${selectedOpt.prixDiff}€)` : ''}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {/* Menu déroulant */}
      {open && (
        <div className="absolute z-50 mt-1 bg-background border rounded-lg shadow-xl overflow-hidden"
          style={{ minWidth: '180px', maxWidth: '320px', left: 0 }}>
          {hasVisuals ? (
            // Grille de swatches visuels
            <div className="p-2 grid gap-1"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}>
              {dimension.options.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { onChange(opt.label); setOpen(false); }}
                  onMouseEnter={e => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setHoverPos({ x: r.right + 8, y: r.top });
                    setHovered(opt);
                  }}
                  onMouseLeave={() => setHovered(null)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded p-1 text-center hover:bg-accent transition-colors',
                    opt.label === value && 'ring-2 ring-primary bg-accent/60'
                  )}
                  title={opt.label}
                >
                  {(opt.imageUrl || opt.couleur) && (
                    <div className="w-12 h-12 rounded overflow-hidden border border-black/10">
                      {opt.imageUrl
                        ? <img src={opt.imageUrl} alt={opt.label} className="w-full h-full object-cover" />
                        : <div className="w-full h-full" style={{ backgroundColor: opt.couleur }} />
                      }
                    </div>
                  )}
                  <span className="text-[10px] leading-tight line-clamp-2 w-full">
                    {opt.label}
                    {opt.prixDiff ? <span className="text-muted-foreground"> ({opt.prixDiff > 0 ? '+' : ''}{opt.prixDiff}€)</span> : ''}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            // Liste simple si pas de visuels
            <div className="py-1">
              {dimension.options.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { onChange(opt.label); setOpen(false); }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors',
                    opt.label === value && 'bg-accent/60 font-medium'
                  )}
                >
                  {opt.label}
                  {opt.prixDiff ? <span className="text-xs text-muted-foreground ml-auto">{opt.prixDiff > 0 ? '+' : ''}{opt.prixDiff}€</span> : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tooltip survol — image agrandie */}
      {hovered && (hovered.imageUrl || hovered.couleur) && (
        <div
          className="fixed z-[100] bg-background border rounded-xl shadow-2xl p-2 pointer-events-none"
          style={{ left: Math.min(hoverPos.x, window.innerWidth - 180), top: Math.max(8, hoverPos.y - 20) }}
        >
          {hovered.imageUrl
            ? <img src={hovered.imageUrl} alt={hovered.label} className="w-40 h-40 object-cover rounded-lg" />
            : <div className="w-40 h-40 rounded-lg border border-black/10" style={{ backgroundColor: hovered.couleur }} />
          }
          <p className="text-xs font-medium text-center mt-1">{hovered.label}</p>
        </div>
      )}
    </div>
  );
}
