import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCRM } from '@/lib/StoreContext';
import { formatMontant, calculerFournisseurPrioritaire, useEntrepots, type Entrepot } from '@/lib/store';
import { AlertTriangle, CheckCircle, Package, Truck, Download, Star, Warehouse, Plus, Edit2, Trash2, Save, X, Building2, Clock, ChevronUp, ChevronDown, ChevronsUpDown, Search, Filter, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { exportToExcel } from '@/lib/exportExcel';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTableColumns } from '@/hooks/useTableColumns';
import ColResizeHandle from '@/components/ColResizeHandle';
import { Fragment } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────
type StockColKey = 'statut' | 'description' | 'categorie' | 'proprietaire' | 'disponibleVente' | 'stock' | 'stockMin' | 'qteReappro' | 'fournisseur' | 'valeur';
type EntrepotColKey = 'produit' | 'categorie' | 'proprietaire' | 'stockEntrepot' | 'stockTotal' | 'valeur';
type StockisteColKey = 'produit' | 'refFourn' | 'prixAchat' | 'condMin' | 'stockActuel' | 'delai';
type SortDir = 'asc' | 'desc';
type TabId = 'global' | 'entrepots' | 'stockistes';

const NON_VIDE = '!empty';

// ── Définitions de colonnes ───────────────────────────────────────────────────
const ALL_GLOBAL_COLS: { key: StockColKey; label: string; align: string }[] = [
  { key: 'statut', label: 'Statut', align: 'left' },
  { key: 'description', label: 'Produit', align: 'left' },
  { key: 'categorie', label: 'Catégorie', align: 'left' },
  { key: 'disponibleVente', label: 'Dispo vente', align: 'center' },
  { key: 'proprietaire', label: 'Propriétaire', align: 'left' },
  { key: 'stock', label: 'Stock', align: 'right' },
  { key: 'stockMin', label: 'Min.', align: 'right' },
  { key: 'qteReappro', label: 'Réappro', align: 'right' },
  { key: 'fournisseur', label: 'Fourn. optimal', align: 'left' },
  { key: 'valeur', label: 'Valeur', align: 'right' },
];

const ALL_ENTREPOT_COLS: { key: EntrepotColKey; label: string; align: string }[] = [
  { key: 'produit', label: 'Produit', align: 'left' },
  { key: 'categorie', label: 'Catégorie', align: 'left' },
  { key: 'proprietaire', label: 'Propriétaire', align: 'left' },
  { key: 'stockEntrepot', label: 'Stock entrepôt', align: 'right' },
  { key: 'stockTotal', label: 'Stock total', align: 'right' },
  { key: 'valeur', label: 'Valeur', align: 'right' },
];

const ALL_STOCKISTE_COLS: { key: StockisteColKey; label: string; align: string }[] = [
  { key: 'produit', label: 'Produit', align: 'left' },
  { key: 'refFourn', label: 'Réf. fourn.', align: 'left' },
  { key: 'prixAchat', label: 'Prix achat', align: 'right' },
  { key: 'condMin', label: 'Cond. min.', align: 'right' },
  { key: 'stockActuel', label: 'Stock actuel', align: 'right' },
  { key: 'delai', label: 'Délai livr.', align: 'center' },
];

// ── FilterCell ────────────────────────────────────────────────────────────────
function FilterCell({ value, onChange, align = 'left' }: { value: string; onChange: (v: string) => void; align?: 'left' | 'right' | 'center' }) {
  if (value === NON_VIDE) {
    return (
      <button onClick={() => onChange('')} className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full whitespace-nowrap">
        ≠ vide <X className="w-3 h-3" />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-0.5">
      <input
        type="text"
        placeholder="Filtrer..."
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn('h-6 text-xs flex-1 min-w-0 rounded border border-input bg-background px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring', align === 'right' && 'text-right')}
      />
      <button onClick={() => onChange(NON_VIDE)} title="Non vide" className="shrink-0 text-xs text-muted-foreground hover:text-primary px-0.5 py-0.5 rounded leading-none">≠∅</button>
    </div>
  );
}

// ── ColDropdown ───────────────────────────────────────────────────────────────
function ColDropdown({ cols, visible, onToggle, onClose }: {
  cols: { key: string; label: string }[];
  visible: Set<string>;
  onToggle: (k: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-30 bg-card border border-border rounded-xl shadow-lg py-1 min-w-44">
      {cols.map(c => (
        <label key={c.key} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm select-none">
          <input type="checkbox" checked={visible.has(c.key)} onChange={() => onToggle(c.key)} className="rounded accent-primary w-3.5 h-3.5" />
          {c.label}
        </label>
      ))}
    </div>
  );
}

// ── Helpers partagés ──────────────────────────────────────────────────────────
function applyFilter(val: string, test: (nonVide: boolean, v: string) => boolean): boolean {
  if (!val) return true;
  return test(val === NON_VIDE, val.toLowerCase());
}

export default function Stock() {
  const navigate = useNavigate();
  const { produits, fournisseurs, produitFournisseurs, updateProduits } = useCRM();
  const { entrepots, stockEntrepots, loading: loadingE, addEntrepot, updateEntrepot, deleteEntrepot, upsertStock } = useEntrepots();

  const [tab, setTab] = useState<TabId>('global');

  // ── Global : état sort / filtre / colonnes ──────────────────────────────────
  const [globalSearch, setGlobalSearch] = useState('');
  const [openFilterCols, setOpenFilterCols] = useState<Set<StockColKey>>(new Set());
  const [colFilters, setColFilters] = useState<Partial<Record<StockColKey, string>>>({});
  const [sortCol, setSortCol] = useState<StockColKey | null>('statut');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [visGlobal, setVisGlobal] = useState<Set<StockColKey>>(() => new Set(ALL_GLOBAL_COLS.map(c => c.key)));
  const gCols = useTableColumns<StockColKey>('stock_global', ALL_GLOBAL_COLS.map(c => c.key));
  const [colMenuGlobal, setColMenuGlobal] = useState(false);

  function handleSort(col: StockColKey) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc'); }
  }
  function toggleFilterCol(col: StockColKey) {
    setOpenFilterCols(prev => { const n = new Set(prev); n.has(col) ? n.delete(col) : n.add(col); return n; });
  }
  function setFilter(col: StockColKey, val: string) { setColFilters(prev => ({ ...prev, [col]: val })); }
  function hasActiveFilters() { return globalSearch.trim() !== '' || Object.values(colFilters).some(v => v); }
  function toggleVisGlobal(k: string) { setVisGlobal(prev => { const n = new Set(prev); n.has(k as StockColKey) ? n.delete(k as StockColKey) : n.add(k as StockColKey); return n; }); }

  // ── Entrepôt : état sort / filtre / colonnes ────────────────────────────────
  const [searchE, setSearchE] = useState('');
  const [sortColE, setSortColE] = useState<EntrepotColKey | null>(null);
  const [sortDirE, setSortDirE] = useState<SortDir>('asc');
  const [openFilterColsE, setOpenFilterColsE] = useState<Set<EntrepotColKey>>(new Set());
  const [colFiltersE, setColFiltersE] = useState<Partial<Record<EntrepotColKey, string>>>({});
  const [visE, setVisE] = useState<Set<EntrepotColKey>>(() => new Set(ALL_ENTREPOT_COLS.map(c => c.key)));
  const eCols = useTableColumns<EntrepotColKey>('stock_entrepot_cols', ALL_ENTREPOT_COLS.map(c => c.key));
  const [colMenuE, setColMenuE] = useState(false);

  function handleSortE(col: EntrepotColKey) {
    if (sortColE === col) setSortDirE(d => d === 'asc' ? 'desc' : 'asc'); else { setSortColE(col); setSortDirE('asc'); }
  }
  function toggleFilterColE(col: EntrepotColKey) {
    setOpenFilterColsE(prev => { const n = new Set(prev); n.has(col) ? n.delete(col) : n.add(col); return n; });
  }
  function setFilterE(col: EntrepotColKey, val: string) { setColFiltersE(prev => ({ ...prev, [col]: val })); }
  function hasActiveFiltersE() { return searchE.trim() !== '' || Object.values(colFiltersE).some(v => v); }
  function toggleVisE(k: string) { setVisE(prev => { const n = new Set(prev); n.has(k as EntrepotColKey) ? n.delete(k as EntrepotColKey) : n.add(k as EntrepotColKey); return n; }); }

  // ── Stockistes : état sort / filtre / colonnes ──────────────────────────────
  const [searchSt, setSearchSt] = useState('');
  const [sortColSt, setSortColSt] = useState<StockisteColKey | null>(null);
  const [sortDirSt, setSortDirSt] = useState<SortDir>('asc');
  const [openFilterColsSt, setOpenFilterColsSt] = useState<Set<StockisteColKey>>(new Set());
  const [colFiltersSt, setColFiltersSt] = useState<Partial<Record<StockisteColKey, string>>>({});
  const [visSt, setVisSt] = useState<Set<StockisteColKey>>(() => new Set(ALL_STOCKISTE_COLS.map(c => c.key)));
  const stCols = useTableColumns<StockisteColKey>('stock_stockistes', ALL_STOCKISTE_COLS.map(c => c.key));
  const [colMenuSt, setColMenuSt] = useState(false);

  function handleSortSt(col: StockisteColKey) {
    if (sortColSt === col) setSortDirSt(d => d === 'asc' ? 'desc' : 'asc'); else { setSortColSt(col); setSortDirSt('asc'); }
  }
  function toggleFilterColSt(col: StockisteColKey) {
    setOpenFilterColsSt(prev => { const n = new Set(prev); n.has(col) ? n.delete(col) : n.add(col); return n; });
  }
  function setFilterSt(col: StockisteColKey, val: string) { setColFiltersSt(prev => ({ ...prev, [col]: val })); }
  function hasActiveFiltersSt() { return searchSt.trim() !== '' || Object.values(colFiltersSt).some(v => v); }
  function toggleVisSt(k: string) { setVisSt(prev => { const n = new Set(prev); n.has(k as StockisteColKey) ? n.delete(k as StockisteColKey) : n.add(k as StockisteColKey); return n; }); }

  // ── Entrepôts dialog ────────────────────────────────────────────────────────
  const [entrepotDialogOpen, setEntrepotDialogOpen] = useState(false);
  const [editingEntrepot, setEditingEntrepot] = useState<Entrepot | null>(null);
  const [entrepotForm, setEntrepotForm] = useState({ nom: '', adresse: '', ville: '', codePostal: '', notes: '', estDefaut: false });
  const [editingStock, setEditingStock] = useState<{ produitId: string; entrepotId: string; value: string } | null>(null);
  const [selectedEntrepotId, setSelectedEntrepotId] = useState<string | null>(null);

  // ── Calculs globaux ──────────────────────────────────────────────────────────
  const totalStock = produits.reduce((s, p) => s + p.stock, 0);
  const totalValeur = produits.reduce((s, p) => s + p.stock * p.prixHT, 0);
  const alertes = produits.filter(p => p.stock < p.stockMin).length;

  function getBestSupplierInfo(p: typeof produits[0]) {
    const qte = Math.max(1, p.stockMin - p.stock);
    const pfs = produitFournisseurs.filter(pf => pf.produitId === p.id);
    if (pfs.length === 0) {
      const fourn = fournisseurs.find(f => f.id === p.fournisseurId);
      return fourn ? { fourn, prixAchat: p.prixAchat, qte, totalAchat: p.prixAchat * qte, transport: 0, coutGlobal: p.prixAchat * qte, isMulti: false } : null;
    }
    const best = calculerFournisseurPrioritaire(p.id, qte, produitFournisseurs, fournisseurs);
    if (!best) return null;
    const fourn = fournisseurs.find(f => f.id === best.fournisseurId);
    if (!fourn) return null;
    const realQte = Math.max(qte, best.conditionnementMin);
    const totalAchat = best.prixAchat * realQte;
    const transport = totalAchat >= fourn.francoPort ? 0 : fourn.coutTransport;
    return { fourn, prixAchat: best.prixAchat, qte: realQte, totalAchat, transport, coutGlobal: totalAchat + transport, isMulti: pfs.length > 1, nbFournisseurs: pfs.length };
  }

  const produitsEnAlerte = produits.filter(p => p.stock < p.stockMin);
  const reapproParFournisseur = new Map<string, { fourn: typeof fournisseurs[0]; produits: { produit: typeof produits[0]; info: NonNullable<ReturnType<typeof getBestSupplierInfo>> }[] }>();
  for (const p of produitsEnAlerte) {
    const info = getBestSupplierInfo(p);
    if (!info) continue;
    const fId = info.fourn.id;
    if (!reapproParFournisseur.has(fId)) reapproParFournisseur.set(fId, { fourn: info.fourn, produits: [] });
    reapproParFournisseur.get(fId)!.produits.push({ produit: p, info });
  }

  const stockistes = useMemo(() => fournisseurs.filter(f => f.estStockiste), [fournisseurs]);
  const produitsParStockiste = useMemo(() => {
    const map = new Map<string, { produit: typeof produits[0]; pf: typeof produitFournisseurs[0] }[]>();
    for (const f of stockistes) {
      const linked = produitFournisseurs
        .filter(pf => pf.fournisseurId === f.id)
        .map(pf => ({ produit: produits.find(p => p.id === pf.produitId)!, pf }))
        .filter(x => x.produit)
        .sort((a, b) => a.produit.description.localeCompare(b.produit.description));
      map.set(f.id, linked);
    }
    return map;
  }, [stockistes, produitFournisseurs, produits]);

  // ── Gestion entrepôts ────────────────────────────────────────────────────────
  function openNewEntrepot() { setEditingEntrepot(null); setEntrepotForm({ nom: '', adresse: '', ville: '', codePostal: '', notes: '', estDefaut: false }); setEntrepotDialogOpen(true); }
  function openEditEntrepot(e: Entrepot) { setEditingEntrepot(e); setEntrepotForm({ nom: e.nom, adresse: e.adresse || '', ville: e.ville || '', codePostal: e.codePostal || '', notes: e.notes || '', estDefaut: e.estDefaut }); setEntrepotDialogOpen(true); }
  async function saveEntrepot() {
    if (!entrepotForm.nom.trim()) { toast.error('Nom requis'); return; }
    if (editingEntrepot) {
      const err = await updateEntrepot({ ...editingEntrepot, ...entrepotForm, adresse: entrepotForm.adresse || undefined, ville: entrepotForm.ville || undefined, codePostal: entrepotForm.codePostal || undefined, notes: entrepotForm.notes || undefined });
      if (err) { toast.error('Erreur : ' + err.message); return; }
      toast.success('Entrepôt modifié');
    } else {
      const res = await addEntrepot({ ...entrepotForm, adresse: entrepotForm.adresse || undefined, ville: entrepotForm.ville || undefined, codePostal: entrepotForm.codePostal || undefined, notes: entrepotForm.notes || undefined });
      if (!res) { toast.error('Erreur lors de la création'); return; }
      toast.success('Entrepôt créé');
      if (!selectedEntrepotId) setSelectedEntrepotId(res.id);
    }
    setEntrepotDialogOpen(false);
  }
  async function handleDeleteEntrepot(id: string) {
    const err = await deleteEntrepot(id);
    if (err) { toast.error('Erreur : ' + err.message); return; }
    toast.success('Entrepôt supprimé');
    if (selectedEntrepotId === id) setSelectedEntrepotId(entrepots.find(e => e.id !== id)?.id ?? null);
  }
  const activeEntrepot = entrepots.find(e => e.id === selectedEntrepotId) ?? entrepots[0];
  function getStockInEntrepot(produitId: string, entrepotId: string) { return stockEntrepots.find(s => s.produitId === produitId && s.entrepotId === entrepotId)?.stock ?? 0; }
  async function commitStockEdit() {
    if (!editingStock) return;
    const val = parseInt(editingStock.value);
    if (isNaN(val) || val < 0) { toast.error('Valeur invalide'); return; }
    const err = await upsertStock(editingStock.produitId, editingStock.entrepotId, val);
    if (err) { toast.error('Erreur : ' + err.message); return; }
    // Sync stock total produit = somme de tous les entrepôts
    const newTotal = stockEntrepots
      .filter(s => s.produitId === editingStock.produitId && s.entrepotId !== editingStock.entrepotId)
      .reduce((a, s) => a + s.stock, 0) + val;
    updateProduits(prev => prev.map(p => p.id === editingStock.produitId ? { ...p, stock: newTotal } : p));
    setEditingStock(null);
  }
  function getTotauxEntrepot(entrepotId: string) {
    const stocks = stockEntrepots.filter(s => s.entrepotId === entrepotId);
    const total = stocks.reduce((s, se) => s + se.stock, 0);
    const valeur = stocks.reduce((s, se) => { const p = produits.find(p => p.id === se.produitId); return s + (p ? se.stock * p.prixHT : 0); }, 0);
    return { total, valeur };
  }

  const TABS: { id: TabId; label: string; icon: typeof Package }[] = [
    { id: 'global', label: 'Stock global', icon: Package },
    { id: 'entrepots', label: 'Par entrepôt', icon: Warehouse },
    { id: 'stockistes', label: 'Fournisseurs stockistes', icon: Building2 },
  ];

  return (
    <div className="space-y-6">
      {/* Onglets */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all', tab === t.id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            <t.icon className="w-4 h-4 shrink-0" /><span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ══ Tab : Stock global ══════════════════════════════════════════════ */}
      {tab === 'global' && (() => {
        const enriched = produits.map(p => {
          const info = getBestSupplierInfo(p);
          const low = p.stock < p.stockMin;
          const qteReappro = low ? Math.max(0, p.stockMin - p.stock) : 0;
          const proprioFourn = p.proprietaire === 'fournisseur' && p.proprietaireFournisseurId ? fournisseurs.find(f => f.id === p.proprietaireFournisseurId) : null;
          return { p, info, low, qteReappro, proprioFourn };
        });

        const filtered = enriched.filter(({ p, info, low, proprioFourn }) => {
          if (globalSearch) { const s = globalSearch.toLowerCase(); if (![p.description, p.reference, p.categorie, info?.fourn.societe].some(x => x?.toLowerCase().includes(s))) return false; }
          if (!applyFilter(colFilters.statut || '', (nv, v) => nv ? low : (low ? 'alerte' : 'ok').includes(v))) return false;
          if (!applyFilter(colFilters.description || '', (nv, v) => nv ? !!p.description?.trim() : !!(p.description?.toLowerCase().includes(v) || p.reference?.toLowerCase().includes(v)))) return false;
          if (!applyFilter(colFilters.categorie || '', (nv, v) => nv ? !!p.categorie?.trim() : (p.categorie || '').toLowerCase().includes(v))) return false;
          if (!applyFilter(colFilters.proprietaire || '', (nv, v) => nv ? true : (p.proprietaire === 'fournisseur' ? (proprioFourn?.societe || 'fournisseur') : 'isosign').toLowerCase().includes(v))) return false;
          if (!applyFilter(colFilters.disponibleVente || '', (nv, v) => nv ? p.disponibleVente !== false : (p.disponibleVente !== false ? 'oui' : 'non').includes(v))) return false;
          if (!applyFilter(colFilters.stock || '', (nv, v) => nv ? p.stock > 0 : String(p.stock).includes(v))) return false;
          if (!applyFilter(colFilters.stockMin || '', (nv, v) => nv ? p.stockMin > 0 : String(p.stockMin).includes(v))) return false;
          if (!applyFilter(colFilters.fournisseur || '', (nv, v) => nv ? !!info : (info?.fourn.societe || '').toLowerCase().includes(v))) return false;
          if (!applyFilter(colFilters.valeur || '', (nv, v) => nv ? p.stock * p.prixHT > 0 : formatMontant(p.stock * p.prixHT).includes(v))) return false;
          return true;
        });

        const sortedFiltered = [...filtered].sort((a, b) => {
          const dir = sortDir === 'asc' ? 1 : -1;
          switch (sortCol) {
            case 'statut': return dir * ((a.low ? 0 : 1) - (b.low ? 0 : 1));
            case 'description': return dir * a.p.description.localeCompare(b.p.description);
            case 'categorie': return dir * (a.p.categorie || '').localeCompare(b.p.categorie || '');
            case 'proprietaire': return dir * (a.p.proprietaire || 'isosign').localeCompare(b.p.proprietaire || 'isosign');
            case 'disponibleVente': return dir * ((a.p.disponibleVente !== false ? 1 : 0) - (b.p.disponibleVente !== false ? 1 : 0));
            case 'stock': return dir * (a.p.stock - b.p.stock);
            case 'stockMin': return dir * (a.p.stockMin - b.p.stockMin);
            case 'qteReappro': return dir * (a.qteReappro - b.qteReappro);
            case 'fournisseur': return dir * (a.info?.fourn.societe || '').localeCompare(b.info?.fourn.societe || '');
            case 'valeur': return dir * (a.p.stock * a.p.prixHT - b.p.stock * b.p.prixHT);
            default: return 0;
          }
        });

        function SortTh({ col, label, align = 'left' }: { col: StockColKey; label: string; align?: string; className?: string }) {
          const isSorted = sortCol === col;
          const SI = isSorted ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
          const hasFilter = !!(colFilters[col]);
          const isOpen = openFilterCols.has(col);
          const isDragOver = gCols.dragOverKey === col && gCols.dragKey !== col;
          return (
            <th {...gCols.thProps(col)} style={gCols.widthStyle(col)} className={cn('relative px-3 py-2 font-medium text-muted-foreground select-none whitespace-nowrap cursor-grab active:cursor-grabbing', gCols.dragKey === col ? 'opacity-40' : '', isDragOver ? 'bg-primary/10' : '')}>
              {isDragOver && <span className="absolute top-0 left-0 h-full w-0.5 bg-primary z-20" />}
              <div className={cn('flex items-center gap-0.5', align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : '', gCols.widthStyle(col) ? 'overflow-hidden' : '')}>
                <button onClick={() => handleSort(col)} className="flex items-center gap-1 hover:text-foreground cursor-pointer min-w-0">
                  {align === 'right' && <SI className={cn('w-3 h-3 shrink-0', isSorted ? 'text-primary' : 'opacity-40')} />}
                  <span className="truncate">{label}</span>
                  {align !== 'right' && <SI className={cn('w-3 h-3 shrink-0', isSorted ? 'text-primary' : 'opacity-40')} />}
                </button>
                <button onClick={() => toggleFilterCol(col)} className={cn('p-0.5 rounded hover:bg-muted/80 transition-colors shrink-0', hasFilter ? 'text-primary' : isOpen ? 'text-muted-foreground/60' : 'text-muted-foreground/25 hover:text-muted-foreground/60')}>
                  <Filter className="w-3 h-3" />
                </button>
              </div>
              <ColResizeHandle {...gCols.resizeHandleProps(col)} />
            </th>
          );
        }

        const vg = visGlobal;
        const GLOBAL_LABELS: Record<StockColKey, { label: string; align?: string }> = {
          statut: { label: 'Statut' }, description: { label: 'Produit' }, categorie: { label: 'Catégorie' },
          disponibleVente: { label: 'Dispo vente', align: 'center' }, proprietaire: { label: 'Propriétaire' },
          stock: { label: 'Stock', align: 'right' }, stockMin: { label: 'Min.', align: 'right' },
          qteReappro: { label: 'Réappro', align: 'right' }, fournisseur: { label: 'Fourn. optimal' }, valeur: { label: 'Valeur', align: 'right' },
        };
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="stat-card text-center"><Package className="w-5 h-5 mx-auto text-primary mb-1" /><p className="text-2xl font-heading font-bold">{totalStock}</p><p className="text-xs text-muted-foreground">Unités totales</p></div>
              <div className="stat-card text-center"><p className="text-2xl font-heading font-bold">{formatMontant(totalValeur)}</p><p className="text-xs text-muted-foreground">Valeur stock HT</p></div>
              <div className="stat-card text-center"><AlertTriangle className={`w-5 h-5 mx-auto mb-1 ${alertes > 0 ? 'text-warning' : 'text-success'}`} /><p className="text-2xl font-heading font-bold">{alertes}</p><p className="text-xs text-muted-foreground">Alertes</p></div>
            </div>

            {reapproParFournisseur.size > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Truck className="w-4 h-4" /> Réappro optimale par fournisseur</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[...reapproParFournisseur.entries()].map(([fId, group]) => {
                    const totalReappro = group.produits.reduce((s, { info }) => s + info.totalAchat, 0);
                    const francoAtteint = totalReappro >= group.fourn.francoPort;
                    const manque = Math.max(0, group.fourn.francoPort - totalReappro);
                    return (
                      <div key={fId} className="bg-card rounded-xl border border-border p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm flex items-center gap-1"><Star className="w-3.5 h-3.5 text-primary" /> {group.fourn.societe}</p>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${francoAtteint ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{francoAtteint ? 'Franco atteint' : 'Franco non atteint'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          <span className="text-muted-foreground">Franco de port :</span><span className="text-right font-medium">{formatMontant(group.fourn.francoPort)}</span>
                          <span className="text-muted-foreground">Total réappro :</span><span className="text-right font-medium">{formatMontant(totalReappro)}</span>
                          {!francoAtteint && (<><span className="text-muted-foreground">Reste pour franco :</span><span className="text-right font-medium text-warning">{formatMontant(manque)}</span></>)}
                          <span className="text-muted-foreground">Coût transport :</span><span className="text-right font-medium">{francoAtteint ? <span className="text-success">Gratuit</span> : formatMontant(group.fourn.coutTransport)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{group.produits.length} produit{group.produits.length > 1 ? 's' : ''} : <span className="ml-1">{group.produits.map(({ produit, info }) => `${produit.description} (${info.qte} ${produit.unite} à ${formatMontant(info.prixAchat)})`).join(', ')}</span></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Rechercher produit..." value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} className="pl-9 h-9" />
              </div>
              <div className="flex gap-2 shrink-0 items-center">
                {hasActiveFilters() && (
                  <Button variant="ghost" size="sm" onClick={() => { setColFilters({}); setGlobalSearch(''); setOpenFilterCols(new Set()); }}>
                    <X className="w-4 h-4 mr-1" /> Effacer
                  </Button>
                )}
                <div className="relative">
                  <Button variant="outline" size="sm" onClick={() => setColMenuGlobal(o => !o)}>
                    <SlidersHorizontal className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">Colonnes</span>
                    {visGlobal.size < ALL_GLOBAL_COLS.length && <span className="ml-1 text-xs bg-primary text-primary-foreground rounded-full px-1.5">{visGlobal.size}</span>}
                  </Button>
                  {colMenuGlobal && <ColDropdown cols={ALL_GLOBAL_COLS} visible={visGlobal as Set<string>} onToggle={toggleVisGlobal} onClose={() => setColMenuGlobal(false)} />}
                </div>
                <Button variant="outline" size="sm" onClick={() => exportToExcel(sortedFiltered.map(({ p, info, proprioFourn }) => ({ Référence: p.reference, Description: p.description, Stock: p.stock, 'Stock Min': p.stockMin, Alerte: p.stock < p.stockMin ? 'Oui' : 'Non', 'Dispo vente': p.disponibleVente !== false ? 'Oui' : 'Non', 'Prix HT': p.prixHT, 'Valeur Stock': p.stock * p.prixHT, Catégorie: p.categorie || '', Propriétaire: p.proprietaire === 'fournisseur' ? (proprioFourn?.societe || 'Fournisseur') : 'ISOSIGN', 'Fournisseur optimal': info?.fourn.societe || '', 'Prix achat': info?.prixAchat || '' })), 'stock', 'Stock')}>
                  <Download className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">Exporter</span>
                </Button>
              </div>
            </div>

            {/* Tableau */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {gCols.ordered(ALL_GLOBAL_COLS, k => vg.has(k)).map(col => <SortTh key={col.key} col={col.key} label={GLOBAL_LABELS[col.key].label} align={GLOBAL_LABELS[col.key].align} />)}
                    </tr>
                    {openFilterCols.size > 0 && (
                      <tr className="border-b border-border bg-muted/20">
                        {gCols.ordered(ALL_GLOBAL_COLS, k => vg.has(k)).map(col => (
                          <td key={col.key} style={gCols.widthStyle(col.key)} className="px-3 py-1">
                            {openFilterCols.has(col.key) && <FilterCell value={colFilters[col.key] || ''} onChange={v => setFilter(col.key, v)} align={GLOBAL_LABELS[col.key].align === 'right' ? 'right' : GLOBAL_LABELS[col.key].align === 'center' ? 'center' : 'left'} />}
                          </td>
                        ))}
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {sortedFiltered.map(({ p, info, low, qteReappro, proprioFourn }) => {
                      const renderG = (key: StockColKey) => {
                        const ws = gCols.widthStyle(key);
                        switch (key) {
                          case 'statut': return <td style={ws} className="px-3 py-3">{low ? <AlertTriangle className="w-4 h-4 text-warning" /> : <CheckCircle className="w-4 h-4 text-success" />}</td>;
                          case 'description': return <td style={ws} className={`px-3 py-3${ws ? ' truncate' : ''}`}><p className="font-medium truncate">{p.description}</p><p className="text-xs text-muted-foreground font-mono truncate">{p.reference}</p></td>;
                          case 'categorie': return <td style={ws} className={`px-3 py-3 text-muted-foreground${ws ? ' truncate' : ''}`}>{p.categorie || '—'}</td>;
                          case 'disponibleVente': return <td style={ws} className="px-3 py-3 text-center">{p.disponibleVente !== false ? <span title="Disponible à la vente" className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-success/15 text-success text-xs font-bold">✓</span> : <span title="Non disponible" className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs">✕</span>}</td>;
                          case 'proprietaire': return <td style={ws} className="px-3 py-3">{p.proprietaire === 'fournisseur' ? <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full"><Truck className="w-3 h-3" />{proprioFourn?.societe || 'Fournisseur'}</span> : <span className="text-xs text-muted-foreground">ISOSIGN</span>}</td>;
                          case 'stock': return <td style={ws} className={`px-3 py-3 text-right font-semibold ${low ? 'text-warning' : ''}`}>{p.stock} {p.unite}</td>;
                          case 'stockMin': return <td style={ws} className="px-3 py-3 text-right text-muted-foreground">{p.stockMin}</td>;
                          case 'qteReappro': return <td style={ws} className="px-3 py-3 text-right">{low ? <span className="text-warning font-medium">{qteReappro} {p.unite} <span className="text-xs text-muted-foreground">({formatMontant(qteReappro * (info?.prixAchat || p.prixAchat))})</span></span> : <span className="text-muted-foreground">—</span>}</td>;
                          case 'fournisseur': return <td style={ws} className={`px-3 py-3 text-muted-foreground${ws ? ' truncate' : ''}`}>{info ? <div className={ws ? 'truncate' : ''}><span className="flex items-center gap-1">{info.isMulti && <Star className="w-3 h-3 text-primary" />}{info.fourn.societe}</span><span className="block text-xs">{formatMontant(info.prixAchat)}/{p.unite}{info.fourn.francoPort > 0 && ` · Franco ${formatMontant(info.fourn.francoPort)}`}</span>{info.isMulti && <span className="text-xs text-primary">{info.nbFournisseurs} fournisseurs</span>}</div> : '—'}</td>;
                          case 'valeur': return <td style={ws} className="px-3 py-3 text-right">{formatMontant(p.stock * p.prixHT)}</td>;
                          default: return <td style={ws} className="px-3 py-3" />;
                        }
                      };
                      return (
                        <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/produits?highlight=${p.id}`)} title="Ouvrir la fiche produit">
                          {gCols.ordered(ALL_GLOBAL_COLS, k => vg.has(k)).map(col => <Fragment key={col.key}>{renderG(col.key)}</Fragment>)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {sortedFiltered.length === 0 && <p className="text-center py-8 text-muted-foreground text-sm">{hasActiveFilters() ? 'Aucun produit ne correspond aux filtres' : 'Aucun produit en stock'}</p>}
              {sortedFiltered.length > 0 && sortedFiltered.length < produits.length && <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border">{sortedFiltered.length} / {produits.length} produit{produits.length > 1 ? 's' : ''}</p>}
            </div>
          </div>
        );
      })()}

      {/* ══ Tab : Par entrepôt ══════════════════════════════════════════════ */}
      {tab === 'entrepots' && (() => {
        // ── SortThE ──────────────────────────────────────────────────────────
        function SortThE({ col, label, align = 'left' }: { col: EntrepotColKey; label: string; align?: string }) {
          const isSorted = sortColE === col;
          const SI = isSorted ? (sortDirE === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
          const hasFilter = !!(colFiltersE[col]);
          const isOpen = openFilterColsE.has(col);
          const isDragOver = eCols.dragOverKey === col && eCols.dragKey !== col;
          return (
            <th {...eCols.thProps(col)} style={eCols.widthStyle(col)} className={cn('relative px-4 py-2.5 font-medium text-muted-foreground select-none whitespace-nowrap cursor-grab active:cursor-grabbing', eCols.dragKey === col ? 'opacity-40' : '', isDragOver ? 'bg-primary/10' : '')}>
              {isDragOver && <span className="absolute top-0 left-0 h-full w-0.5 bg-primary z-20" />}
              <div className={cn('flex items-center gap-0.5', align === 'right' ? 'justify-end' : '', eCols.widthStyle(col) ? 'overflow-hidden' : '')}>
                <button onClick={() => handleSortE(col)} className="flex items-center gap-1 hover:text-foreground cursor-pointer min-w-0">
                  {align === 'right' && <SI className={cn('w-3 h-3 shrink-0', isSorted ? 'text-primary' : 'opacity-40')} />}
                  <span className="truncate">{label}</span>
                  {align !== 'right' && <SI className={cn('w-3 h-3 shrink-0', isSorted ? 'text-primary' : 'opacity-40')} />}
                </button>
                <button onClick={() => toggleFilterColE(col)} className={cn('p-0.5 rounded hover:bg-muted/80 transition-colors shrink-0', hasFilter ? 'text-primary' : isOpen ? 'text-muted-foreground/60' : 'text-muted-foreground/25 hover:text-muted-foreground/60')}>
                  <Filter className="w-3 h-3" />
                </button>
              </div>
              <ColResizeHandle {...eCols.resizeHandleProps(col)} />
            </th>
          );
        }
        const ENT_LABELS: Record<EntrepotColKey, { label: string; align?: string }> = {
          produit: { label: 'Produit' }, categorie: { label: 'Catégorie' }, proprietaire: { label: 'Propriétaire' },
          stockEntrepot: { label: 'Stock entrepôt', align: 'right' }, stockTotal: { label: 'Stock total', align: 'right' }, valeur: { label: 'Valeur', align: 'right' },
        };

        // ── Données filtrées/triées ──────────────────────────────────────────
        const baseList = [...produits].sort((a, b) => { const aLow = a.stock < a.stockMin ? 0 : 1; const bLow = b.stock < b.stockMin ? 0 : 1; return aLow - bLow || a.description.localeCompare(b.description); });
        const eid = activeEntrepot?.id || '';
        const filtered = baseList.filter(p => {
          const stockIci = getStockInEntrepot(p.id, eid);
          const proprioFourn = p.proprietaire === 'fournisseur' && p.proprietaireFournisseurId ? fournisseurs.find(f => f.id === p.proprietaireFournisseurId) : null;
          if (searchE) { const s = searchE.toLowerCase(); if (![p.description, p.reference, p.categorie].some(x => x?.toLowerCase().includes(s))) return false; }
          if (!applyFilter(colFiltersE.produit || '', (nv, v) => nv ? !!p.description?.trim() : !!(p.description?.toLowerCase().includes(v) || p.reference?.toLowerCase().includes(v)))) return false;
          if (!applyFilter(colFiltersE.categorie || '', (nv, v) => nv ? !!p.categorie?.trim() : (p.categorie || '').toLowerCase().includes(v))) return false;
          if (!applyFilter(colFiltersE.proprietaire || '', (nv, v) => nv ? true : (p.proprietaire === 'fournisseur' ? (proprioFourn?.societe || 'fournisseur') : 'isosign').toLowerCase().includes(v))) return false;
          if (!applyFilter(colFiltersE.stockEntrepot || '', (nv, v) => nv ? stockIci > 0 : String(stockIci).includes(v))) return false;
          if (!applyFilter(colFiltersE.stockTotal || '', (nv, v) => nv ? p.stock > 0 : String(p.stock).includes(v))) return false;
          if (!applyFilter(colFiltersE.valeur || '', (nv, v) => nv ? stockIci * p.prixHT > 0 : formatMontant(stockIci * p.prixHT).includes(v))) return false;
          return true;
        });
        const sortedE = [...filtered].sort((a, b) => {
          const dir = sortDirE === 'asc' ? 1 : -1;
          const sA = getStockInEntrepot(a.id, eid); const sB = getStockInEntrepot(b.id, eid);
          switch (sortColE) {
            case 'produit': return dir * a.description.localeCompare(b.description);
            case 'categorie': return dir * (a.categorie || '').localeCompare(b.categorie || '');
            case 'proprietaire': return dir * (a.proprietaire || 'isosign').localeCompare(b.proprietaire || 'isosign');
            case 'stockEntrepot': return dir * (sA - sB);
            case 'stockTotal': return dir * (a.stock - b.stock);
            case 'valeur': return dir * (sA * a.prixHT - sB * b.prixHT);
            default: return 0;
          }
        });
        const ve = visE;

        return (
          <div className="space-y-4">
            {loadingE ? (
              <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>
            ) : (
              <>
                {/* Sélection entrepôt */}
                <div className="flex flex-wrap gap-2 items-center">
                  {entrepots.map(e => {
                    const { total, valeur } = getTotauxEntrepot(e.id);
                    const isActive = (selectedEntrepotId || entrepots[0]?.id) === e.id;
                    return (
                      <div key={e.id} onClick={() => setSelectedEntrepotId(e.id)} className={cn('group relative flex items-start gap-3 px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer', isActive ? 'border-primary bg-primary/5 text-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/50')}>
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-sm flex items-center gap-1.5"><Warehouse className="w-3.5 h-3.5 shrink-0" />{e.nom}{e.estDefaut && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Défaut</span>}</span>
                          <span className="text-xs mt-0.5 opacity-70 block">{total} unités · {formatMontant(valeur)}</span>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5" onClick={ev => ev.stopPropagation()}>
                          <button onClick={() => openEditEntrepot(e)} title="Modifier" className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Edit2 className="w-3 h-3" /></button>
                          <button onClick={() => handleDeleteEntrepot(e.id)} title="Supprimer" className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                    );
                  })}
                  <Button variant="outline" size="sm" onClick={openNewEntrepot}><Plus className="w-4 h-4 mr-1.5" /> Nouvel entrepôt</Button>
                </div>

                {entrepots.length === 0 && (
                  <div className="bg-card rounded-xl border border-dashed border-border p-10 text-center">
                    <Warehouse className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">Aucun entrepôt configuré</p>
                    <Button className="mt-4" onClick={openNewEntrepot}><Plus className="w-4 h-4 mr-2" /> Créer le premier entrepôt</Button>
                  </div>
                )}

                {activeEntrepot && (
                  <div className="bg-card rounded-xl border border-border overflow-hidden">
                    {/* Header entrepôt */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                      <div>
                        <p className="font-semibold text-sm flex items-center gap-2"><Warehouse className="w-4 h-4 text-primary" />{activeEntrepot.nom}</p>
                        {(activeEntrepot.ville || activeEntrepot.adresse) && <p className="text-xs text-muted-foreground mt-0.5">{[activeEntrepot.adresse, activeEntrepot.ville].filter(Boolean).join(', ')}</p>}
                      </div>
                      <div className="flex gap-2 items-center">
                        {/* Toolbar E */}
                        <div className="relative hidden sm:flex items-center gap-2">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input placeholder="Rechercher..." value={searchE} onChange={e => setSearchE(e.target.value)} className="pl-8 h-7 text-xs w-40" />
                          </div>
                          {hasActiveFiltersE() && <button onClick={() => { setColFiltersE({}); setSearchE(''); setOpenFilterColsE(new Set()); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"><X className="w-3 h-3" /></button>}
                          <div className="relative">
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setColMenuE(o => !o)}>
                              <SlidersHorizontal className="w-3.5 h-3.5 mr-1" />Colonnes
                              {ve.size < ALL_ENTREPOT_COLS.length && <span className="ml-1 text-xs bg-primary text-primary-foreground rounded-full px-1">{ve.size}</span>}
                            </Button>
                            {colMenuE && <ColDropdown cols={ALL_ENTREPOT_COLS} visible={ve as Set<string>} onToggle={toggleVisE} onClose={() => setColMenuE(false)} />}
                          </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => openEditEntrepot(activeEntrepot)}><Edit2 className="w-3.5 h-3.5 mr-1" /> Modifier</Button>
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteEntrepot(activeEntrepot.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                    {/* Mobile search bar */}
                    <div className="flex sm:hidden items-center gap-2 px-4 py-2 border-b border-border bg-muted/10">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input placeholder="Rechercher..." value={searchE} onChange={e => setSearchE(e.target.value)} className="pl-8 h-7 text-xs" />
                      </div>
                      <div className="relative">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setColMenuE(o => !o)}><SlidersHorizontal className="w-3.5 h-3.5" /></Button>
                        {colMenuE && <ColDropdown cols={ALL_ENTREPOT_COLS} visible={ve as Set<string>} onToggle={toggleVisE} onClose={() => setColMenuE(false)} />}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/20">
                            {eCols.ordered(ALL_ENTREPOT_COLS, k => ve.has(k)).map(col => <SortThE key={col.key} col={col.key} label={ENT_LABELS[col.key].label} align={ENT_LABELS[col.key].align} />)}
                          </tr>
                          {openFilterColsE.size > 0 && (
                            <tr className="border-b border-border bg-muted/20">
                              {eCols.ordered(ALL_ENTREPOT_COLS, k => ve.has(k)).map(col => (
                                <td key={col.key} style={eCols.widthStyle(col.key)} className="px-4 py-1">
                                  {openFilterColsE.has(col.key) && <FilterCell value={colFiltersE[col.key] || ''} onChange={v => setFilterE(col.key, v)} align={ENT_LABELS[col.key].align === 'right' ? 'right' : 'left'} />}
                                </td>
                              ))}
                            </tr>
                          )}
                        </thead>
                        <tbody>
                          {sortedE.map(p => {
                            const stockIci = getStockInEntrepot(p.id, activeEntrepot.id);
                            const isEditing = editingStock?.produitId === p.id && editingStock?.entrepotId === activeEntrepot.id;
                            const proprioFourn = p.proprietaire === 'fournisseur' && p.proprietaireFournisseurId ? fournisseurs.find(f => f.id === p.proprietaireFournisseurId) : null;
                            const renderE = (key: EntrepotColKey) => {
                              const ws = eCols.widthStyle(key);
                              switch (key) {
                                case 'produit': return <td style={ws} className={`px-4 py-2.5${ws ? ' truncate' : ''}`}><p className="font-medium truncate">{p.description}</p><p className="text-xs text-muted-foreground font-mono truncate">{p.reference}</p></td>;
                                case 'categorie': return <td style={ws} className={`px-4 py-2.5 text-muted-foreground${ws ? ' truncate' : ''}`}>{p.categorie || '—'}</td>;
                                case 'proprietaire': return <td style={ws} className="px-4 py-2.5">{p.proprietaire === 'fournisseur' ? <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full">{proprioFourn?.societe || 'Fournisseur'}</span> : <span className="text-xs text-muted-foreground">ISOSIGN</span>}</td>;
                                case 'stockEntrepot': return <td style={ws} className="px-4 py-2.5 text-right">{isEditing ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <Input type="number" min={0} className="w-20 h-7 text-right text-sm" value={editingStock.value} onChange={e => setEditingStock({ ...editingStock, value: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') commitStockEdit(); if (e.key === 'Escape') setEditingStock(null); }} autoFocus />
                                    <button onClick={commitStockEdit} className="p-1 rounded text-success hover:bg-success/10"><Save className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => setEditingStock(null)} className="p-1 rounded text-muted-foreground hover:bg-muted"><X className="w-3.5 h-3.5" /></button>
                                  </div>
                                ) : (
                                  <button onClick={() => setEditingStock({ produitId: p.id, entrepotId: activeEntrepot.id, value: String(stockIci) })} className="font-semibold hover:text-primary transition-colors px-2 py-0.5 rounded hover:bg-primary/5">{stockIci} {p.unite}</button>
                                )}</td>;
                                case 'stockTotal': return <td style={ws} className="px-4 py-2.5 text-right text-muted-foreground"><span className={p.stock < p.stockMin ? 'text-warning font-medium' : ''}>{p.stock} {p.unite}</span></td>;
                                case 'valeur': return <td style={ws} className="px-4 py-2.5 text-right text-muted-foreground">{formatMontant(stockIci * p.prixHT)}</td>;
                                default: return <td style={ws} className="px-4 py-2.5" />;
                              }
                            };
                            return (
                              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer" onClick={e => { if ((e.target as HTMLElement).closest('input, button')) return; navigate(`/produits?highlight=${p.id}`); }} title="Ouvrir la fiche produit">
                                {eCols.ordered(ALL_ENTREPOT_COLS, k => ve.has(k)).map(col => <Fragment key={col.key}>{renderE(col.key)}</Fragment>)}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {produits.length === 0 && <p className="text-center py-6 text-muted-foreground text-sm">Aucun produit</p>}
                    {sortedE.length === 0 && produits.length > 0 && <p className="text-center py-6 text-muted-foreground text-sm">Aucun produit ne correspond aux filtres</p>}
                    {sortedE.length > 0 && sortedE.length < produits.length && <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border">{sortedE.length} / {produits.length} produit{produits.length > 1 ? 's' : ''}</p>}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* ══ Tab : Fournisseurs stockistes ════════════════════════════════════ */}
      {tab === 'stockistes' && (() => {
        function SortThSt({ col, label, align = 'left' }: { col: StockisteColKey; label: string; align?: string }) {
          const isSorted = sortColSt === col;
          const SI = isSorted ? (sortDirSt === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
          const hasFilter = !!(colFiltersSt[col]);
          const isOpen = openFilterColsSt.has(col);
          const isDragOver = stCols.dragOverKey === col && stCols.dragKey !== col;
          return (
            <th {...stCols.thProps(col)} style={stCols.widthStyle(col)} className={cn('relative px-4 py-2 font-medium text-muted-foreground select-none whitespace-nowrap cursor-grab active:cursor-grabbing', stCols.dragKey === col ? 'opacity-40' : '', isDragOver ? 'bg-primary/10' : '')}>
              {isDragOver && <span className="absolute top-0 left-0 h-full w-0.5 bg-primary z-20" />}
              <div className={cn('flex items-center gap-0.5', align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : '', stCols.widthStyle(col) ? 'overflow-hidden' : '')}>
                <button onClick={() => handleSortSt(col)} className="flex items-center gap-1 hover:text-foreground cursor-pointer min-w-0">
                  {align === 'right' && <SI className={cn('w-3 h-3 shrink-0', isSorted ? 'text-primary' : 'opacity-40')} />}
                  <span className="truncate">{label}</span>
                  {align !== 'right' && <SI className={cn('w-3 h-3 shrink-0', isSorted ? 'text-primary' : 'opacity-40')} />}
                </button>
                <button onClick={() => toggleFilterColSt(col)} className={cn('p-0.5 rounded hover:bg-muted/80 transition-colors shrink-0', hasFilter ? 'text-primary' : isOpen ? 'text-muted-foreground/60' : 'text-muted-foreground/25 hover:text-muted-foreground/60')}>
                  <Filter className="w-3 h-3" />
                </button>
              </div>
              <ColResizeHandle {...stCols.resizeHandleProps(col)} />
            </th>
          );
        }
        const ST_LABELS: Record<StockisteColKey, { label: string; align?: string }> = {
          produit: { label: 'Produit' }, refFourn: { label: 'Réf. fourn.' }, prixAchat: { label: 'Prix achat', align: 'right' },
          condMin: { label: 'Cond. min.', align: 'right' }, stockActuel: { label: 'Stock actuel', align: 'right' }, delai: { label: 'Délai livr.', align: 'center' },
        };

        const vs = visSt;

        return (
          <div className="space-y-4">
            {stockistes.length === 0 ? (
              <div className="bg-card rounded-xl border border-dashed border-border p-10 text-center">
                <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Aucun fournisseur marqué comme stockiste.</p>
                <p className="text-xs text-muted-foreground mt-1">Dans la fiche fournisseur, cochez "Stockiste" et renseignez le délai d'expédition.</p>
              </div>
            ) : (
              <>
                {/* Toolbar stockistes */}
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <p className="text-sm text-muted-foreground">{stockistes.length} fournisseur{stockistes.length > 1 ? 's' : ''} stockiste{stockistes.length > 1 ? 's' : ''}</p>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input placeholder="Rechercher produit..." value={searchSt} onChange={e => setSearchSt(e.target.value)} className="pl-8 h-8 text-xs w-44" />
                    </div>
                    {hasActiveFiltersSt() && <Button variant="ghost" size="sm" className="h-8" onClick={() => { setColFiltersSt({}); setSearchSt(''); setOpenFilterColsSt(new Set()); }}><X className="w-3.5 h-3.5 mr-1" />Effacer</Button>}
                    <div className="relative">
                      <Button variant="outline" size="sm" className="h-8" onClick={() => setColMenuSt(o => !o)}>
                        <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />Colonnes
                        {vs.size < ALL_STOCKISTE_COLS.length && <span className="ml-1 text-xs bg-primary text-primary-foreground rounded-full px-1">{vs.size}</span>}
                      </Button>
                      {colMenuSt && <ColDropdown cols={ALL_STOCKISTE_COLS} visible={vs as Set<string>} onToggle={toggleVisSt} onClose={() => setColMenuSt(false)} />}
                    </div>
                  </div>
                </div>

                {stockistes.map(f => {
                  const allProduits = produitsParStockiste.get(f.id) || [];
                  const delai = f.delaiExpedition ?? 0;

                  // Filtrage + tri pour ce stockiste
                  const filteredProduits = allProduits.filter(({ produit, pf }) => {
                    if (searchSt) { const s = searchSt.toLowerCase(); if (![produit.description, produit.reference].some(x => x?.toLowerCase().includes(s))) return false; }
                    if (!applyFilter(colFiltersSt.produit || '', (nv, v) => nv ? !!produit.description?.trim() : !!(produit.description?.toLowerCase().includes(v) || produit.reference?.toLowerCase().includes(v)))) return false;
                    if (!applyFilter(colFiltersSt.refFourn || '', (nv, v) => nv ? !!pf.referenceFournisseur?.trim() : (pf.referenceFournisseur || '').toLowerCase().includes(v))) return false;
                    if (!applyFilter(colFiltersSt.prixAchat || '', (nv, v) => nv ? pf.prixAchat > 0 : formatMontant(pf.prixAchat).includes(v))) return false;
                    if (!applyFilter(colFiltersSt.condMin || '', (nv, v) => nv ? pf.conditionnementMin > 0 : String(pf.conditionnementMin).includes(v))) return false;
                    if (!applyFilter(colFiltersSt.stockActuel || '', (nv, v) => nv ? produit.stock > 0 : String(produit.stock).includes(v))) return false;
                    if (!applyFilter(colFiltersSt.delai || '', (nv, v) => nv ? pf.delaiLivraison > 0 : String(pf.delaiLivraison).includes(v))) return false;
                    return true;
                  });

                  const sortedProduits = [...filteredProduits].sort((a, b) => {
                    const dir = sortDirSt === 'asc' ? 1 : -1;
                    switch (sortColSt) {
                      case 'produit': return dir * a.produit.description.localeCompare(b.produit.description);
                      case 'refFourn': return dir * (a.pf.referenceFournisseur || '').localeCompare(b.pf.referenceFournisseur || '');
                      case 'prixAchat': return dir * (a.pf.prixAchat - b.pf.prixAchat);
                      case 'condMin': return dir * (a.pf.conditionnementMin - b.pf.conditionnementMin);
                      case 'stockActuel': return dir * (a.produit.stock - b.produit.stock);
                      case 'delai': return dir * (a.pf.delaiLivraison - b.pf.delaiLivraison);
                      default: return 0;
                    }
                  });

                  return (
                    <div key={f.id} className="bg-card rounded-xl border border-border overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
                        <Building2 className="w-5 h-5 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{f.societe}</p>
                          {f.ville && <p className="text-xs text-muted-foreground">{f.ville}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Clock className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium">{delai === 0 ? 'Disponible immédiatement' : `Expédition sous ${delai}j`}</span>
                        </div>
                        {f.francoPort > 0 && <span className="text-xs text-muted-foreground hidden sm:block shrink-0">Franco {formatMontant(f.francoPort)}</span>}
                      </div>
                      {allProduits.length === 0 ? (
                        <p className="px-4 py-4 text-sm text-muted-foreground">Aucun produit lié à ce fournisseur.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border bg-muted/10">
                                {stCols.ordered(ALL_STOCKISTE_COLS, k => vs.has(k)).map(col => <SortThSt key={col.key} col={col.key} label={ST_LABELS[col.key].label} align={ST_LABELS[col.key].align} />)}
                              </tr>
                              {openFilterColsSt.size > 0 && (
                                <tr className="border-b border-border bg-muted/20">
                                  {stCols.ordered(ALL_STOCKISTE_COLS, k => vs.has(k)).map(col => (
                                    <td key={col.key} style={stCols.widthStyle(col.key)} className="px-4 py-1">
                                      {openFilterColsSt.has(col.key) && <FilterCell value={colFiltersSt[col.key] || ''} onChange={v => setFilterSt(col.key, v)} align={ST_LABELS[col.key].align === 'right' ? 'right' : ST_LABELS[col.key].align === 'center' ? 'center' : 'left'} />}
                                    </td>
                                  ))}
                                </tr>
                              )}
                            </thead>
                            <tbody>
                              {sortedProduits.map(({ produit, pf }) => {
                                const renderSt = (key: StockisteColKey) => {
                                  const ws = stCols.widthStyle(key);
                                  switch (key) {
                                    case 'produit': return <td style={ws} className={`px-4 py-2.5${ws ? ' truncate' : ''}`}><p className="font-medium truncate">{produit.description}</p><p className="text-xs text-muted-foreground font-mono truncate">{produit.reference}</p></td>;
                                    case 'refFourn': return <td style={ws} className={`px-4 py-2.5 text-muted-foreground font-mono text-xs${ws ? ' truncate' : ''}`}>{pf.referenceFournisseur || '—'}</td>;
                                    case 'prixAchat': return <td style={ws} className="px-4 py-2.5 text-right font-medium">{formatMontant(pf.prixAchat)}/{produit.unite}</td>;
                                    case 'condMin': return <td style={ws} className="px-4 py-2.5 text-right text-muted-foreground">{pf.conditionnementMin} {produit.unite}</td>;
                                    case 'stockActuel': return <td style={ws} className="px-4 py-2.5 text-right"><span className={cn('font-medium', produit.stock < produit.stockMin ? 'text-warning' : 'text-success')}>{produit.stock} {produit.unite}</span></td>;
                                    case 'delai': return <td style={ws} className="px-4 py-2.5 text-center"><span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium', pf.delaiLivraison <= (delai || 3) ? 'bg-success/10 text-success' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400')}><Clock className="w-3 h-3" />{pf.delaiLivraison}j</span></td>;
                                    default: return <td style={ws} className="px-4 py-2.5" />;
                                  }
                                };
                                return (
                                  <tr key={pf.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => navigate(`/produits?highlight=${produit.id}`)} title="Ouvrir la fiche produit">
                                    {stCols.ordered(ALL_STOCKISTE_COLS, k => vs.has(k)).map(col => <Fragment key={col.key}>{renderSt(col.key)}</Fragment>)}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {sortedProduits.length === 0 && allProduits.length > 0 && <p className="px-4 py-3 text-sm text-muted-foreground">Aucun produit ne correspond aux filtres.</p>}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );
      })()}

      {/* ══ Dialog entrepôt ════════════════════════════════════════════════ */}
      <Dialog open={entrepotDialogOpen} onOpenChange={setEntrepotDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingEntrepot ? 'Modifier l\'entrepôt' : 'Nouvel entrepôt'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div><Label>Nom *</Label><Input value={entrepotForm.nom} onChange={e => setEntrepotForm(prev => ({ ...prev, nom: e.target.value }))} placeholder="Ex: Entrepôt principal" /></div>
            <div><Label>Adresse</Label><Input value={entrepotForm.adresse} onChange={e => setEntrepotForm(prev => ({ ...prev, adresse: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2"><Label>Ville</Label><Input value={entrepotForm.ville} onChange={e => setEntrepotForm(prev => ({ ...prev, ville: e.target.value }))} /></div>
              <div><Label>CP</Label><Input value={entrepotForm.codePostal} onChange={e => setEntrepotForm(prev => ({ ...prev, codePostal: e.target.value }))} /></div>
            </div>
            <div><Label>Notes</Label><Input value={entrepotForm.notes} onChange={e => setEntrepotForm(prev => ({ ...prev, notes: e.target.value }))} /></div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={entrepotForm.estDefaut} onChange={e => setEntrepotForm(prev => ({ ...prev, estDefaut: e.target.checked }))} className="rounded" />
              <span className="text-sm">Entrepôt par défaut</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEntrepotDialogOpen(false)}>Annuler</Button>
            <Button onClick={saveEntrepot}>{editingEntrepot ? 'Modifier' : 'Créer'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
