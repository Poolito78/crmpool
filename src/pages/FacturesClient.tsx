import { useState, useMemo, Fragment } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTableColumns } from '@/hooks/useTableColumns';
import ColResizeHandle from '@/components/ColResizeHandle';
import PageHeaderSlot from '@/components/PageHeaderSlot';
import FilterSuggestInput from '@/components/FilterSuggestInput';
import FilterDateInput, { matchDateFilter, parseDateFilter } from '@/components/FilterDateInput';
import FilterAmountInput, { matchAmountFilter, parseAmountFilter } from '@/components/FilterAmountInput';
import TableGearMenu from '@/components/TableGearMenu';
import { exportToExcel } from '@/lib/exportExcel';
import { useCRM } from '@/lib/StoreContext';
import {
  generateId, formatMontant, formatDate,
  STATUTS_FACTURE_CLIENT, type FactureClient, type StatutFactureClient, type LigneDevis,
  calculerTotalDevis,
} from '@/lib/store';
import { Plus, Search, Trash2, Pencil, FileText, Receipt, CheckCircle2, AlertCircle, Euro, ArrowRight, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import ClientCombobox from '@/components/ClientCombobox';

const allStatuts = Object.keys(STATUTS_FACTURE_CLIENT) as StatutFactureClient[];

type ViewMode = 'toutes' | 'factures' | 'proformas';

type FCColKey = 'numero' | 'client' | 'ref' | 'date' | 'echeance' | 'paiement' | 'total' | 'statut';
const FC_COLS: { key: FCColKey; label: string; cls: string }[] = [
  { key: 'numero', label: 'N°', cls: 'text-left' },
  { key: 'client', label: 'Client', cls: 'text-left' },
  { key: 'ref', label: 'Réf. / Liens', cls: 'text-left hidden sm:table-cell' },
  { key: 'date', label: 'Date', cls: 'text-left hidden md:table-cell' },
  { key: 'echeance', label: 'Échéance', cls: 'text-left hidden lg:table-cell' },
  { key: 'paiement', label: 'Paiement', cls: 'text-left hidden lg:table-cell' },
  { key: 'total', label: 'Total TTC', cls: 'text-right' },
  { key: 'statut', label: 'Statut', cls: 'text-center' },
];

export default function FacturesClient() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { facturesClient, updateFacturesClient, clients, devis, commandesClient } = useCRM();
  const fcCols = useTableColumns<FCColKey>('factures_client_table', FC_COLS.map(c => c.key));

  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [filterStatut, setFilterStatut] = useState<string>('tous');
  const [viewMode, setViewMode] = useState<ViewMode>('toutes');
  const [colFilters, setColFilters] = useState<Partial<Record<FCColKey, string>>>({});
  const [openFilterCols, setOpenFilterCols] = useState<Set<FCColKey>>(new Set());
  const [visCols, setVisCols] = useState<Set<FCColKey>>(() => {
    try { const s = localStorage.getItem('factures_client_visible'); if (s) return new Set(JSON.parse(s) as FCColKey[]); } catch { /* ignore */ }
    return new Set(FC_COLS.map(c => c.key));
  });
  function toggleVisCol(k: FCColKey) { setVisCols(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); try { localStorage.setItem('factures_client_visible', JSON.stringify([...n])); } catch { /* ignore */ } return n; }); }
  function exportFC() {
    exportToExcel(filtered.map(f => { const cl = clients.find(x => x.id === f.clientId); return { 'N°': f.numero, Type: f.estProforma ? 'Proforma' : 'Facture', Client: cl?.nom || '', Société: cl?.societe || '', 'Réf. Affaire': f.referenceAffaire || '', Date: f.dateCreation, Échéance: f.dateEcheance || '', Paiement: f.datePaiement || '', 'Total TTC': f.totalTTC, Statut: STATUTS_FACTURE_CLIENT[f.statut]?.label || f.statut }; }), 'factures_client', 'Factures'); }
  function toggleFilterCol(col: FCColKey) {
    setOpenFilterCols(prev => { const n = new Set(prev); if (n.has(col)) { n.delete(col); setColFilters(f => { const nf = { ...f }; delete nf[col]; return nf; }); } else n.add(col); return n; });
  }
  function setColFilter(col: FCColKey, v: string) { setColFilters(prev => ({ ...prev, [col]: v })); }
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [paiementDialogOpen, setPaiementDialogOpen] = useState(false);
  const [paiementFacture, setPaiementFacture] = useState<FactureClient | null>(null);
  const [paiementDate, setPaiementDate] = useState('');
  const [convertConfirmOpen, setConvertConfirmOpen] = useState(false);
  const [convertTarget, setConvertTarget] = useState<FactureClient | null>(null);

  // Form state
  const [estProforma, setEstProforma] = useState(false);
  const [clientId, setClientId] = useState('');
  const [devisId, setDevisId] = useState('');
  const [numero, setNumero] = useState('');
  const [dateCreation, setDateCreation] = useState(new Date().toISOString().split('T')[0]);
  const [dateEcheance, setDateEcheance] = useState('');
  const [statut, setStatut] = useState<StatutFactureClient>('brouillon');
  const [referenceAffaire, setReferenceAffaire] = useState('');
  const [notes, setNotes] = useState('');

  function nextNumero(proforma: boolean) {
    const year = new Date().getFullYear();
    const prefix = proforma ? `PRO-${year}` : `FAC-${year}`;
    const n = facturesClient.filter(f => f.numero.startsWith(prefix)).length + 1;
    return `${prefix}-${String(n).padStart(3, '0')}`;
  }

  function resetForm(proforma = false) {
    setEstProforma(proforma);
    setClientId('');
    setDevisId('');
    setNumero(nextNumero(proforma));
    setDateCreation(new Date().toISOString().split('T')[0]);
    setDateEcheance('');
    setStatut('brouillon');
    setReferenceAffaire('');
    setNotes('');
    setEditingId(null);
  }

  function openNew(proforma = false) {
    resetForm(proforma);
    setDialogOpen(true);
  }

  function openEdit(f: FactureClient) {
    setEditingId(f.id);
    setEstProforma(f.estProforma ?? false);
    setClientId(f.clientId);
    setDevisId(f.devisId || '');
    setNumero(f.numero);
    setDateCreation(f.dateCreation);
    setDateEcheance(f.dateEcheance || '');
    setStatut(f.statut);
    setReferenceAffaire(f.referenceAffaire || '');
    setNotes(f.notes || '');
    setDialogOpen(true);
  }

  function save() {
    if (!clientId) { toast.error('Sélectionnez un client'); return; }

    const linkedDevis = devisId ? devis.find(d => d.id === devisId) : null;
    const lignes: LigneDevis[] = linkedDevis ? linkedDevis.lignes : [];
    const fraisPortHT = linkedDevis?.fraisPortHT ?? 0;
    const fraisPortTVA = linkedDevis?.fraisPortTVA ?? 20;
    const total = linkedDevis
      ? calculerTotalDevis(lignes, fraisPortHT, fraisPortTVA)
      : { totalHT: 0, totalTVA: 0, totalTTC: 0 };

    const linkedCC = commandesClient.find(cc => cc.devisId === devisId && devisId);

    if (editingId) {
      updateFacturesClient(prev => prev.map(f => f.id === editingId ? {
        ...f, clientId, devisId: devisId || undefined, commandeClientId: linkedCC?.id,
        numero, dateCreation, dateEcheance: dateEcheance || undefined, statut,
        lignes, totalHT: total.totalHT, totalTVA: total.totalTVA, totalTTC: total.totalTTC,
        fraisPortHT, referenceAffaire: referenceAffaire || undefined, notes: notes || undefined,
        estProforma,
      } : f));
      toast.success(estProforma ? 'Proforma modifiée' : 'Facture modifiée');
    } else {
      const newFacture: FactureClient = {
        id: generateId(), clientId, devisId: devisId || undefined, commandeClientId: linkedCC?.id,
        numero, dateCreation, dateEcheance: dateEcheance || undefined, statut,
        lignes, totalHT: total.totalHT, totalTVA: total.totalTVA, totalTTC: total.totalTTC,
        fraisPortHT, referenceAffaire: referenceAffaire || undefined, notes: notes || undefined,
        estProforma,
      };
      updateFacturesClient(prev => [...prev, newFacture]);
      toast.success(estProforma ? 'Proforma créée' : 'Facture créée');
    }
    setDialogOpen(false);
  }

  function updateStatut(id: string, s: StatutFactureClient) {
    updateFacturesClient(prev => prev.map(f => f.id === id ? { ...f, statut: s } : f));
    toast.success(`Statut → ${STATUTS_FACTURE_CLIENT[s].label}`);
  }

  function openPaiement(f: FactureClient) {
    setPaiementFacture(f);
    setPaiementDate(new Date().toISOString().split('T')[0]);
    setPaiementDialogOpen(true);
  }

  function savePaiement() {
    if (!paiementFacture || !paiementDate) return;
    updateFacturesClient(prev => prev.map(f => f.id === paiementFacture.id
      ? { ...f, statut: 'payée' as StatutFactureClient, datePaiement: paiementDate }
      : f));
    toast.success(`Facture ${paiementFacture.numero} marquée payée`);
    setPaiementDialogOpen(false);
    setPaiementFacture(null);
  }

  // Convertir une proforma en vraie facture
  function confirmConvert() {
    if (!convertTarget) return;
    const year = new Date().getFullYear();
    const n = facturesClient.filter(f => f.numero.startsWith(`FAC-${year}`) && !f.estProforma).length + 1;
    const newNumero = `FAC-${year}-${String(n).padStart(3, '0')}`;
    updateFacturesClient(prev => prev.map(f => f.id === convertTarget.id
      ? { ...f, estProforma: false, numero: newNumero, statut: 'brouillon' as StatutFactureClient }
      : f));
    toast.success(`Proforma ${convertTarget.numero} convertie → ${newNumero}`);
    setConvertConfirmOpen(false);
    setConvertTarget(null);
  }

  function confirmDelete() {
    if (!deleteTargetId) return;
    updateFacturesClient(prev => prev.filter(f => f.id !== deleteTargetId));
    toast.success('Document supprimé');
    setDeleteConfirmOpen(false);
  }

  // Données filtrées selon le mode de vue
  const baseList = facturesClient.filter(f => {
    if (viewMode === 'factures') return !f.estProforma;
    if (viewMode === 'proformas') return f.estProforma;
    return true;
  });

  const filtered = baseList
    .filter(f => {
      if (filterStatut !== 'tous' && f.statut !== filterStatut) return false;
      const client = clients.find(c => c.id === f.clientId);
      for (const [k, v] of Object.entries(colFilters)) {
        if (!v) continue;
        const lv = v.toLowerCase();
        switch (k as FCColKey) {
          case 'numero': if (!f.numero.toLowerCase().includes(lv)) return false; break;
          case 'client': if (!`${client?.nom || ''} ${client?.societe || ''}`.toLowerCase().includes(lv)) return false; break;
          case 'ref': if (!(f.referenceAffaire || '').toLowerCase().includes(lv)) return false; break;
          case 'date': if (!matchDateFilter(v, f.dateCreation)) return false; break;
          case 'echeance': if (!matchDateFilter(v, f.dateEcheance)) return false; break;
          case 'paiement': if (!matchDateFilter(v, f.datePaiement)) return false; break;
          case 'total': if (!matchAmountFilter(v, f.totalTTC)) return false; break;
        }
      }
      if (!search) return true;
      const s = search.toLowerCase();
      return f.numero.toLowerCase().includes(s) ||
        client?.nom.toLowerCase().includes(s) ||
        client?.societe?.toLowerCase().includes(s) ||
        f.referenceAffaire?.toLowerCase().includes(s);
    })
    .sort((a, b) => b.dateCreation.localeCompare(a.dateCreation));

  const fcNumeros = useMemo(() => facturesClient.map(f => f.numero).filter(Boolean), [facturesClient]);
  const fcClients = useMemo(() => facturesClient.map(f => { const cl = clients.find(x => x.id === f.clientId); return cl?.societe || cl?.nom || ''; }).filter(Boolean), [facturesClient, clients]);
  const fcRefs = useMemo(() => facturesClient.map(f => f.referenceAffaire || '').filter(Boolean), [facturesClient]);

  function renderFCFilter(key: FCColKey) {
    const v = colFilters[key] || '';
    switch (key) {
      case 'numero': return <FilterSuggestInput value={v} onChange={x => setColFilter(key, x)} suggestions={fcNumeros} placeholder="N°…" />;
      case 'client': return <FilterSuggestInput value={v} onChange={x => setColFilter(key, x)} suggestions={fcClients} placeholder="Client…" />;
      case 'ref': return <FilterSuggestInput value={v} onChange={x => setColFilter(key, x)} suggestions={fcRefs} placeholder="Réf…" />;
      case 'date': case 'echeance': case 'paiement': return <FilterDateInput value={v} onChange={x => setColFilter(key, x)} />;
      case 'total': return <FilterAmountInput value={v} onChange={x => setColFilter(key, x)} />;
      default: return null;
    }
  }
  function fcChipText(key: FCColKey, v: string): string {
    if (key === 'total') { const { op, n1, n2 } = parseAmountFilter(v); if (!op) return v; return op === 'between' ? `${n1}–${n2} €` : `${({ eq: '=', lt: '<', gt: '>' } as Record<string, string>)[op] || ''} ${n1} €`; }
    if (key === 'date' || key === 'echeance' || key === 'paiement') { const { op, d1, d2 } = parseDateFilter(v); if (!op) return v; const fmt = (s: string) => s ? formatDate(s) : '…'; return op === 'between' ? `${fmt(d1)}–${fmt(d2)}` : `${({ eq: 'Le', before: 'Avant', after: 'Après' } as Record<string, string>)[op] || ''} ${fmt(d1)}`; }
    return v;
  }

  // Stats globales
  const factures = facturesClient.filter(f => !f.estProforma);
  const proformas = facturesClient.filter(f => f.estProforma);
  const totalEnvoye = factures.filter(f => f.statut === 'envoyée').reduce((s, f) => s + f.totalTTC, 0);
  const totalPaye = factures.filter(f => f.statut === 'payée').reduce((s, f) => s + f.totalTTC, 0);
  const enRetard = factures.filter(f => f.statut === 'envoyée' && f.dateEcheance && new Date(f.dateEcheance) < new Date());

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card text-center">
          <Receipt className="w-5 h-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-heading font-bold">{factures.length}</p>
          <p className="text-xs text-muted-foreground">Factures</p>
        </div>
        <div className="stat-card text-center">
          <FileText className="w-5 h-5 mx-auto text-amber-500 mb-1" />
          <p className="text-2xl font-heading font-bold">{proformas.length}</p>
          <p className="text-xs text-muted-foreground">Proformas</p>
        </div>
        <div className="stat-card text-center">
          <Euro className="w-5 h-5 mx-auto text-info mb-1" />
          <p className="text-lg font-heading font-bold">{formatMontant(totalEnvoye)}</p>
          <p className="text-xs text-muted-foreground">En attente</p>
        </div>
        <div className="stat-card text-center">
          <CheckCircle2 className="w-5 h-5 mx-auto text-emerald-600 mb-1" />
          <p className="text-lg font-heading font-bold">{formatMontant(totalPaye)}</p>
          <p className="text-xs text-muted-foreground">Encaissé</p>
        </div>
      </div>

      {/* Mode de vue + actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {([['toutes', 'Toutes'], ['factures', 'Factures'], ['proformas', 'Proformas']] as [ViewMode, string][]).map(([mode, label]) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === mode ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <PageHeaderSlot>
        <div className="relative w-32 sm:w-48 md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher client, numéro..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="ml-auto flex gap-2 items-center shrink-0">
          <Button onClick={() => openNew(true)} size="sm" variant="outline" className="border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950">
            <FileText className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Proforma</span>
          </Button>
          <Button onClick={() => openNew(false)} size="sm">
            <Plus className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Facture</span>
          </Button>
        </div>
      </PageHeaderSlot>

      {/* Filtre statut */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFilterStatut('tous')} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filterStatut === 'tous' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
            Tous
          </button>
          {allStatuts.map(s => (
            <button key={s} onClick={() => setFilterStatut(s)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filterStatut === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
              {STATUTS_FACTURE_CLIENT[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtres actifs */}
      {Object.values(colFilters).some(v => v) && (
        <div className="flex items-center gap-2 flex-wrap rounded-lg border border-border bg-card px-4 py-2">
          <span className="text-xs text-muted-foreground">Filtres actifs :</span>
          {(Object.entries(colFilters).filter(([, v]) => v) as [FCColKey, string][]).map(([k, v]) => (
            <span key={k} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
              {FC_COLS.find(c => c.key === k)?.label} : {fcChipText(k, v)}
              <button onClick={() => setColFilter(k, '')}><X className="w-3 h-3" /></button>
            </span>
          ))}
          <button onClick={() => { setColFilters({}); setOpenFilterCols(new Set()); }} className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"><X className="w-3 h-3" /> Effacer</button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto max-h-[calc(100vh-9rem)] rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {fcCols.ordered(FC_COLS, k => visCols.has(k)).map(col => {
                const isDragOver = fcCols.dragOverKey === col.key && fcCols.dragKey !== col.key;
                const filterable = col.key !== 'statut';
                const hasFilter = !!colFilters[col.key];
                const isFilterOpen = openFilterCols.has(col.key);
                const alignRight = col.cls.includes('text-right');
                return (
                  <th key={col.key} {...fcCols.thProps(col.key)} style={fcCols.widthStyle(col.key)} className={`relative py-3 px-4 font-medium text-muted-foreground select-none whitespace-nowrap cursor-grab active:cursor-grabbing sticky top-0 z-10 ${col.cls} ${isDragOver ? 'bg-primary/10' : fcCols.dragKey === col.key ? 'bg-muted opacity-40' : 'bg-muted'}`}>
                    {isDragOver && <span className="absolute top-0 left-0 h-full w-0.5 bg-primary z-20" />}
                    <div className={`flex items-center gap-0.5 ${alignRight ? 'justify-end' : ''}`}>
                      <span className="truncate">{col.label}</span>
                      {filterable && (
                        isFilterOpen ? (
                          <span className="font-normal inline-flex items-center gap-0.5 min-w-0" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} draggable={false}>
                            {renderFCFilter(col.key)}
                            <button onClick={() => toggleFilterCol(col.key)} title="Fermer le filtre" className="p-0.5 rounded hover:bg-muted/80 text-muted-foreground/60 shrink-0"><X className="w-3 h-3" /></button>
                          </span>
                        ) : (
                          <button onClick={() => toggleFilterCol(col.key)} title="Filtrer" className={`p-0.5 rounded hover:bg-muted/80 transition-colors shrink-0 ${hasFilter ? 'text-primary' : 'text-muted-foreground/25 hover:text-muted-foreground/60'}`}><Filter className="w-3 h-3" /></button>
                        )
                      )}
                    </div>
                    <ColResizeHandle {...fcCols.resizeHandleProps(col.key)} />
                  </th>
                );
              })}
              <th className="text-right py-2 px-2 font-medium text-muted-foreground sticky top-0 z-10 bg-muted whitespace-nowrap">
                <TableGearMenu cols={FC_COLS} visible={visCols} onToggle={toggleVisCol} onExport={exportFC} />
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => {
              const client = clients.find(c => c.id === f.clientId);
              const dv = f.devisId ? devis.find(d => d.id === f.devisId) : undefined;
              const cc = f.commandeClientId ? commandesClient.find(c => c.id === f.commandeClientId) : undefined;
              const statutInfo = STATUTS_FACTURE_CLIENT[f.statut];
              const isOverdue = f.statut === 'envoyée' && f.dateEcheance && new Date(f.dateEcheance) < new Date();
              const renderFC = (key: FCColKey) => {
                const ws = fcCols.widthStyle(key);
                const col = FC_COLS.find(c => c.key === key)!;
                const base = `py-3 px-4 ${col.cls}`;
                switch (key) {
                  case 'numero': return <td style={ws} className={base}><div className="flex items-center gap-1.5"><span className="font-mono text-xs font-semibold">{f.numero}</span>{f.estProforma && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 font-bold tracking-wide">PROFORMA</span>}</div></td>;
                  case 'client': return <td style={ws} className={base}><div className="font-medium truncate">{client?.nom || '—'}</div>{client?.societe && <div className="text-xs text-muted-foreground truncate">{client.societe}</div>}</td>;
                  case 'ref': return <td style={ws} className={base}><div className="text-xs text-muted-foreground">{f.referenceAffaire || ''}</div><div className="flex items-center gap-1 flex-wrap mt-0.5">{dv && <button onClick={() => navigate(`/devis?search=${encodeURIComponent(dv.numero)}`)} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-success/10 text-success font-medium hover:bg-success/20"><FileText className="w-2.5 h-2.5" />{dv.numero}</button>}{cc && <button onClick={() => navigate(`/commandes-client?search=${encodeURIComponent(cc.numero)}`)} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium hover:bg-primary/20">{cc.numero}</button>}</div></td>;
                  case 'date': return <td style={ws} className={`${base} text-muted-foreground text-xs`}>{formatDate(f.dateCreation)}</td>;
                  case 'echeance': return <td style={ws} className={base}>{f.dateEcheance ? <span className={`text-xs font-medium ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>{formatDate(f.dateEcheance)}{isOverdue && <span className="block text-[10px]">Échu</span>}</span> : <span className="text-muted-foreground text-xs">—</span>}</td>;
                  case 'paiement': return <td style={ws} className={`${base} text-xs text-muted-foreground`}>{f.datePaiement ? formatDate(f.datePaiement) : '—'}</td>;
                  case 'total': return <td style={ws} className={`${base} font-semibold`}>{formatMontant(f.totalTTC)}</td>;
                  case 'statut': return <td style={ws} className={base}>{f.estProforma ? <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 font-medium">{STATUTS_FACTURE_CLIENT[f.statut].label}</span> : <select value={f.statut} onChange={e => updateStatut(f.id, e.target.value as StatutFactureClient)} className={`text-xs font-medium px-2 py-1 rounded cursor-pointer border-0 ${statutInfo.color}`}>{allStatuts.map(s => <option key={s} value={s}>{STATUTS_FACTURE_CLIENT[s].label}</option>)}</select>}</td>;
                  default: return <td style={ws} className={base} />;
                }
              };
              return (
                <tr key={f.id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${f.estProforma ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}`}>
                  {fcCols.ordered(FC_COLS, k => visCols.has(k)).map(col => <Fragment key={col.key}>{renderFC(col.key)}</Fragment>)}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {f.estProforma && (
                        <button
                          onClick={() => { setConvertTarget(f); setConvertConfirmOpen(true); }}
                          className="p-1.5 rounded hover:bg-muted" title="Convertir en facture"
                        >
                          <ArrowRight className="w-4 h-4 text-amber-600" />
                        </button>
                      )}
                      {!f.estProforma && f.statut !== 'payée' && (
                        <button onClick={() => openPaiement(f)} className="p-1.5 rounded hover:bg-muted" title="Marquer payée">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        </button>
                      )}
                      <button onClick={() => openEdit(f)} className="p-1.5 rounded hover:bg-muted" title="Modifier">
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => { setDeleteTargetId(f.id); setDeleteConfirmOpen(true); }} className="p-1.5 rounded hover:bg-destructive/10" title="Supprimer">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-muted-foreground">
                  {viewMode === 'proformas' ? 'Aucune facture proforma' : viewMode === 'factures' ? 'Aucune facture' : 'Aucun document'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) setEditingId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {estProforma
                ? <><FileText className="w-4 h-4 text-amber-500" />{editingId ? `Modifier proforma — ${numero}` : 'Nouvelle facture proforma'}</>
                : <><Receipt className="w-4 h-4" />{editingId ? `Modifier — ${numero}` : 'Nouvelle facture client'}</>
              }
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Toggle proforma */}
            {!editingId && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                <span className="text-sm font-medium flex-1">Type de document</span>
                <div className="flex gap-1 p-0.5 bg-background rounded-md border border-border">
                  <button onClick={() => { setEstProforma(false); setNumero(nextNumero(false)); }}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${!estProforma ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    Facture
                  </button>
                  <button onClick={() => { setEstProforma(true); setNumero(nextNumero(true)); }}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${estProforma ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                    Proforma
                  </button>
                </div>
              </div>
            )}
            <div>
              <Label>Client *</Label>
              <ClientCombobox clients={clients} value={clientId} onSelect={setClientId} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Numéro</Label>
                <Input value={numero} onChange={e => setNumero(e.target.value)} />
              </div>
              {!estProforma && (
                <div>
                  <Label>Statut</Label>
                  <select value={statut} onChange={e => setStatut(e.target.value as StatutFactureClient)}
                    className="w-full text-sm rounded-md border border-input bg-background px-3 py-2">
                    {allStatuts.map(s => <option key={s} value={s}>{STATUTS_FACTURE_CLIENT[s].label}</option>)}
                  </select>
                </div>
              )}
              {estProforma && (
                <div>
                  <Label>Statut</Label>
                  <select value={statut} onChange={e => setStatut(e.target.value as StatutFactureClient)}
                    className="w-full text-sm rounded-md border border-input bg-background px-3 py-2">
                    {allStatuts.map(s => <option key={s} value={s}>{STATUTS_FACTURE_CLIENT[s].label}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={dateCreation} onChange={e => setDateCreation(e.target.value)} />
              </div>
              <div>
                <Label>Échéance</Label>
                <Input type="date" value={dateEcheance} onChange={e => setDateEcheance(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Devis lié</Label>
              <select value={devisId} onChange={e => setDevisId(e.target.value)}
                className="w-full text-sm rounded-md border border-input bg-background px-3 py-2">
                <option value="">— Aucun —</option>
                {devis.filter(d => !clientId || d.clientId === clientId).map(d => (
                  <option key={d.id} value={d.id}>{d.numero}{d.referenceAffaire ? ` — ${d.referenceAffaire}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Référence affaire</Label>
              <Input value={referenceAffaire} onChange={e => setReferenceAffaire(e.target.value)} />
            </div>
            <div>
              <Label>Notes</Label>
              <textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={save} className={estProforma ? 'bg-amber-500 hover:bg-amber-600' : ''}>
              {editingId ? 'Enregistrer' : estProforma ? 'Créer la proforma' : 'Créer la facture'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paiement Dialog */}
      <Dialog open={paiementDialogOpen} onOpenChange={setPaiementDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enregistrer le paiement</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Facture <strong>{paiementFacture?.numero}</strong> — {paiementFacture ? formatMontant(paiementFacture.totalTTC) : ''}</p>
            <div>
              <Label>Date de paiement</Label>
              <Input type="date" value={paiementDate} onChange={e => setPaiementDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaiementDialogOpen(false)}>Annuler</Button>
            <Button onClick={savePaiement} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="w-4 h-4 mr-2" />Marquer payée
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert proforma → facture */}
      <AlertDialog open={convertConfirmOpen} onOpenChange={setConvertConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convertir en facture ?</AlertDialogTitle>
            <AlertDialogDescription>
              La proforma <strong>{convertTarget?.numero}</strong> sera transformée en facture définitive avec un nouveau numéro FAC-…
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmConvert}>
              <ArrowRight className="w-4 h-4 mr-2" />Convertir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce document ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
