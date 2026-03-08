import { useState, useRef, useEffect, useMemo } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Client } from '@/lib/store';

interface ClientComboboxProps {
  clients: Client[];
  value: string;
  onSelect: (clientId: string) => void;
}

export default function ClientCombobox({ clients, value, onSelect }: ClientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = clients.find(c => c.id === value);

  const filtered = useMemo(() => {
    if (!query) return clients;
    const q = query.toLowerCase();
    return clients.filter(c =>
      c.nom.toLowerCase().includes(q) ||
      c.societe?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  }, [clients, query]);

  // Reset highlight when filtered list changes
  useEffect(() => { setHighlightIndex(0); }, [filtered]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (open && listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLElement;
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

    const totalItems = filtered.length;

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
        if (filtered.length > 0) {
          const c = filtered[highlightIndex];
          if (c) {
            onSelect(c.id);
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

  function selectItem(clientId: string) {
    onSelect(clientId);
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
          {selected ? `${selected.nom}${selected.societe ? ` (${selected.societe})` : ''}` : '— Sélectionner un client —'}
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
              placeholder="Rechercher un client..."
              className="flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
          <div ref={listRef} className="max-h-48 overflow-y-auto p-1">
            {filtered.map((c, i) => (
              <button
                key={c.id}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer transition-colors',
                  highlightIndex === i ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                )}
                onMouseEnter={() => setHighlightIndex(i)}
                onClick={() => selectItem(c.id)}
              >
                <Check className={cn('h-3.5 w-3.5 shrink-0', value === c.id ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate flex-1 text-left">
                  <span className="font-medium">{c.nom}</span>
                  {c.societe && <span className="text-muted-foreground"> ({c.societe})</span>}
                  {c.email && <span className="text-xs text-muted-foreground/70 ml-1">{c.email}</span>}
                </span>
              </button>
            ))}

            {filtered.length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">Aucun client trouvé</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
