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
    return clients.filter(c => {
      if ((c.societe || c.nom).toLowerCase().includes(q)) return true;
      if (c.email?.toLowerCase().includes(q)) return true;
      if (c.ville?.toLowerCase().includes(q)) return true;
      if ((c.contacts || []).some(ct =>
        [ct.nom, ct.prenom, ct.email, ct.fonction].some(v => v?.toLowerCase().includes(q))
      )) return true;
      return false;
    });
  }, [clients, query]);

  useEffect(() => { setHighlightIndex(0); }, [filtered]);

  useEffect(() => {
    if (open && listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex, open]);

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
      if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); setOpen(true); }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setHighlightIndex(prev => (prev + 1) % filtered.length); break;
      case 'ArrowUp': e.preventDefault(); setHighlightIndex(prev => (prev - 1 + filtered.length) % filtered.length); break;
      case 'Enter':
        e.preventDefault();
        if (filtered[highlightIndex]) { onSelect(filtered[highlightIndex].id); setOpen(false); setQuery(''); }
        break;
      case 'Escape': e.preventDefault(); setOpen(false); setQuery(''); break;
    }
  }

  function selectItem(clientId: string) {
    onSelect(clientId);
    setOpen(false);
    setQuery('');
  }

  const displayLabel = selected
    ? (selected.societe || selected.nom)
    : '— Sélectionner une société —';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex w-full items-center justify-between rounded border border-input bg-background px-2 py-1.5 text-sm hover:bg-accent/50 transition-colors"
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {displayLabel}
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
              placeholder="Rechercher société, contact..."
              className="flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
          <div ref={listRef} className="max-h-56 overflow-y-auto p-1">
            {filtered.map((c, i) => {
              const contacts = c.contacts || [];
              const primaryContact = contacts[0];
              return (
                <button
                  key={c.id}
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-2 rounded-sm px-2 py-2 text-sm cursor-pointer transition-colors text-left',
                    highlightIndex === i ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                  )}
                  onMouseEnter={() => setHighlightIndex(i)}
                  onClick={() => selectItem(c.id)}
                >
                  <Check className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', value === c.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{c.societe || c.nom}</p>
                    {primaryContact ? (
                      <p className="text-xs text-muted-foreground truncate">
                        {[primaryContact.prenom, primaryContact.nom].filter(Boolean).join(' ')}
                        {primaryContact.fonction && ` · ${primaryContact.fonction}`}
                        {primaryContact.email && ` · ${primaryContact.email}`}
                      </p>
                    ) : (c.email || c.ville) ? (
                      <p className="text-xs text-muted-foreground truncate">
                        {[c.email, c.ville].filter(Boolean).join(' · ')}
                      </p>
                    ) : null}
                    {contacts.length > 1 && (
                      <p className="text-xs text-muted-foreground/60">{contacts.length} contacts</p>
                    )}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">Aucune société trouvée</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
