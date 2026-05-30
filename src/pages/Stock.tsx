import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCRM } from '@/lib/StoreContext';
import { formatMontant, calculerFournisseurPrioritaire, useEntrepots, type Entrepot } from '@/lib/store';
import { AlertTriangle, CheckCircle, Package, Truck, Download, Star, Warehouse, Plus, Edit2, Trash2, Save, X, Building2, Clock, ChevronUp, ChevronDown, ChevronsUpDown, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { exportToExcel } from '@/lib/exportExcel';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ── Colonnes du tableau stock global ──────────────────────────────────────────
type StockColKey = 'statut' | 'description' | 'categorie' | 'proprietaire' | 'disponibleVente' | 'stock' | 'stockMin' | 'qteReappro' | 'fournisseur' | 'valeur';
type SortDir = 'asc' | 'desc';

// Sentinelle "non vide"
const NON_VIDE = '!empty';

// Petit composant filtre avec bouton ≠∅
function FilterCell({ value, onChange, align = 'left' }: { value: string; onChange: (v: string) => void; align?: 'left' | 'right' | 'center' }) {
  if (value === NON_VIDE) {
    return (
      <button
        onClick={() => onChange('')}
        className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full whitespace-nowrap"
      >
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
        className={cn(
          'h-6 text-xs flex-1 min-w-0 rounded border border-input bg-background px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring',
          align === 'right' && 'text-right'
        )}
      />
      <button
        onClick={() => onChange(NON_VIDE)}
        title="Non vide"
        className="shrink-0 text-xs text-muted-foreground hover:text-primary px-0.5 py-0.5 rounded leading-none"
      >≠∅</button>
    </div>
  );
}

type TabId = 'global' | 'entrepots' | 'stockistes';

export default function Stock() {
  const navigate = useNavigate();
  const { produits, fournisseurs, produitFournisseurs } = useCRM();
  const { entrepots, stockEntrepots, loading: loadingE, addEntrepot, updateEntrepot, deleteEntrepot, upsertStock } = useEntrepots();

  const [tab, setTab] = useState<TabId>('global');
  // ── Stock global : tri + filtres ────────────────────────────────────────────
  const [globalSearch, setGlobalSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [colFilters, setColFilters] = useState<Partial<Record<StockColKey, string>>>({});
  const [sortCol, setSortCol] = useState<StockColKey | null>('statut');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function handleSort(col: StockColKey) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }
  function setFilter(col: StockColKey, val: string) {
    setColFilters(prev => ({ ...prev, [col]: val }));
  }
  function hasActiveFilters() {
    return globalSearch.trim() !== '' || Object.values(colFilters).some(v => v);
  }
  const [entrepotDialogOpen, setEntrepotDialogOpen] = useState(false);
  const [editingEntrepot, setEditingEntrepot] = useState<Entrepot | null>(null);
  const [entrepotForm, setEntrepotForm] = useState({ nom: '', adresse: '', ville: '', codePostal: '', notes: '', estDefaut: false });
  const [editingStock, setEditingStock] = useState<{ produitId: string; entrepotId: string; value: string } | null>(null);
  const [selectedEntrepotId, setSelectedEntrepotId] = useState<string | null>(null);

  // ── Calculs globaux ──────────────────────────────────────────────────────────
  const sorted = [...produits].sort((a, b) => {
    const aLow = a.stock < a.stockMin ? 0 : 1;
    const bLow = b.stock < b.stockMin ? 0 : 1;
    return aLow - bLow || a.description.localeCompare(b.description);
  });

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

  // ── Fournisseurs stockistes ──────────────────────────────────────────────────
  const stockistes = useMemo(() => fournisseurs.filter(f => f.estStockiste), [fournisseurs]);

  // Produits disponibles chez un stockiste : ceux liés via produit_fournisseurs
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
  function openNewEntrepot() {
    setEditingEntrepot(null);
    setEntrepotForm({ nom: '', adresse: '', ville: '', codePostal: '', notes: '', estDefaut: false });
    setEntrepotDialogOpen(true);
  }

  function openEditEntrepot(e: Entrepot) {
    setEditingEntrepot(e);
    setEntrepotForm({ nom: e.nom, adresse: e.adresse || '', ville: e.ville || '', codePostal: e.codePostal || '', notes: e.notes || '', estDefaut: e.estDefaut });
    setEntrepotDialogOpen(true);
  }

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

  // Stock par entrepôt affiché
  const activeEntrepot = entrepots.find(e => e.id === selectedEntrepotId) ?? entrepots[0];

  function getStockInEntrepot(produitId: string, entrepotId: string) {
    return stockEntrepots.find(s => s.produitId === produitId && s.entrepotId === entrepotId)?.stock ?? 0;
  }

  async function commitStockEdit() {
    if (!editingStock) return;
    const val = parseInt(editingStock.value);
    if (isNaN(val) || val < 0) { toast.error('Valeur invalide'); return; }
    const err = await upsertStock(editingStock.produitId, editingStock.entrepotId, val);
    if (err) { toast.error('Erreur : ' + err.message); return; }
    setEditingStock(null);
  }

  // Totaux par entrepôt
  function getTotauxEntrepot(entrepotId: string) {
    const stocks = stockEntrepots.filter(s => s.entrepotId === entrepotId);
    const total = stocks.reduce((s, se) => s + se.stock, 0);
    const valeur = stocks.reduce((s, se) => {
      const p = produits.find(p => p.id === se.produitId);
      return s + (p ? se.stock * p.prixHT : 0);
    }, 0);
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
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
              tab === t.id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <t.icon className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ══ Tab : Stock global ══════════════════════════════════════════════ */}
      {tab === 'global' && (() => {
        // ── Données enrichies ──────────────────────────────────────────────────
        const enriched = produits.map(p => {
          const info = getBestSupplierInfo(p);
          const low = p.stock < p.stockMin;
          const qteReappro = low ? Math.max(0, p.stockMin - p.stock) : 0;
          const proprioFourn = p.proprietaire === 'fournisseur' && p.proprietaireFournisseurId
            ? fournisseurs.find(f => f.id === p.proprietaireFournisseurId)
            : null;
          return { p, info, low, qteReappro, proprioFourn };
        });

        // ── Filtrage ───────────────────────────────────────────────────────────
        const applyFilter = (val: string, test: (nonVide: boolean, v: string) => boolean) => {
          if (!val) return true;
          return test(val === NON_VIDE, val.toLowerCase());
        };
        const filtered = enriched.filter(({ p, info, low, proprioFourn }) => {
          if (globalSearch) {
            const s = globalSearch.toLowerCase();
            if (![p.description, p.reference, p.categorie, info?.fourn.societe].some(x => x?.toLowerCase().includes(s))) return false;
          }
          if (!applyFilter(colFilters.statut || '', (nv, v) => nv ? low : (low ? 'alerte' : 'ok').includes(v))) return false;
          if (!applyFilter(colFilters.description || '', (nv, v) => nv ? !!p.description?.trim() : p.description?.toLowerCase().includes(v) || p.reference?.toLowerCase().includes(v))) return false;
          if (!applyFilter(colFilters.categorie || '', (nv, v) => nv ? !!p.categorie?.trim() : (p.categorie || '').toLowerCase().includes(v))) return false;
          if (!applyFilter(colFilters.proprietaire || '', (nv, v) => nv ? true : (p.proprietaire === 'fournisseur' ? (proprioFourn?.societe || 'fournisseur') : 'isosign').toLowerCase().includes(v))) return false;
          if (!applyFilter(colFilters.disponibleVente || '', (nv, v) => nv ? p.disponibleVente !== false : (p.disponibleVente !== false ? 'oui' : 'non').includes(v))) return false;
          if (!applyFilter(colFilters.stock || '', (nv, v) => nv ? p.stock > 0 : String(p.stock).includes(v))) return false;
          if (!applyFilter(colFilters.stockMin || '', (nv, v) => nv ? p.stockMin > 0 : String(p.stockMin).includes(v))) return false;
          if (!applyFilter(colFilters.fournisseur || '', (nv, v) => nv ? !!info : (info?.fourn.societe || '').toLowerCase().includes(v))) return false;
          if (!applyFilter(colFilters.valeur || '', (nv, v) => nv ? p.stock * p.prixHT > 0 : formatMontant(p.stock * p.prixHT).includes(v))) return false;
          return true;
        });

        // ── Tri ────────────────────────────────────────────────────────────────
        const sortedFiltered = [...filtered].sort((a, b) => {
          const dir = sortDir === 'asc' ? 1 : -1;
          switch (sortCol) {
            case 'statut':        return dir * ((a.low ? 0 : 1) - (b.low ? 0 : 1));
            case 'description':   return dir * a.p.description.localeCompare(b.p.description);
            case 'categorie':     return dir * (a.p.categorie || '').localeCompare(b.p.categorie || '');
            case 'proprietaire':  return dir * (a.p.proprietaire || 'isosign').localeCompare(b.p.proprietaire || 'isosign');
            case 'disponibleVente': return dir * ((a.p.disponibleVente !== false ? 1 : 0) - (b.p.disponibleVente !== false ? 1 : 0));
            case 'stock':         return dir * (a.p.stock - b.p.stock);
            case 'stockMin':      return dir * (a.p.stockMin - b.p.stockMin);
            case 'qteReappro':    return dir * (a.qteReappro - b.qteReappro);
            case 'fournisseur':   return dir * (a.info?.fourn.societe || '').localeCompare(b.info?.fourn.societe || '');
            case 'valeur':        return dir * (a.p.stock * a.p.prixHT - b.p.stock * b.p.prixHT);
            default:              return 0;
          }
        });

        // ── En-tête triable ────────────────────────────────────────────────────
        function SortTh({ col, label, align = 'left', className = '' }: { col: StockColKey; label: string; align?: string; className?: string }) {
          const isSorted = sortCol === col;
          const Icon = isSorted ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
          return (
            <th
              onClick={() => handleSort(col)}
              className={cn('px-3 py-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap', `text-${align}`, className)}
            >
              <div className={cn('flex items-center gap-1', align === 'right' && 'justify-end')}>
                {align === 'right' && <Icon className={cn('w-3 h-3 shrink-0', isSorted ? 'text-primary' : 'opacity-40')} />}
                {label}
                {align !== 'right' && <Icon className={cn('w-3 h-3 shrink-0', isSorted ? 'text-primary' : 'opacity-40')} />}
              </div>
            </th>
          );
        }

        return (
          <div className="space-y-4">
            {/* Indicateurs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="stat-card text-center">
                <Package className="w-5 h-5 mx-auto text-primary mb-1" />
                <p className="text-2xl font-heading font-bold">{totalStock}</p>
                <p className="text-xs text-muted-foreground">Unités totales</p>
              </div>
              <div className="stat-card text-center">
                <p className="text-2xl font-heading font-bold">{formatMontant(totalValeur)}</p>
                <p className="text-xs text-muted-foreground">Valeur stock HT</p>
              </div>
              <div className="stat-card text-center">
                <AlertTriangle className={`w-5 h-5 mx-auto mb-1 ${alertes > 0 ? 'text-warning' : 'text-success'}`} />
                <p className="text-2xl font-heading font-bold">{alertes}</p>
                <p className="text-xs text-muted-foreground">Alertes</p>
              </div>
            </div>

            {/* Réappro par fournisseur */}
            {reapproParFournisseur.size > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Truck className="w-4 h-4" /> Réappro optimale par fournisseur
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[...reapproParFournisseur.entries()].map(([fId, group]) => {
                    const totalReappro = group.produits.reduce((s, { info }) => s + info.totalAchat, 0);
                    const francoAtteint = totalReappro >= group.fourn.francoPort;
                    const manque = Math.max(0, group.fourn.francoPort - totalReappro);
                    return (
                      <div key={fId} className="bg-card rounded-xl border border-border p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 text-primary" /> {group.fourn.societe}
                          </p>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${francoAtteint ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                            {francoAtteint ? 'Franco atteint' : 'Franco non atteint'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          <span className="text-muted-foreground">Franco de port :</span>
                          <span className="text-right font-medium">{formatMontant(group.fourn.francoPort)}</span>
                          <span className="text-muted-foreground">Total réappro :</span>
                          <span className="text-right font-medium">{formatMontant(totalReappro)}</span>
                          {!francoAtteint && (<><span className="text-muted-foreground">Reste pour franco :</span><span className="text-right font-medium text-warning">{formatMontant(manque)}</span></>)}
                          <span className="text-muted-foreground">Coût transport :</span>
                          <span className="text-right font-medium">{francoAtteint ? <span className="text-success">Gratuit</span> : formatMontant(group.fourn.coutTransport)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {group.produits.length} produit{group.produits.length > 1 ? 's' : ''} :
                          <span className="ml-1">{group.produits.map(({ produit, info }) => `${produit.description} (${info.qte} ${produit.unite} à ${formatMontant(info.prixAchat)})`).join(', ')}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Barre recherche + actions */}
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher produit..."
                  value={globalSearch}
                  onChange={e => setGlobalSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant={showFilters ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => { setShowFilters(s => !s); if (showFilters) setColFilters({}); }}
                >
                  <Filter className="w-4 h-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Filtres</span>
                  {hasActiveFilters() && !showFilters && <span className="ml-1 text-xs bg-primary text-primary-foreground rounded-full px-1.5">!</span>}
                </Button>
                {hasActiveFilters() && (
                  <Button variant="ghost" size="sm" onClick={() => { setColFilters({}); setGlobalSearch(''); }}>
                    <X className="w-4 h-4 mr-1" /> Effacer
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => exportToExcel(sortedFiltered.map(({ p, info, proprioFourn }) => ({
                  Référence: p.reference, Description: p.description, Stock: p.stock, 'Stock Min': p.stockMin,
                  Alerte: p.stock < p.stockMin ? 'Oui' : 'Non', 'Dispo vente': p.disponibleVente !== false ? 'Oui' : 'Non',
                  'Prix HT': p.prixHT, 'Valeur Stock': p.stock * p.prixHT, Catégorie: p.categorie || '',
                  Propriétaire: p.proprietaire === 'fournisseur' ? (proprioFourn?.societe || 'Fournisseur') : 'ISOSIGN',
                  'Fournisseur optimal': info?.fourn.societe || '', 'Prix achat': info?.prixAchat || '',
                })), 'stock', 'Stock')}>
                  <Download className="w-4 h-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Exporter</span>
                </Button>
              </div>
            </div>

            {/* Tableau */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <SortTh col="statut" label="Statut" />
                      <SortTh col="description" label="Produit" />
                      <SortTh col="categorie" label="Catégorie" className="hidden sm:table-cell" />
                      <SortTh col="disponibleVente" label="Dispo" align="center" className="hidden sm:table-cell" />
                      <SortTh col="proprietaire" label="Propriétaire" className="hidden md:table-cell" />
                      <SortTh col="stock" label="Stock" align="right" />
                      <SortTh col="stockMin" label="Min." align="right" className="hidden sm:table-cell" />
                      <SortTh col="qteReappro" label="Réappro" align="right" className="hidden sm:table-cell" />
                      <SortTh col="fournisseur" label="Fourn. optimal" className="hidden md:table-cell" />
                      <SortTh col="valeur" label="Valeur" align="right" className="hidden md:table-cell" />
                    </tr>
                    {showFilters && (
                      <tr className="border-b border-border bg-muted/20">
                        <td className="px-3 py-1"><FilterCell value={colFilters.statut || ''} onChange={v => setFilter('statut', v)} /></td>
                        <td className="px-3 py-1"><FilterCell value={colFilters.description || ''} onChange={v => setFilter('description', v)} /></td>
                        <td className="px-3 py-1 hidden sm:table-cell"><FilterCell value={colFilters.categorie || ''} onChange={v => setFilter('categorie', v)} /></td>
                        <td className="px-3 py-1 hidden sm:table-cell"><FilterCell value={colFilters.disponibleVente || ''} onChange={v => setFilter('disponibleVente', v)} align="center" /></td>
                        <td className="px-3 py-1 hidden md:table-cell"><FilterCell value={colFilters.proprietaire || ''} onChange={v => setFilter('proprietaire', v)} /></td>
                        <td className="px-3 py-1"><FilterCell value={colFilters.stock || ''} onChange={v => setFilter('stock', v)} align="right" /></td>
                        <td className="px-3 py-1 hidden sm:table-cell"><FilterCell value={colFilters.stockMin || ''} onChange={v => setFilter('stockMin', v)} align="right" /></td>
                        <td className="px-3 py-1 hidden sm:table-cell"><FilterCell value={colFilters.qteReappro || ''} onChange={v => setFilter('qteReappro', v)} align="right" /></td>
                        <td className="px-3 py-1 hidden md:table-cell"><FilterCell value={colFilters.fournisseur || ''} onChange={v => setFilter('fournisseur', v)} /></td>
                        <td className="px-3 py-1 hidden md:table-cell"><FilterCell value={colFilters.valeur || ''} onChange={v => setFilter('valeur', v)} align="right" /></td>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {sortedFiltered.map(({ p, info, low, qteReappro, proprioFourn }) => (
                      <tr
                        key={p.id}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => navigate(`/produits?highlight=${p.id}`)}
                        title="Ouvrir la fiche produit"
                      >
                        <td className="px-3 py-3">
                          {low ? <AlertTriangle className="w-4 h-4 text-warning" /> : <CheckCircle className="w-4 h-4 text-success" />}
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium">{p.description}</p>
                          <p className="text-xs text-muted-foreground font-mono">{p.reference}</p>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground hidden sm:table-cell">{p.categorie || '—'}</td>
                        <td className="px-3 py-3 text-center hidden sm:table-cell">
                          {p.disponibleVente !== false
                            ? <span title="Disponible à la vente" className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-success/15 text-success text-xs font-bold">✓</span>
                            : <span title="Non disponible" className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs">✕</span>}
                        </td>
                        <td className="px-3 py-3 hidden md:table-cell">
                          {p.proprietaire === 'fournisseur' ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full">
                              <Truck className="w-3 h-3" />{proprioFourn?.societe || 'Fournisseur'}
                            </span>
                          ) : <span className="text-xs text-muted-foreground">ISOSIGN</span>}
                        </td>
                        <td className={`px-3 py-3 text-right font-semibold ${low ? 'text-warning' : ''}`}>{p.stock} {p.unite}</td>
                        <td className="px-3 py-3 text-right text-muted-foreground hidden sm:table-cell">{p.stockMin}</td>
                        <td className="px-3 py-3 text-right hidden sm:table-cell">
                          {low ? <span className="text-warning font-medium">{qteReappro} {p.unite} <span className="text-xs text-muted-foreground">({formatMontant(qteReappro * (info?.prixAchat || p.prixAchat))})</span></span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground hidden md:table-cell">
                          {info ? (
                            <div>
                              <span className="flex items-center gap-1">
                                {info.isMulti && <Star className="w-3 h-3 text-primary" />}{info.fourn.societe}
                              </span>
                              <span className="block text-xs">{formatMontant(info.prixAchat)}/{p.unite}{info.fourn.francoPort > 0 && ` · Franco ${formatMontant(info.fourn.francoPort)}`}</span>
                              {info.isMulti && <span className="text-xs text-primary">{info.nbFournisseurs} fournisseurs</span>}
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-3 text-right hidden md:table-cell">{formatMontant(p.stock * p.prixHT)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sortedFiltered.length === 0 && (
                <p className="text-center py-8 text-muted-foreground text-sm">
                  {hasActiveFilters() ? 'Aucun produit ne correspond aux filtres' : 'Aucun produit en stock'}
                </p>
              )}
              {sortedFiltered.length > 0 && sortedFiltered.length < produits.length && (
                <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
                  {sortedFiltered.length} / {produits.length} produit{produits.length > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* ══ Tab : Par entrepôt ══════════════════════════════════════════════ */}
      {tab === 'entrepots' && (
        <div className="space-y-4">
          {loadingE ? (
            <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>
          ) : (
            <>
              {/* Liste entrepôts + sélection */}
              <div className="flex flex-wrap gap-2 items-center">
                {entrepots.map(e => {
                  const { total, valeur } = getTotauxEntrepot(e.id);
                  const isActive = (selectedEntrepotId || entrepots[0]?.id) === e.id;
                  return (
                    <button
                      key={e.id}
                      onClick={() => setSelectedEntrepotId(e.id)}
                      className={cn(
                        'flex flex-col items-start px-4 py-2.5 rounded-xl border text-left transition-all',
                        isActive ? 'border-primary bg-primary/5 text-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/50'
                      )}
                    >
                      <span className="font-semibold text-sm flex items-center gap-1.5">
                        <Warehouse className="w-3.5 h-3.5 shrink-0" />
                        {e.nom}
                        {e.estDefaut && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Défaut</span>}
                      </span>
                      <span className="text-xs mt-0.5 opacity-70">{total} unités · {formatMontant(valeur)}</span>
                    </button>
                  );
                })}
                <Button variant="outline" size="sm" onClick={openNewEntrepot}>
                  <Plus className="w-4 h-4 mr-1.5" /> Nouvel entrepôt
                </Button>
              </div>

              {entrepots.length === 0 && (
                <div className="bg-card rounded-xl border border-dashed border-border p-10 text-center">
                  <Warehouse className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Aucun entrepôt configuré</p>
                  <Button className="mt-4" onClick={openNewEntrepot}><Plus className="w-4 h-4 mr-2" /> Créer le premier entrepôt</Button>
                </div>
              )}

              {/* Entrepôt sélectionné : détails + stock */}
              {activeEntrepot && (
                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                    <div>
                      <p className="font-semibold text-sm flex items-center gap-2">
                        <Warehouse className="w-4 h-4 text-primary" />
                        {activeEntrepot.nom}
                      </p>
                      {(activeEntrepot.ville || activeEntrepot.adresse) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {[activeEntrepot.adresse, activeEntrepot.ville].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditEntrepot(activeEntrepot)}>
                        <Edit2 className="w-3.5 h-3.5 mr-1" /> Modifier
                      </Button>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteEntrepot(activeEntrepot.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/20">
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Produit</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Catégorie</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Propriétaire</th>
                          <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Stock entrepôt</th>
                          <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Stock total</th>
                          <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Valeur</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map(p => {
                          const stockIci = getStockInEntrepot(p.id, activeEntrepot.id);
                          const isEditing = editingStock?.produitId === p.id && editingStock?.entrepotId === activeEntrepot.id;
                          const proprioFourn = p.proprietaire === 'fournisseur' && p.proprietaireFournisseurId
                            ? fournisseurs.find(f => f.id === p.proprietaireFournisseurId)
                            : null;
                          return (
                            <tr
                              key={p.id}
                              className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                              onClick={e => { if ((e.target as HTMLElement).closest('input, button')) return; navigate(`/produits?highlight=${p.id}`); }}
                              title="Ouvrir la fiche produit"
                            >
                              <td className="px-4 py-2.5">
                                <p className="font-medium">{p.description}</p>
                                <p className="text-xs text-muted-foreground font-mono">{p.reference}</p>
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{p.categorie || '—'}</td>
                              <td className="px-4 py-2.5 hidden md:table-cell">
                                {p.proprietaire === 'fournisseur' ? (
                                  <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full">
                                    {proprioFourn?.societe || 'Fournisseur'}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">ISOSIGN</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                {isEditing ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <Input
                                      type="number"
                                      min={0}
                                      className="w-20 h-7 text-right text-sm"
                                      value={editingStock.value}
                                      onChange={e => setEditingStock({ ...editingStock, value: e.target.value })}
                                      onKeyDown={e => { if (e.key === 'Enter') commitStockEdit(); if (e.key === 'Escape') setEditingStock(null); }}
                                      autoFocus
                                    />
                                    <button onClick={commitStockEdit} className="p-1 rounded text-success hover:bg-success/10"><Save className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => setEditingStock(null)} className="p-1 rounded text-muted-foreground hover:bg-muted"><X className="w-3.5 h-3.5" /></button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setEditingStock({ produitId: p.id, entrepotId: activeEntrepot.id, value: String(stockIci) })}
                                    className="font-semibold hover:text-primary transition-colors px-2 py-0.5 rounded hover:bg-primary/5"
                                  >
                                    {stockIci} {p.unite}
                                  </button>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right text-muted-foreground hidden sm:table-cell">
                                <span className={p.stock < p.stockMin ? 'text-warning font-medium' : ''}>{p.stock} {p.unite}</span>
                              </td>
                              <td className="px-4 py-2.5 text-right text-muted-foreground hidden md:table-cell">
                                {formatMontant(stockIci * p.prixHT)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {produits.length === 0 && <p className="text-center py-6 text-muted-foreground text-sm">Aucun produit</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ══ Tab : Fournisseurs stockistes ════════════════════════════════════ */}
      {tab === 'stockistes' && (
        <div className="space-y-4">
          {stockistes.length === 0 ? (
            <div className="bg-card rounded-xl border border-dashed border-border p-10 text-center">
              <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Aucun fournisseur marqué comme stockiste.</p>
              <p className="text-xs text-muted-foreground mt-1">Dans la fiche fournisseur, cochez "Stockiste" et renseignez le délai d'expédition.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {stockistes.length} fournisseur{stockistes.length > 1 ? 's' : ''} stockiste{stockistes.length > 1 ? 's' : ''} — produits disponibles en stock immédiat ou sous délai court.
              </p>
              {stockistes.map(f => {
                const produitsDispo = produitsParStockiste.get(f.id) || [];
                const delai = f.delaiExpedition ?? 0;
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
                        <span className="text-sm font-medium">
                          {delai === 0 ? 'Disponible immédiatement' : `Expédition sous ${delai}j`}
                        </span>
                      </div>
                      {f.francoPort > 0 && (
                        <span className="text-xs text-muted-foreground hidden sm:block shrink-0">Franco {formatMontant(f.francoPort)}</span>
                      )}
                    </div>
                    {produitsDispo.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-muted-foreground">Aucun produit lié à ce fournisseur.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/10">
                              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Produit</th>
                              <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden sm:table-cell">Réf. fourn.</th>
                              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Prix achat</th>
                              <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden sm:table-cell">Cond. min.</th>
                              <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Stock actuel</th>
                              <th className="text-center px-4 py-2 font-medium text-muted-foreground">Délai livr.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {produitsDispo.map(({ produit, pf }) => (
                              <tr key={pf.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-2.5">
                                  <p className="font-medium">{produit.description}</p>
                                  <p className="text-xs text-muted-foreground font-mono">{produit.reference}</p>
                                </td>
                                <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell font-mono text-xs">{pf.referenceFournisseur || '—'}</td>
                                <td className="px-4 py-2.5 text-right font-medium">{formatMontant(pf.prixAchat)}/{produit.unite}</td>
                                <td className="px-4 py-2.5 text-right text-muted-foreground hidden sm:table-cell">{pf.conditionnementMin} {produit.unite}</td>
                                <td className="px-4 py-2.5 text-right hidden md:table-cell">
                                  <span className={cn('font-medium', produit.stock < produit.stockMin ? 'text-warning' : 'text-success')}>
                                    {produit.stock} {produit.unite}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className={cn(
                                    'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium',
                                    pf.delaiLivraison <= (delai || 3)
                                      ? 'bg-success/10 text-success'
                                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                  )}>
                                    <Clock className="w-3 h-3" />
                                    {pf.delaiLivraison}j
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ══ Dialog entrepôt ════════════════════════════════════════════════ */}
      <Dialog open={entrepotDialogOpen} onOpenChange={setEntrepotDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEntrepot ? 'Modifier l\'entrepôt' : 'Nouvel entrepôt'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>Nom *</Label>
              <Input value={entrepotForm.nom} onChange={e => setEntrepotForm(prev => ({ ...prev, nom: e.target.value }))} placeholder="Ex: Entrepôt principal" />
            </div>
            <div>
              <Label>Adresse</Label>
              <Input value={entrepotForm.adresse} onChange={e => setEntrepotForm(prev => ({ ...prev, adresse: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label>Ville</Label>
                <Input value={entrepotForm.ville} onChange={e => setEntrepotForm(prev => ({ ...prev, ville: e.target.value }))} />
              </div>
              <div>
                <Label>CP</Label>
                <Input value={entrepotForm.codePostal} onChange={e => setEntrepotForm(prev => ({ ...prev, codePostal: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={entrepotForm.notes} onChange={e => setEntrepotForm(prev => ({ ...prev, notes: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={entrepotForm.estDefaut}
                onChange={e => setEntrepotForm(prev => ({ ...prev, estDefaut: e.target.checked }))}
                className="rounded"
              />
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
