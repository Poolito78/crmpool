import { useState, useRef, useEffect, useMemo } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Produit } from '@/lib/store';
import { chercherProduits, produitParId } from '@/lib/indexProduits';
import TruncTooltip from '@/components/TruncTooltip';

interface ProduitComboboxProps {
  produits: Produit[];
  value: string;
  onSelect: (produitId: string) => void;
  autoFocus?: boolean;
}

/**
 * Nombre de lignes réellement mises dans le DOM.
 *
 * Sans plafond, ouvrir ce sélecteur créait 22 634 boutons — le navigateur
 * mettait plusieurs secondes à les disposer, et autant à les jeter à la
 * fermeture. Personne ne fait défiler vingt-deux mille lignes : on affine sa
 * recherche. Le compteur sous la liste indique combien de résultats existent
 * au-delà, pour qu'on sache qu'il faut préciser.
 */
const MAX_AFFICHE = 60;

export default function ProduitCombobox({ produits, value, onSelect, autoFocus }: ProduitComboboxProps) {
  const [open, setOpen] = useState(!!autoFocus);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = produitParId(produits, value);

  // La liste fermée ne cherche rien : un devis de trente lignes ne doit pas
  // balayer trente fois le catalogue à chaque rendu du formulaire.
  const { resultats: filtered, total } = useMemo(
    () => (open ? chercherProduits(produits, query, MAX_AFFICHE)
                : { resultats: [] as Produit[], total: 0 }),
    [produits, query, open],
  );

  // Focus input when dropdown opens (needed on mobile where autoFocus is ignored)
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  // Reset highlight when filtered list changes — pre-select first result when searching
  useEffect(() => { setHighlightIndex(query.trim() && filtered.length > 0 ? 1 : 0); }, [filtered, query]);

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
        if (highlightIndex > 0) {
          const p = filtered[highlightIndex - 1];
          if (p) { onSelect(p.id); setOpen(false); setQuery(''); }
        } else if (query.trim() && filtered.length > 0) {
          // Aucun highlight actif mais recherche en cours → sélectionne le premier résultat
          onSelect(filtered[0].id);
          setOpen(false);
          setQuery('');
        } else {
          onSelect('');
          setOpen(false);
          setQuery('');
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
        title={selected ? `${selected.reference} — ${selected.description}` : ''}
      >
        <TruncTooltip
          content={selected ? `${selected.reference} — ${selected.description}` : ''}
          className="truncate flex-1 text-left"
          side="bottom"
        >
          <span className={cn(!selected && 'text-muted-foreground')}>
            {selected ? selected.reference : '— Libre —'}
          </span>
        </TruncTooltip>
        <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 min-w-full w-80 rounded-md border border-border bg-popover shadow-md animate-in fade-in-0 zoom-in-95">
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
                title={`${p.reference} — ${p.description}${p.categorie ? ` (${p.categorie})` : ''}`}
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

          {total > filtered.length && (
            <p className="border-t border-border px-2 py-1.5 text-center text-[11px] text-muted-foreground">
              {filtered.length} sur {total.toLocaleString('fr-FR')} — précisez la recherche
            </p>
          )}
        </div>
      )}
    </div>
  );
}
