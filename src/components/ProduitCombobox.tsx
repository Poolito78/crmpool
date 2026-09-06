import { useState, useRef, useEffect, useMemo } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Produit } from '@/lib/store';
import { chercherProduits, produitParId } from '@/lib/indexProduits';
import TruncTooltip from '@/components/TruncTooltip';
import {
  buildFunnel, parseReference, CATEGORY_LABELS,
  type SegmentCategory,
} from '@/lib/variantFunnel';

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

  /* Entonnoir de variantes : quand on choisit un modèle (IS A13A) plutôt qu'une
     référence précise, on ne sélectionne rien tout de suite — on affine par
     attributs (Dimension, Film, Dos, Profil, Face, RAL) comme le fait Odoo. */
  const [modeleFunnel, setModeleFunnel] = useState<string | null>(null);
  const [chips, setChips] = useState<Partial<Record<SegmentCategory, string>>>({});
  const enEntonnoir = modeleFunnel !== null;

  const selected = produitParId(produits, value);

  // La liste fermée ne cherche rien : un devis de trente lignes ne doit pas
  // balayer trente fois le catalogue à chaque rendu du formulaire.
  // En entonnoir non plus : la liste vient alors des variantes du modèle.
  const { resultats: filtered, total } = useMemo(
    () => (open && !enEntonnoir ? chercherProduits(produits, query, MAX_AFFICHE)
                                : { resultats: [] as Produit[], total: 0 }),
    [produits, query, open, enEntonnoir],
  );

  /* Variantes du modèle ouvert. Le catalogue entier est en mémoire, donc pas
     de requête : un simple filtre sur la clé de modèle. */
  const variantes = useMemo(
    () => (modeleFunnel ? produits.filter(p => p.modeleCle === modeleFunnel) : []),
    [produits, modeleFunnel],
  );
  const parRef = useMemo(() => {
    const m = new Map<string, Produit>();
    for (const p of variantes) m.set(p.reference, p);
    return m;
  }, [variantes]);

  const funnel = useMemo(
    () => (variantes.length
      ? buildFunnel({
          candidates: variantes.map(p => ({ reference: p.reference, description: p.description })),
          query,
          chipOverrides: chips,
        })
      : null),
    [variantes, query, chips],
  );

  /* Le module retient BRUT par défaut et retire donc le RAL des attributs à
     trancher. On recalcule les RAL réellement disponibles pour que ce choix
     par défaut reste modifiable, comme prévu par le module. */
  const ralOptions = useMemo(() => {
    if (!funnel || chips.ral) return [] as string[];
    const autres = (Object.entries(funnel.resolved) as [SegmentCategory, string][])
      .filter(([k]) => k !== 'ral');
    const set = new Set<string>();
    for (const p of variantes) {
      const pr = parseReference(p.reference);
      const ok = autres.every(([k, v]) => (pr.byCategory[k] ?? '').toUpperCase() === v.toUpperCase());
      if (ok && pr.byCategory.ral) set.add(pr.byCategory.ral);
    }
    return Array.from(set).sort();
  }, [funnel, variantes, chips.ral]);

  // Liste affichée : résultats du catalogue, ou variantes encore possibles.
  const liste = useMemo<Produit[]>(() => {
    if (!enEntonnoir) return filtered;
    if (!funnel) return [];
    return funnel.matches
      .map(r => parRef.get(r))
      .filter((p): p is Produit => !!p)
      .slice(0, MAX_AFFICHE);
  }, [enEntonnoir, funnel, parRef, filtered]);

  function quitterEntonnoir() { setModeleFunnel(null); setChips({}); }

  // Focus input when dropdown opens (needed on mobile where autoFocus is ignored)
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  // Reset highlight when filtered list changes — pre-select first result when searching
  useEffect(() => { setHighlightIndex((query.trim() || enEntonnoir) && liste.length > 0 ? 1 : 0); }, [liste, query, enEntonnoir]);

  // Refermer la liste doit aussi refermer l'entonnoir : sinon on rouvre sur les
  // variantes d'un modèle choisi la fois d'avant.
  useEffect(() => { if (!open) quitterEntonnoir(); }, [open]);

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

    const totalItems = liste.length + 1;

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
          const p = liste[highlightIndex - 1];
          if (p) activer(p);
        } else if (enEntonnoir) {
          quitterEntonnoir();
        } else if (query.trim() && liste.length > 0) {
          // Aucun highlight actif mais recherche en cours → prend le premier résultat
          activer(liste[0]);
        } else {
          onSelect('');
          setOpen(false);
          setQuery('');
        }
        break;
      case 'Escape':
        e.preventDefault();
        // Dans l'entonnoir, Échap revient au catalogue avant de tout fermer.
        if (enEntonnoir) { quitterEntonnoir(); return; }
        setOpen(false);
        setQuery('');
        break;
    }
  }

  function selectItem(produitId: string) {
    onSelect(produitId);
    setOpen(false);
    setQuery('');
    quitterEntonnoir();
  }

  /* Un modèle à plusieurs déclinaisons n'est pas un article vendable : le
     choisir ouvre l'entonnoir au lieu de poser la ligne. */
  function activer(p: Produit) {
    if (!enEntonnoir && p.modeleCle && (p.nbVariantes ?? 1) > 1 && p.estModele !== false) {
      setModeleFunnel(p.modeleCle);
      setChips({});
      setHighlightIndex(0);
      return;
    }
    selectItem(p.id);
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
              placeholder={enEntonnoir ? 'Préciser (ex : 700 c2)…' : 'Rechercher un produit...'}
              className="flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          {/* ── Entonnoir de variantes (modèle choisi) ── */}
          {enEntonnoir && funnel && (
            <div className="border-b border-border bg-muted/30 px-2 py-1.5 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold truncate flex-1" title={modeleFunnel ?? ''}>{modeleFunnel}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {funnel.matches.length} variante{funnel.matches.length > 1 ? 's' : ''}
                </span>
              </div>

              {/* Attributs déjà fixés — cliquer retire ceux choisis ici */}
              {(Object.entries(funnel.resolved) as [SegmentCategory, string][]).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(Object.entries(funnel.resolved) as [SegmentCategory, string][]).map(([cat, val]) => (
                    <button
                      key={cat}
                      type="button"
                      disabled={!chips[cat]}
                      onClick={() => setChips(c => { const n = { ...c }; delete n[cat]; return n; })}
                      title={chips[cat] ? 'Retirer ce choix' : 'Déduit de la saisie'}
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-medium border',
                        chips[cat]
                          ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                          : 'border-border bg-background text-muted-foreground cursor-default',
                      )}
                    >{CATEGORY_LABELS[cat]} : {val}{chips[cat] ? ' ×' : ''}</button>
                  ))}
                </div>
              )}

              {/* Attributs restant à trancher */}
              {funnel.pending.map(pc => (
                <div key={pc.category} className="flex flex-wrap items-center gap-1">
                  <span className="w-[68px] shrink-0 text-[10px] text-muted-foreground">{pc.label}</span>
                  {pc.options.map(o => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setChips(c => ({ ...c, [pc.category]: o }))}
                      className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] hover:border-primary hover:bg-primary/10 hover:text-primary"
                    >{o}</button>
                  ))}
                </div>
              ))}

              {/* RAL : BRUT est retenu par défaut, mais reste modifiable */}
              {ralOptions.length > 1 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="w-[68px] shrink-0 text-[10px] text-muted-foreground">{CATEGORY_LABELS.ral}</span>
                  {ralOptions.map(o => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setChips(c => ({ ...c, ral: o }))}
                      className={cn(
                        'rounded border px-1.5 py-0.5 text-[11px] hover:border-primary hover:bg-primary/10 hover:text-primary',
                        funnel.resolved.ral === o ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-background',
                      )}
                    >{o}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div ref={listRef} className="max-h-48 overflow-y-auto p-1">
            {/* Première ligne : retour au catalogue en entonnoir, sinon ligne libre */}
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer transition-colors',
                highlightIndex === 0 ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
              )}
              onMouseEnter={() => setHighlightIndex(0)}
              onClick={() => (enEntonnoir ? quitterEntonnoir() : selectItem(''))}
            >
              {enEntonnoir ? (
                <span className="text-muted-foreground">← Revenir au catalogue</span>
              ) : (
                <>
                  <Check className={cn('h-3.5 w-3.5 shrink-0', !value ? 'opacity-100' : 'opacity-0')} />
                  <span className="text-muted-foreground">— Libre —</span>
                </>
              )}
            </button>

            {liste.map((p, i) => {
              const estModeleADeclinaisons = !enEntonnoir && !!p.modeleCle && (p.nbVariantes ?? 1) > 1 && p.estModele !== false;
              return (
                <button
                  key={p.id}
                  type="button"
                  title={`${p.reference} — ${p.description}${p.categorie ? ` (${p.categorie})` : ''}${estModeleADeclinaisons ? ` — ${p.nbVariantes} déclinaisons` : ''}`}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer transition-colors',
                    highlightIndex === i + 1 ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                  )}
                  onMouseEnter={() => setHighlightIndex(i + 1)}
                  onClick={() => activer(p)}
                >
                  <Check className={cn('h-3.5 w-3.5 shrink-0', value === p.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate flex-1 text-left">
                    <span className="font-medium">{p.reference}</span>
                    <span className="text-muted-foreground"> - {p.description}</span>
                    {p.categorie && <span className="text-xs text-muted-foreground/70 ml-1">({p.categorie})</span>}
                  </span>
                  {estModeleADeclinaisons && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {p.nbVariantes} décl.
                    </span>
                  )}
                </button>
              );
            })}

            {liste.length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">
                {enEntonnoir ? 'Aucune variante avec ces critères' : 'Aucun produit trouvé'}
              </p>
            )}
          </div>

          {!enEntonnoir && total > liste.length && (
            <p className="border-t border-border px-2 py-1.5 text-center text-[11px] text-muted-foreground">
              {liste.length} sur {total.toLocaleString('fr-FR')} — précisez la recherche
            </p>
          )}
        </div>
      )}
    </div>
  );
}
