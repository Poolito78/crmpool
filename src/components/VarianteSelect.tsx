import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { type VarianteDimension, type VarianteOption } from '@/lib/store';
import { cn } from '@/lib/utils';
import { getRalInfo } from '@/lib/ralColors';

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
  // Swatch RAL auto-détecté depuis le label
  const ral = getRalInfo(opt.label);
  if (ral) {
    return (
      <div
        className={cn(dim, 'rounded shrink-0 border border-black/10')}
        style={{ backgroundColor: ral.hex }}
      />
    );
  }
  return null;
}

/** Badge RAL compact (fond coloré + numéro) */
function RalBadge({ label, selected }: { label: string; selected?: boolean }) {
  const ral = getRalInfo(label);
  if (!ral) return null;
  return (
    <span
      style={{
        backgroundColor: ral.hex,
        color: ral.dark ? '#fff' : '#1a1a1a',
        border: ral.white ? '1px solid #ccc' : undefined,
        padding: '1px 7px',
        borderRadius: '4px',
        fontSize: '0.68rem',
        fontWeight: 700,
        letterSpacing: '0.04em',
        flexShrink: 0,
      }}
    >
      {ral.quartz && <>{ral.quartz} · </>}RAL {ral.num}
    </span>
  );
}

export default function VarianteSelect({ dimension, value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<VarianteOption | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const selectedOpt = dimension.options.find(o => o.label === value) ?? dimension.options[0];
  const hasVisuals = dimension.options.some(o => o.couleur || o.imageUrl);
  const hasRal = !hasVisuals && dimension.options.some(o => getRalInfo(o.label));
  // RAL détecté depuis le label (prioritaire sur imageUrl qui peut être cassée)
  const selectedRal = !selectedOpt?.couleur ? getRalInfo(selectedOpt?.label || '') : undefined;

  useEffect(() => {
    if (!open) { setHovered(null); return; } // menu fermé → masque l'aperçu survol
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
        className="h-8 w-full flex items-center gap-1.5 rounded border px-2 text-sm transition-colors"
        style={selectedRal ? {
          backgroundColor: selectedRal.hex,
          color: selectedRal.dark ? '#ffffff' : '#1a1a1a',
          borderColor: selectedRal.white ? '#ccc' : 'rgba(0,0,0,0.15)',
        } : undefined}
      >
        {selectedOpt && !selectedRal && <SwatchPreview opt={selectedOpt} size="sm" />}
        <span className="flex-1 text-left truncate font-medium">
          {selectedRal
            ? (selectedRal.quartz
                ? `${selectedRal.quartz} · RAL ${selectedRal.num}`
                : `RAL ${selectedRal.num}`)
            : selectedOpt?.label ?? '—'}
          {!selectedRal && selectedOpt?.prixDiff ? ` (${selectedOpt.prixDiff > 0 ? '+' : ''}${selectedOpt.prixDiff}€)` : ''}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>

      {/* Menu déroulant */}
      {open && (
        <div className="absolute z-50 mt-1 bg-background border rounded-lg shadow-xl overflow-hidden"
          style={{ minWidth: '200px', maxWidth: '340px', left: 0 }}>
          {hasVisuals ? (
            // Grille de swatches visuels
            <div className="p-2 grid gap-1"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}>
              {dimension.options.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { onChange(opt.label); setOpen(false); setHovered(null); }}
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
                  {(() => {
                    const ral = !opt.imageUrl && !opt.couleur ? getRalInfo(opt.label) : undefined;
                    if (opt.imageUrl) {
                      const ralBg = getRalInfo(opt.label);
                      return (
                        <div className="w-12 h-12 rounded overflow-hidden border border-black/10"
                          style={ralBg ? { backgroundColor: ralBg.hex } : undefined}>
                          <img src={opt.imageUrl} alt={opt.label} className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                      );
                    }
                    if (opt.couleur) return (
                      <div className="w-12 h-12 rounded border border-black/10" style={{ backgroundColor: opt.couleur }} />
                    );
                    if (ral) return (
                      <div className="w-12 h-12 rounded border flex items-center justify-center"
                        style={{ backgroundColor: ral.hex, borderColor: ral.white ? '#ccc' : 'rgba(0,0,0,0.15)' }}>
                        <span className="text-[9px] font-bold leading-tight text-center" style={{ color: ral.dark ? '#fff' : '#222' }}>
                          {ral.quartz && <>{ral.quartz}<br/></>}
                          <span className="opacity-80">RAL {ral.num}</span>
                        </span>
                      </div>
                    );
                    return <div className="w-12 h-12 rounded bg-muted/40 border border-black/10" />;
                  })()}
                  <span className="text-[10px] leading-tight line-clamp-2 w-full">
                    {(() => {
                      const r = getRalInfo(opt.label);
                      if (r?.quartz) return r.quartz;
                      if (r) return `RAL ${r.num}`;
                      return opt.label;
                    })()}
                    {opt.prixDiff ? <span className="text-muted-foreground"> ({opt.prixDiff > 0 ? '+' : ''}{opt.prixDiff}€)</span> : ''}
                  </span>
                </button>
              ))}
            </div>
          ) : hasRal ? (
            // Liste avec badges RAL colorés
            <div className="py-1 max-h-72 overflow-y-auto">
              {dimension.options.map(opt => {
                const ral = getRalInfo(opt.label);
                const isSelected = opt.label === value;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => { onChange(opt.label); setOpen(false); }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors',
                      isSelected ? 'bg-accent/60 font-medium' : 'hover:bg-accent/40'
                    )}
                  >
                    {/* Swatch couleur RAL */}
                    {ral && (
                      <span
                        className="shrink-0 rounded"
                        style={{
                          width: 18, height: 18,
                          backgroundColor: ral.hex,
                          border: ral.white ? '1px solid #ccc' : '1px solid rgba(0,0,0,0.15)',
                          display: 'inline-block',
                        }}
                      />
                    )}
                    <span className="flex-1 truncate">{opt.label}</span>
                    {opt.prixDiff ? <span className="text-xs text-muted-foreground ml-auto shrink-0">{opt.prixDiff > 0 ? '+' : ''}{opt.prixDiff}€</span> : ''}
                  </button>
                );
              })}
            </div>
          ) : (
            // Liste simple sans visuels
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
