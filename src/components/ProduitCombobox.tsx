import { useState, useRef, useEffect, useMemo } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Produit } from '@/lib/store';

interface ProduitComboboxProps {
  produits: Produit[];
  value: string;
  onSelect: (produitId: string) => void;
  autoFocus?: boolean;
}

export default function ProduitCombobox({ produits, value, onSelect, autoFocus }: ProduitComboboxProps) {
  const [open, setOpen] = useState(!!autoFocus);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = produits.find(p => p.id === value);

  const filtered = useMemo(() => {
    if (!query) return produits;
    const q = query.toLowerCase();
    return produits.filter(p =>
      p.description.toLowerCase().includes(q) ||
      p.reference.toLowerCase().includes(q) ||
      p.categorie?.toLowerCase().includes(q)
    );
  }, [produits, query]);

  // Reset highlight when filtered list changes
  useEffect(() => { setHighlightIndex(0); }, [filtered]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (open && listRef.current) {
      const item = listRef.current.children[highlightIndex + 1] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex, open]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    const totalItems = filtered.length + 1;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex(prev => (prev + 1) % totalItems);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex(prev => (prev - 1 + totalItems) % totalItems);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex === 0) {
          onSelect('');
          setOpen(false);
          setQuery('');
        } else {
          const p = filtered[highlightIndex - 1];
          if (p) {
            onSelect(p.id);
            setOpen(false);
            setQuery('');
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setQuery('');
        break;
    }
  }

  function selectItem(produitId: string) {
    onSelect(produitId);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex w-full items-center justify-between rounded border border-input bg-background px-2 py-1.5 text-sm hover:bg-accent/50 transition-colors"
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected ? selected.reference : '— Libre —'}
        </span>
        <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md animate-in fade-in-0 zoom-in-95">
          <div className="flex items-center border-b border-border px-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Rechercher un produit..."
              className="flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
          <div ref={listRef} className="max-h-48 overflow-y-auto p-1">
            {/* Libre option */}
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer transition-colors',
                highlightIndex === 0 ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
              )}
              onMouseEnter={() => setHighlightIndex(0)}
              onClick={() => selectItem('')}
            >
              <Check className={cn('h-3.5 w-3.5 shrink-0', !value ? 'opacity-100' : 'opacity-0')} />
              <span className="text-muted-foreground">— Libre —</span>
            </button>

            {filtered.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer transition-colors',
                  highlightIndex === i + 1 ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                )}
                onMouseEnter={() => setHighlightIndex(i + 1)}
                onClick={() => selectItem(p.id)}
              >
                <Check className={cn('h-3.5 w-3.5 shrink-0', value === p.id ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate">
                  <span className="font-medium">{p.reference}</span>
                  <span className="text-muted-foreground"> - {p.description}</span>
                  {p.categorie && <span className="text-xs text-muted-foreground/70 ml-1">({p.categorie})</span>}
                </span>
              </button>
            ))}

            {filtered.length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">Aucun produit trouvé</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
