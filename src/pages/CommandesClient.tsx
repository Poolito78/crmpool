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
import { generateId, calculerTotalDevis, calculerTotalLigne, formatMontant, formatDate, formatDateISO, calculerDateEcheance, STATUTS_COMMANDE_CLIENT, type CommandeClient, type StatutCommandeClient, type LigneDevis, type FactureClient } from '@/lib/store';
import { DELAI_REGLEMENT_OPTIONS } from '@/pages/Clients';
import { Plus, Search, Trash2, Pencil, Eye, FileText, ShoppingCart, Send, Receipt, Mail, CalendarDays, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import ClientCombobox from '@/components/ClientCombobox';
import CommandeFournisseurDialog from '@/components/CommandeFournisseurDialog';
import CommandeEmailDialog from '@/components/CommandeEmailDialog';
import CommandeARDialog from '@/components/CommandeARDialog';
const allStatuts = Object.keys(STATUTS_COMMANDE_CLIENT) as StatutCommandeClient[];

type CCColKey = 'numero' | 'client' | 'ref' | 'date' | 'livraison' | 'echeance' | 'total' | 'statut';
const CC_COLS: { key: CCColKey; label: string; cls: string }[] = [
  { key: 'numero', label: 'N°', cls: 'text-left' },
  { key: 'client', label: 'Client', cls: 'text-left' },
  { key: 'ref', label: 'Réf. Affaire', cls: 'text-left hidden sm:table-cell' },
  { key: 'date', label: 'Date', cls: 'text-left hidden md:table-cell' },
  { key: 'livraison', label: 'Départ / Livraison', cls: 'text-left hidden lg:table-cell' },
  { key: 'echeance', label: 'Échéance', cls: 'text-left hidden lg:table-cell' },
  { key: 'total', label: 'Total HT', cls: 'text-right' },
  { key: 'statut', label: 'Statut', cls: 'text-center' },
];

export default function CommandesClient() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ccCols = useTableColumns<CCColKey>('commandes_client_table', CC_COLS.map(c => c.key));
  const { commandesClient, updateCommandesClient, clients, devis, produits, fournisseurs, produitFournisseurs, commandesFournisseur, updateCommandesFournisseur, facturesClient, updateFacturesClient } = useCRM();
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [filterStatut, setFilterStatut] = useState<string>('tous');
  const [filterProduit, setFilterProduit] = useState<string>('');
  const [colFilters, setColFilters] = useState<Partial<Record<CCColKey, string>>>({});
  const [openFilterCols, setOpenFilterCols] = useState<Set<CCColKey>>(new Set());
  const [visCols, setVisCols] = useState<Set<CCColKey>>(() => {
    try { const s = localStorage.getItem('commandes_client_visible'); if (s) return new Set(JSON.parse(s) as CCColKey[]); } catch { /* ignore */ }
    return new Set(CC_COLS.map(c => c.key));
  });
  function toggleVisCol(k: CCColKey) { setVisCols(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); try { localStorage.setItem('commandes_client_visible', JSON.stringify([...n])); } catch { /* ignore */ } return n; }); }
  function exportCC() {
    exportToExcel(filtered.map(c => { const cl = clients.find(x => x.id === c.clientId); return { 'N°': c.numero, Client: cl?.nom || '', Société: cl?.societe || '', 'Réf. Affaire': c.referenceAffaire || '', Date: c.dateCreation, 'Date départ': c.dateDepart || '', 'Date livraison': c.dateLivraisonPrevue || '', Échéance: c.dateEcheance || '', 'Total HT': c.totalHT, Statut: STATUTS_COMMANDE_CLIENT[c.statut]?.label || c.statut }; }), 'commandes_client', 'Commandes');
  }
  function toggleFilterCol(col: CCColKey) {
    setOpenFilterCols(prev => { const n = new Set(prev); if (n.has(col)) { n.delete(col); setColFilters(f => { const nf = { ...f }; delete nf[col]; return nf; }); } else n.add(col); return n; });
  }
  function setColFilter(col: CCColKey, v: string) { setColFilters(prev => ({ ...prev, [col]: v })); }
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [previewCommande, setPreviewCommande] = useState<CommandeClient | null>(null);

  // AR Dialog state (dates)
  const [arDialogOpen, setArDialogOpen] = useState(false);
  const [arCommande, setArCommande] = useState<CommandeClient | null>(null);
  const [arDateDepart, setArDateDepart] = useState('');
  const [arDateLivraison, setArDateLivraison] = useState('');
  // AR PDF + Email dialog
  const [arPdfDialogOpen, setArPdfDialogOpen] = useState(false);
  const [arPdfCommande, setArPdfCommande] = useState<CommandeClient | null>(null);
  const [arPdfDateDepart, setArPdfDateDepart] = useState('');
  const [arPdfDateLivraison, setArPdfDateLivraison] = useState('');

  // Facturer Dialog state
  const [factureDialogOpen, setFactureDialogOpen] = useState(false);
  const [factureCommande, setFactureCommande] = useState<CommandeClient | null>(null);
  const [factureLignesSelectees, setFactureLignesSelectees] = useState<string[]>([]);

  // Commande fournisseur dialog
  const [cmdFournisseurDevis, setCmdFournisseurDevis] = useState<any>(null);
  const [emailTarget, setEmailTarget] = useState<any>(null);

  // Form state
  const [clientId, setClientId] = useState('');
  const [devisId, setDevisId] = useState('');
  const [numero, setNumero] = useState('');
  const [dateCreation, setDateCreation] = useState(new Date().toISOString().split('T')[0]);
  const [statut, setStatut] = useState<StatutCommandeClient>('a_traiter');
  const [referenceAffaire, setReferenceAffaire] = useState('');
  const [notes, setNotes] = useState('');
  const [fraisPortHT, setFraisPortHT] = useState(0);
  const [adresseLivraisonId, setAdresseLivraisonId] = useState('');
  const [delaiReglement, setDelaiReglement] = useState('');
  const [dateLivraison, setDateLivraison] = useState('');

  function resetForm() {
    setClientId('');
    setDevisId('');
    setNumero(`CMD-${String(commandesClient.length + 1).padStart(4, '0')}`);
    setDateCreation(new Date().toISOString().split('T')[0]);
    setStatut('a_traiter');
    setReferenceAffaire('');
    setNotes('');
    setFraisPortHT(0);
    setAdresseLivraisonId('');
    setDelaiReglement('');
    setDateLivraison('');
    setEditingId(null);
  }

  function openNew() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(cmd: CommandeClient) {
    setEditingId(cmd.id);
    setClientId(cmd.clientId);
    setDevisId(cmd.devisId || '');
    setNumero(cmd.numero);
    setDateCreation(cmd.dateCreation);
    setStatut(cmd.statut);
    setReferenceAffaire(cmd.referenceAffaire || '');
    setNotes(cmd.notes || '');
    setFraisPortHT(cmd.fraisPortHT);
    setAdresseLivraisonId(cmd.adresseLivraisonId || '');
    setDelaiReglement(cmd.delaiReglement || '');
    setDateLivraison(cmd.dateLivraison || '');
    setDialogOpen(true);
  }

  function save() {
    if (!clientId) { toast.error('Sélectionnez un client'); return; }

    const linkedDevis = devisId ? devis.find(d => d.id === devisId) : null;
    const lignes = linkedDevis ? linkedDevis.lignes : [];
    const total = linkedDevis
      ? calculerTotalDevis(linkedDevis.lignes, fraisPortHT, linkedDevis.fraisPortTVA)
      : { totalHT: 0, totalTVA: 0, totalTTC: 0 };

    // Calculer la date d'échéance à partir de la date de livraison (ou création si absente)
    const baseEcheance = dateLivraison || dateCreation;
    const dateEcheance = delaiReglement
      ? formatDateISO(calculerDateEcheance(baseEcheance, delaiReglement))
      : undefined;

    if (editingId) {
      updateCommandesClient(prev => prev.map(c => c.id === editingId ? {
        ...c, clientId, devisId: devisId || undefined, numero, dateCreation, statut,
        lignes, totalHT: total.totalHT, totalTVA: total.totalTVA, totalTTC: total.totalTTC,
        fraisPortHT, referenceAffaire: referenceAffaire || undefined, notes: notes || undefined,
        adresseLivraisonId: adresseLivraisonId || undefined,
        delaiReglement: delaiReglement || undefined,
        dateLivraison: dateLivraison || undefined,
        dateEcheance,
      } : c));
      toast.success('Commande modifiée');
    } else {
      const newCmd: CommandeClient = {
        id: generateId(), clientId, devisId: devisId || undefined, numero, dateCreation, statut,
        lignes, totalHT: total.totalHT, totalTVA: total.totalTVA, totalTTC: total.totalTTC,
        fraisPortHT, referenceAffaire: referenceAffaire || undefined, notes: notes || undefined,
        adresseLivraisonId: adresseLivraisonId || undefined,
        delaiReglement: delaiReglement || undefined,
        dateLivraison: dateLivraison || undefined,
        dateEcheance,
      };
      updateCommandesClient(prev => [...prev, newCmd]);
      toast.success('Commande créée');
    }
    setDialogOpen(false);
  }

  function updateStatut(id: string, newStatut: StatutCommandeClient) {
    updateCommandesClient(prev => prev.map(c => c.id === id ? { ...c, statut: newStatut } : c));
    toast.success(`Statut → ${STATUTS_COMMANDE_CLIENT[newStatut].label}`);
  }

  function confirmDelete() {
    if (!deleteTargetId) return;
    updateCommandesClient(prev => prev.filter(c => c.id !== deleteTargetId));
    toast.success('Commande supprimée');
    setDeleteConfirmOpen(false);
  }

  // ---- Action: Commande Fournisseur ----
  function openCmdFournisseur(cmd: CommandeClient) {
    if (!cmd.devisId) {
      toast.error('Aucun devis associé à cette commande');
      return;
    }
    const linkedDevis = devis.find(d => d.id === cmd.devisId);
    if (!linkedDevis) {
      toast.error('Devis introuvable');
      return;
    }
    setCmdFournisseurDevis(linkedDevis);
  }

  function openEmailFacture(cmd: CommandeClient) {
    const client = clients.find(c => c.id === cmd.clientId);
    if (!client) { toast.error('Client introuvable'); return; }
    setEmailTarget({ type: 'facture', commande: cmd, contact: client });
  }

  // ---- Action: Envoi AR ----
  function openArDialog(cmd: CommandeClient) {
    setArCommande(cmd);
    setArDateDepart(cmd.dateDepart || new Date().toISOString().split('T')[0]);
    setArDateLivraison(cmd.dateLivraisonPrevue || '');
    setArDialogOpen(true);
  }

  function saveAr() {
    if (!arCommande) return;
    if (!arDateDepart) { toast.error('Renseignez la date de départ'); return; }
    if (!arDateLivraison) { toast.error('Renseignez la date de livraison prévue'); return; }
    // Mettre à jour les dates sur la commande
    updateCommandesClient(prev => prev.map(c => c.id === arCommande.id ? {
      ...c,
      dateDepart: arDateDepart,
      dateLivraisonPrevue: arDateLivraison,
    } : c));
    setArDialogOpen(false);
    // Ouvrir le dialog PDF/email pour l'AR
    setArPdfCommande(arCommande);
    setArPdfDateDepart(arDateDepart);
    setArPdfDateLivraison(arDateLivraison);
    setArPdfDialogOpen(true);
    setArCommande(null);
  }

  function handleArSent() {
    // Marquer la commande comme AR envoyé après l'envoi Outlook
    if (!arPdfCommande) return;
    updateCommandesClient(prev => prev.map(c => c.id === arPdfCommande.id
      ? { ...c, statut: 'accuse_envoye' as StatutCommandeClient }
      : c
    ));
    toast.success(`AR envoyé — départ ${formatDate(arPdfDateDepart)}, livraison prévue ${formatDate(arPdfDateLivraison)}`);
  }

  // ---- Action: Facturer ----
  function openFactureDialog(cmd: CommandeClient) {
    setFactureCommande(cmd);
    setFactureLignesSelectees(cmd.lignes.map(l => l.id));
    setFactureDialogOpen(true);
  }

  function toggleLigneFacture(ligneId: string) {
    setFactureLignesSelectees(prev =>
      prev.includes(ligneId) ? prev.filter(id => id !== ligneId) : [...prev, ligneId]
    );
  }

  function saveFacture() {
    if (!factureCommande) return;
    if (factureLignesSelectees.length === 0) {
      toast.error('Sélectionnez au moins un produit à facturer');
      return;
    }
    // Marquer la commande comme facturée
    updateCommandesClient(prev => prev.map(c => c.id === factureCommande.id ? {
      ...c, statut: 'facture' as StatutCommandeClient,
    } : c));

    // Créer une FactureClient liée
    const year = new Date().getFullYear();
    const today = new Date().toISOString().split('T')[0];
    const nFac = facturesClient.filter(f => f.numero.startsWith(`FAC-${year}`)).length + 1;
    const lignesFacturees = factureCommande.lignes.filter(l => factureLignesSelectees.includes(l.id));
    const total = calculerTotalDevis(lignesFacturees, factureCommande.fraisPortHT, 20);

    // Échéance calculée sur la date de livraison (ou aujourd'hui si absente) + délai de règlement
    const baseDateEcheance = factureCommande.dateLivraison || factureCommande.dateLivraisonPrevue || today;
    const dateEcheanceFacture = factureCommande.delaiReglement
      ? formatDateISO(calculerDateEcheance(baseDateEcheance, factureCommande.delaiReglement))
      : undefined;

    const newFacture: FactureClient = {
      id: generateId(),
      numero: `FAC-${year}-${String(nFac).padStart(3, '0')}`,
      clientId: factureCommande.clientId,
      commandeClientId: factureCommande.id,
      devisId: factureCommande.devisId,
      dateCreation: today,
      statut: 'brouillon',
      lignes: lignesFacturees,
      totalHT: total.totalHT,
      totalTVA: total.totalTVA,
      totalTTC: total.totalTTC,
      fraisPortHT: factureCommande.fraisPortHT,
      referenceAffaire: factureCommande.referenceAffaire,
      dateEcheance: dateEcheanceFacture,
    };
    updateFacturesClient(prev => [...prev, newFacture]);

    toast.success(`Facture ${newFacture.numero} créée`, {
      description: `Commande ${factureCommande.numero} — ${factureLignesSelectees.length} produit(s)`,
      action: { label: 'Voir factures', onClick: () => navigate('/factures-client') },
    });
    setFactureDialogOpen(false);
    setFactureCommande(null);
  }

  const filtered = commandesClient
    .filter(c => {
      if (filterStatut !== 'tous' && c.statut !== filterStatut) return false;
      if (filterProduit.trim()) {
        const fp = filterProduit.trim().toLowerCase();
        const inLignes = c.lignes.some(l => {
          if (l.description?.toLowerCase().includes(fp)) return true;
          const p = l.produitId ? produits.find(pr => pr.id === l.produitId) : null;
          return p && (p.reference.toLowerCase().includes(fp) || p.description.toLowerCase().includes(fp));
        });
        if (!inLignes) return false;
      }
      const client = clients.find(cl => cl.id === c.clientId);
      // Filtres de colonne
      for (const [k, v] of Object.entries(colFilters)) {
        if (!v) continue;
        const lv = v.toLowerCase();
        switch (k as CCColKey) {
          case 'numero': if (!c.numero.toLowerCase().includes(lv)) return false; break;
          case 'client': if (!`${client?.nom || ''} ${client?.societe || ''}`.toLowerCase().includes(lv)) return false; break;
          case 'ref': if (!(c.referenceAffaire || '').toLowerCase().includes(lv)) return false; break;
          case 'date': if (!matchDateFilter(v, c.dateCreation)) return false; break;
          case 'livraison': if (!matchDateFilter(v, c.dateLivraisonPrevue || c.dateDepart)) return false; break;
          case 'echeance': if (!matchDateFilter(v, c.dateEcheance)) return false; break;
          case 'total': if (!matchAmountFilter(v, c.totalHT)) return false; break;
        }
      }
      if (!search) return true;
      const s = search.toLowerCase();
      return c.numero.toLowerCase().includes(s) ||
        client?.nom.toLowerCase().includes(s) ||
        client?.societe?.toLowerCase().includes(s) ||
        c.referenceAffaire?.toLowerCase().includes(s);
    })
    .sort((a, b) => b.dateCreation.localeCompare(a.dateCreation));

  // Suggestions pour les filtres texte
  const ccNumeros = useMemo(() => commandesClient.map(c => c.numero).filter(Boolean), [commandesClient]);
  const ccClients = useMemo(() => commandesClient.map(c => { const cl = clients.find(x => x.id === c.clientId); return cl?.societe || cl?.nom || ''; }).filter(Boolean), [commandesClient, clients]);
  const ccRefs = useMemo(() => commandesClient.map(c => c.referenceAffaire || '').filter(Boolean), [commandesClient]);

  // Contrôle de filtre inline par colonne
  function renderCCFilter(key: CCColKey) {
    const v = colFilters[key] || '';
    switch (key) {
      case 'numero': return <FilterSuggestInput value={v} onChange={x => setColFilter(key, x)} suggestions={ccNumeros} placeholder="N°…" />;
      case 'client': return <FilterSuggestInput value={v} onChange={x => setColFilter(key, x)} suggestions={ccClients} placeholder="Client…" />;
      case 'ref': return <FilterSuggestInput value={v} onChange={x => setColFilter(key, x)} suggestions={ccRefs} placeholder="Réf…" />;
      case 'date': case 'livraison': case 'echeance': return <FilterDateInput value={v} onChange={x => setColFilter(key, x)} />;
      case 'total': return <FilterAmountInput value={v} onChange={x => setColFilter(key, x)} />;
      default: return null;
    }
  }

  // Résumé court d'un filtre pour les chips « Filtres actifs »
  function ccChipText(key: CCColKey, v: string): string {
    if (key === 'total') { const { op, n1, n2 } = parseAmountFilter(v); if (!op) return v; return op === 'between' ? `${n1}–${n2} €` : `${({ eq: '=', lt: '<', gt: '>' } as Record<string, string>)[op] || ''} ${n1} €`; }
    if (key === 'date' || key === 'livraison' || key === 'echeance') { const { op, d1, d2 } = parseDateFilter(v); if (!op) return v; const fmt = (s: string) => s ? formatDate(s) : '…'; return op === 'between' ? `${fmt(d1)}–${fmt(d2)}` : `${({ eq: 'Le', before: 'Avant', after: 'Après' } as Record<string, string>)[op] || ''} ${fmt(d1)}`; }
    return v;
  }

  return (
    <div className="space-y-4">
      <PageHeaderSlot>
        <div className="relative w-32 sm:w-48 md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher client, numéro..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="ml-auto flex gap-2 items-center shrink-0">
          <Button onClick={openNew} size="sm"><Plus className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Nouvelle commande</span></Button>
        </div>
      </PageHeaderSlot>

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={filterProduit}
          onChange={e => setFilterProduit(e.target.value)}
          placeholder="Filtrer par produit..."
          className="text-sm rounded-md border border-input bg-background pl-8 pr-7 py-2 w-full focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {filterProduit && (
          <button onClick={() => setFilterProduit('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-base leading-none">×</button>
        )}
      </div>

      {/* Filter by status */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setFilterStatut('tous')} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filterStatut === 'tous' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
          Tous ({commandesClient.length})
        </button>
        {allStatuts.map(s => {
          const count = commandesClient.filter(c => c.statut === s).length;
          return (
            <button key={s} onClick={() => setFilterStatut(s)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filterStatut === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
              {STATUTS_COMMANDE_CLIENT[s].label} ({count})
            </button>
          );
        })}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {allStatuts.map(s => {
          const cmds = commandesClient.filter(c => c.statut === s);
          const total = cmds.reduce((acc, c) => acc + c.totalHT, 0);
          return (
            <div key={s} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{STATUTS_COMMANDE_CLIENT[s].label}</p>
              <p className="text-lg font-bold">{cmds.length}</p>
              <p className="text-xs text-muted-foreground">{formatMontant(total)}</p>
            </div>
          );
        })}
      </div>

      {/* Filtres actifs */}
      {Object.values(colFilters).some(v => v) && (
        <div className="flex items-center gap-2 flex-wrap rounded-lg border border-border bg-card px-4 py-2">
          <span className="text-xs text-muted-foreground">Filtres actifs :</span>
          {(Object.entries(colFilters).filter(([, v]) => v) as [CCColKey, string][]).map(([k, v]) => (
            <span key={k} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
              {CC_COLS.find(c => c.key === k)?.label} : {ccChipText(k, v)}
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
              {ccCols.ordered(CC_COLS, k => visCols.has(k)).map(col => {
                const isDragOver = ccCols.dragOverKey === col.key && ccCols.dragKey !== col.key;
                const filterable = col.key !== 'statut';
                const hasFilter = !!colFilters[col.key];
                const isFilterOpen = openFilterCols.has(col.key);
                const alignRight = col.cls.includes('text-right');
                return (
                  <th key={col.key} {...ccCols.thProps(col.key)} style={ccCols.widthStyle(col.key)} className={`relative py-3 px-4 font-medium text-muted-foreground select-none whitespace-nowrap cursor-grab active:cursor-grabbing sticky top-0 z-10 ${col.cls} ${isDragOver ? 'bg-primary/10' : ccCols.dragKey === col.key ? 'bg-muted opacity-40' : 'bg-muted'}`}>
                    {isDragOver && <span className="absolute top-0 left-0 h-full w-0.5 bg-primary z-20" />}
                    <div className={`flex items-center gap-0.5 ${alignRight ? 'justify-end' : ''}`}>
                      <span className="truncate">{col.label}</span>
                      {filterable && (
                        isFilterOpen ? (
                          <span className="font-normal inline-flex items-center gap-0.5 min-w-0" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} draggable={false}>
                            {renderCCFilter(col.key)}
                            <button onClick={() => toggleFilterCol(col.key)} title="Fermer le filtre" className="p-0.5 rounded hover:bg-muted/80 text-muted-foreground/60 shrink-0"><X className="w-3 h-3" /></button>
                          </span>
                        ) : (
                          <button onClick={() => toggleFilterCol(col.key)} title="Filtrer" className={`p-0.5 rounded hover:bg-muted/80 transition-colors shrink-0 ${hasFilter ? 'text-primary' : 'text-muted-foreground/25 hover:text-muted-foreground/60'}`}><Filter className="w-3 h-3" /></button>
                        )
                      )}
                    </div>
                    <ColResizeHandle {...ccCols.resizeHandleProps(col.key)} />
                  </th>
                );
              })}
              <th className="text-right py-2 px-2 font-medium text-muted-foreground sticky top-0 z-10 bg-muted whitespace-nowrap">
                <TableGearMenu cols={CC_COLS} visible={visCols} onToggle={toggleVisCol} onExport={exportCC} />
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(cmd => {
              const client = clients.find(c => c.id === cmd.clientId);
              const statutInfo = STATUTS_COMMANDE_CLIENT[cmd.statut];
              const isOverdue = cmd.dateEcheance && new Date(cmd.dateEcheance) < new Date() && cmd.statut === 'facture';
              const dvLie = cmd.devisId ? devis.find(d => d.id === cmd.devisId) : undefined;
              const cfLies = cmd.devisId ? commandesFournisseur.filter(cf => cf.devisId === cmd.devisId) : [];
              const facLies = facturesClient.filter(f => f.commandeClientId === cmd.id || (cmd.devisId && f.devisId === cmd.devisId));
              const renderCC = (key: CCColKey) => {
                const ws = ccCols.widthStyle(key);
                const col = CC_COLS.find(c => c.key === key)!;
                const base = `py-3 px-4 ${col.cls}`;
                switch (key) {
                  case 'numero': return <td style={ws} className={base}>
                    <div className="font-mono text-xs">{cmd.numero}</div>
                    {(dvLie || cfLies.length > 0 || facLies.length > 0) && (
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        {dvLie && <button onClick={() => navigate(`/devis?search=${encodeURIComponent(dvLie.numero)}`)} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-success/10 text-success font-medium hover:bg-success/20 transition-colors"><FileText className="w-2.5 h-2.5" />{dvLie.numero}</button>}
                        {cfLies.map(cf => <button key={cf.id} onClick={() => navigate(`/commandes?search=${encodeURIComponent(cf.numero)}`)} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-info/10 text-info font-medium hover:bg-info/20 transition-colors"><ShoppingCart className="w-2.5 h-2.5" />{cf.numero}</button>)}
                        {facLies.map(fac => <button key={fac.id} onClick={() => navigate(`/factures-client?search=${encodeURIComponent(fac.numero)}`)} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"><Receipt className="w-2.5 h-2.5" />{fac.numero}</button>)}
                      </div>
                    )}
                  </td>;
                  case 'client': return <td style={ws} className={base}><div className="font-medium truncate">{client?.nom || '—'}</div>{client?.societe && <div className="text-xs text-muted-foreground truncate">{client.societe}</div>}</td>;
                  case 'ref': return <td style={ws} className={`${base} text-muted-foreground`}>{cmd.referenceAffaire || '—'}</td>;
                  case 'date': return <td style={ws} className={`${base} text-muted-foreground`}>{formatDate(cmd.dateCreation)}</td>;
                  case 'livraison': return <td style={ws} className={base}>{cmd.dateDepart || cmd.dateLivraisonPrevue ? <div className="text-xs space-y-0.5">{cmd.dateDepart && <div className="text-muted-foreground">Départ: <span className="font-medium text-foreground">{formatDate(cmd.dateDepart)}</span></div>}{cmd.dateLivraisonPrevue && <div className="text-muted-foreground">Livr.: <span className="font-medium text-foreground">{formatDate(cmd.dateLivraisonPrevue)}</span></div>}</div> : <span className="text-muted-foreground text-xs">—</span>}</td>;
                  case 'echeance': return <td style={ws} className={base}>{cmd.dateEcheance ? <span className={`text-xs font-medium ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>{formatDate(cmd.dateEcheance)}{isOverdue && <span className="block text-[10px]">Échu</span>}</span> : <span className="text-muted-foreground text-xs">—</span>}</td>;
                  case 'total': return <td style={ws} className={`${base} font-medium`}>{formatMontant(cmd.totalHT)}</td>;
                  case 'statut': return <td style={ws} className={base}><select value={cmd.statut} onChange={e => updateStatut(cmd.id, e.target.value as StatutCommandeClient)} className={`text-xs font-medium px-2 py-1 rounded cursor-pointer border-0 ${statutInfo.color}`}>{allStatuts.map(s => <option key={s} value={s}>{STATUTS_COMMANDE_CLIENT[s].label}</option>)}</select></td>;
                  default: return <td style={ws} className={base} />;
                }
              };
              return (
                <tr key={cmd.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  {ccCols.ordered(CC_COLS, k => visCols.has(k)).map(col => <Fragment key={col.key}>{renderCC(col.key)}</Fragment>)}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      <button onClick={() => openCmdFournisseur(cmd)} className="p-1.5 rounded hover:bg-muted" title="Cmd Fournisseur">
                        <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => openArDialog(cmd)} className="p-1.5 rounded hover:bg-muted" title="Envoi AR + Dates">
                        <Send className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => openFactureDialog(cmd)} className="p-1.5 rounded hover:bg-muted" title="Facturer">
                        <Receipt className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => openEmailFacture(cmd)} className="p-1.5 rounded hover:bg-muted" title="Envoyer par email">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => setPreviewCommande(cmd)} className="p-1.5 rounded hover:bg-muted" title="Aperçu">
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => openEdit(cmd)} className="p-1.5 rounded hover:bg-muted" title="Modifier">
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => { setDeleteTargetId(cmd.id); setDeleteConfirmOpen(true); }} className="p-1.5 rounded hover:bg-destructive/10" title="Supprimer">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="py-12 text-center text-muted-foreground">Aucune commande client</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Modifier la commande' : 'Nouvelle commande client'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Client *</Label>
              <ClientCombobox clients={clients} value={clientId} onSelect={id => {
                setClientId(id);
                // Pré-remplir délai règlement depuis le client
                const cl = clients.find(c => c.id === id);
                if (cl?.delaiReglement) setDelaiReglement(cl.delaiReglement);
                // Réinitialiser l'adresse de livraison si le client change
                setAdresseLivraisonId('');
              }} />
            </div>
            <div>
              <Label>Devis associé</Label>
              <select value={devisId} onChange={e => {
                setDevisId(e.target.value);
                const d = devis.find(dv => dv.id === e.target.value);
                if (d) {
                  setClientId(d.clientId);
                  setReferenceAffaire(d.referenceAffaire || '');
                  setFraisPortHT(d.fraisPortHT || 0);
                  if (d.adresseLivraisonId) setAdresseLivraisonId(d.adresseLivraisonId);
                  const cl = clients.find(c => c.id === d.clientId);
                  if (cl?.delaiReglement) setDelaiReglement(cl.delaiReglement);
                }
              }} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— Aucun —</option>
                {devis.map(d => {
                  const cl = clients.find(c => c.id === d.clientId);
                  return <option key={d.id} value={d.id}>{d.numero} — {cl?.nom || '?'} ({d.statut})</option>;
                })}
              </select>
            </div>

            {/* ── Adresses ── */}
            {clientId && (() => {
              const cl = clients.find(c => c.id === clientId);
              if (!cl) return null;
              return (
                <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Adresses</p>
                  {/* Facturation — lecture seule */}
                  <div>
                    <Label className="text-xs">Adresse de facturation</Label>
                    <div className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground leading-relaxed">
                      {cl.societe && <div className="font-semibold text-foreground">{cl.societe}</div>}
                      <div>{cl.nom}</div>
                      {cl.adresse && <div>{cl.adresse}</div>}
                      <div>{cl.codePostal} {cl.ville}</div>
                    </div>
                  </div>
                  {/* Livraison — sélectable */}
                  <div>
                    <Label className="text-xs">Adresse de livraison</Label>
                    <select
                      value={adresseLivraisonId}
                      onChange={e => setAdresseLivraisonId(e.target.value)}
                      className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">— Même que facturation —</option>
                      {(cl.adressesLivraison || []).map(a => (
                        <option key={a.id} value={a.id}>
                          {a.libelle ? `${a.libelle} — ` : ''}{a.adresse}, {a.codePostal} {a.ville}
                        </option>
                      ))}
                    </select>
                    {adresseLivraisonId && (() => {
                      const adr = cl.adressesLivraison?.find(a => a.id === adresseLivraisonId);
                      if (!adr) return null;
                      return (
                        <div className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground leading-relaxed">
                          {adr.libelle && <div className="font-semibold text-foreground">{adr.libelle}</div>}
                          {adr.contact && <div>{adr.contact}</div>}
                          <div>{adr.adresse}</div>
                          <div>{adr.codePostal} {adr.ville}</div>
                          {adr.telephone && <div>{adr.telephone}</div>}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Numéro</Label>
                <Input value={numero} onChange={e => setNumero(e.target.value)} />
              </div>
              <div>
                <Label>Date commande</Label>
                <Input type="date" value={dateCreation} onChange={e => setDateCreation(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Date de livraison</Label>
              <Input type="date" value={dateLivraison} onChange={e => setDateLivraison(e.target.value)} />
              {dateLivraison && <p className="text-xs text-muted-foreground mt-1">Date réelle de livraison — sert de base au calcul de l'échéance paiement</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Statut</Label>
                <select value={statut} onChange={e => setStatut(e.target.value as StatutCommandeClient)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  {allStatuts.map(s => <option key={s} value={s}>{STATUTS_COMMANDE_CLIENT[s].label}</option>)}
                </select>
              </div>
              <div>
                <Label>Réf. Affaire</Label>
                <Input value={referenceAffaire} onChange={e => setReferenceAffaire(e.target.value)} />
              </div>
            </div>

            {/* ── Conditions de règlement ── */}
            <div className="space-y-1.5 rounded-lg border border-border p-3 bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conditions de règlement</p>
              <div className="flex items-center gap-3">
                <select
                  value={delaiReglement}
                  onChange={e => setDelaiReglement(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— Non défini —</option>
                  {DELAI_REGLEMENT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {delaiReglement && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    Échéance :{' '}
                    <span className="font-semibold text-foreground">
                      {formatDate(formatDateISO(calculerDateEcheance(dateLivraison || dateCreation, delaiReglement)))}
                    </span>
                    {!dateLivraison && <span className="text-[10px] ml-1 italic">(provisoire)</span>}
                  </span>
                )}
              </div>
              {delaiReglement && (
                <p className="text-xs text-muted-foreground italic">
                  {DELAI_REGLEMENT_OPTIONS.find(o => o.value === delaiReglement)?.conditions}
                </p>
              )}
            </div>

            <div>
              <Label>Frais de port HT</Label>
              <Input type="number" step="0.01" value={fraisPortHT || ''} onChange={e => setFraisPortHT(parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Notes</Label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]" />
            </div>
            <Button onClick={save} className="w-full">{editingId ? 'Enregistrer' : 'Créer la commande'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AR Dialog — Envoi accusé de réception avec dates */}
      <Dialog open={arDialogOpen} onOpenChange={setArDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              Envoi AR — {arCommande?.numero}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Confirmez l'envoi de l'accusé de réception avec les dates de départ et livraison prévues.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" />Date de départ</Label>
                <Input type="date" value={arDateDepart} onChange={e => setArDateDepart(e.target.value)} />
              </div>
              <div>
                <Label className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" />Livraison prévue</Label>
                <Input type="date" value={arDateLivraison} onChange={e => setArDateLivraison(e.target.value)} />
              </div>
            </div>
            {arCommande && arCommande.lignes.length > 0 && (
              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="bg-muted/50 border-b border-border">
                    <th className="text-left py-2 px-3">Description</th>
                    <th className="text-right py-2 px-3">Qté</th>
                    <th className="text-right py-2 px-3">Total HT</th>
                  </tr></thead>
                  <tbody>
                    {arCommande.lignes.map((l, i) => {
                      const t = calculerTotalLigne(l);
                      return (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-1.5 px-3">{l.description}</td>
                          <td className="py-1.5 px-3 text-right">{l.quantite}</td>
                          <td className="py-1.5 px-3 text-right">{formatMontant(t.totalHT)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setArDialogOpen(false)} className="flex-1">Annuler</Button>
              <Button onClick={saveAr} className="flex-1"><Send className="w-4 h-4 mr-1" />Envoyer AR</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Facturer Dialog */}
      <Dialog open={factureDialogOpen} onOpenChange={setFactureDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Facturer — {factureCommande?.numero}
            </DialogTitle>
          </DialogHeader>
          {factureCommande && (
            <div className="space-y-4">
              {/* Récapitulatif dates + échéance */}
              {(() => {
                const baseDateEch = factureCommande.dateLivraison || factureCommande.dateLivraisonPrevue;
                const dateEch = factureCommande.delaiReglement && baseDateEch
                  ? formatDate(formatDateISO(calculerDateEcheance(baseDateEch, factureCommande.delaiReglement)))
                  : null;
                return (
                  <div className="grid grid-cols-2 gap-2 text-xs rounded-lg border border-border bg-muted/20 p-3">
                    {factureCommande.dateLivraison && (
                      <div><span className="text-muted-foreground">Date livraison :</span> <span className="font-semibold">{formatDate(factureCommande.dateLivraison)}</span></div>
                    )}
                    {!factureCommande.dateLivraison && factureCommande.dateLivraisonPrevue && (
                      <div><span className="text-muted-foreground">Livraison prévue :</span> <span className="font-semibold">{formatDate(factureCommande.dateLivraisonPrevue)}</span></div>
                    )}
                    {factureCommande.delaiReglement && (
                      <div><span className="text-muted-foreground">Délai :</span> <span className="font-semibold">{factureCommande.delaiReglement}</span></div>
                    )}
                    {dateEch && (
                      <div className="col-span-2 pt-1 border-t border-border">
                        <span className="text-muted-foreground">Échéance paiement : </span>
                        <span className="font-bold text-primary">{dateEch}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
              <p className="text-sm text-muted-foreground">
                Sélectionnez les produits livrés à facturer :
              </p>
              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="bg-muted/50 border-b border-border">
                    <th className="py-2 px-3 w-8"></th>
                    <th className="text-left py-2 px-3">Description</th>
                    <th className="text-right py-2 px-3">Qté</th>
                    <th className="text-right py-2 px-3">Total HT</th>
                  </tr></thead>
                  <tbody>
                    {factureCommande.lignes.map((l, i) => {
                      const t = calculerTotalLigne(l);
                      const checked = factureLignesSelectees.includes(l.id);
                      return (
                        <tr key={i} className={`border-b border-border/50 cursor-pointer hover:bg-muted/30 ${checked ? 'bg-primary/5' : ''}`} onClick={() => toggleLigneFacture(l.id)}>
                          <td className="py-1.5 px-3">
                            <Checkbox checked={checked} onCheckedChange={() => toggleLigneFacture(l.id)} />
                          </td>
                          <td className="py-1.5 px-3">{l.description}</td>
                          <td className="py-1.5 px-3 text-right">{l.quantite}</td>
                          <td className="py-1.5 px-3 text-right">{formatMontant(t.totalHT)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border pt-3 text-sm">
                <div className="flex justify-between font-medium">
                  <span>Total à facturer</span>
                  <span>{formatMontant(
                    factureCommande.lignes
                      .filter(l => factureLignesSelectees.includes(l.id))
                      .reduce((acc, l) => acc + calculerTotalLigne(l).totalHT, 0)
                  )}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setFactureDialogOpen(false)} className="flex-1">Annuler</Button>
                <Button onClick={saveFacture} className="flex-1"><Receipt className="w-4 h-4 mr-1" />Facturer</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewCommande} onOpenChange={() => setPreviewCommande(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Commande {previewCommande?.numero}
            </DialogTitle>
          </DialogHeader>
          {previewCommande && (() => {
            const client = clients.find(c => c.id === previewCommande.clientId);
            const statutInfo = STATUTS_COMMANDE_CLIENT[previewCommande.statut];
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Client :</span> <span className="font-medium">{client?.nom}</span></div>
                  <div><span className="text-muted-foreground">Société :</span> <span className="font-medium">{client?.societe || '—'}</span></div>
                  <div><span className="text-muted-foreground">Date :</span> <span className="font-medium">{formatDate(previewCommande.dateCreation)}</span></div>
                  <div><span className="text-muted-foreground">Statut :</span> <span className={`text-xs font-medium px-2 py-0.5 rounded ${statutInfo.color}`}>{statutInfo.label}</span></div>
                  {previewCommande.referenceAffaire && <div className="col-span-2"><span className="text-muted-foreground">Réf. Affaire :</span> <span className="font-medium">{previewCommande.referenceAffaire}</span></div>}
                  {previewCommande.dateDepart && <div><span className="text-muted-foreground">Départ :</span> <span className="font-medium">{formatDate(previewCommande.dateDepart)}</span></div>}
                  {previewCommande.dateLivraisonPrevue && <div><span className="text-muted-foreground">Livraison prévue :</span> <span className="font-medium">{formatDate(previewCommande.dateLivraisonPrevue)}</span></div>}
                </div>
                {previewCommande.lignes.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold mb-2">Lignes</p>
                    <div className="border border-border rounded-md overflow-hidden">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-muted/50 border-b border-border">
                          <th className="text-left py-2 px-3">Description</th>
                          <th className="text-right py-2 px-3">Qté</th>
                          <th className="text-right py-2 px-3">PU HT</th>
                          <th className="text-right py-2 px-3">Total HT</th>
                        </tr></thead>
                        <tbody>
                          {previewCommande.lignes.map((l, i) => {
                            const t = calculerTotalLigne(l);
                            return (
                              <tr key={i} className="border-b border-border/50">
                                <td className="py-1.5 px-3">{l.description}</td>
                                <td className="py-1.5 px-3 text-right">{l.quantite}</td>
                                <td className="py-1.5 px-3 text-right">{formatMontant(l.prixUnitaireHT)}</td>
                                <td className="py-1.5 px-3 text-right">{formatMontant(t.totalHT)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="border-t border-border pt-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Total HT</span><span className="font-medium">{formatMontant(previewCommande.totalHT)}</span></div>
                  {previewCommande.fraisPortHT > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Frais de port</span><span>{formatMontant(previewCommande.fraisPortHT)}</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">TVA</span><span>{formatMontant(previewCommande.totalTVA)}</span></div>
                  <div className="flex justify-between text-base font-bold"><span>Total TTC</span><span>{formatMontant(previewCommande.totalTTC)}</span></div>
                </div>
                {previewCommande.notes && <div className="text-xs text-muted-foreground bg-muted p-2 rounded">{previewCommande.notes}</div>}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Commande Fournisseur Dialog */}
      <CommandeFournisseurDialog
        open={!!cmdFournisseurDevis}
        onOpenChange={(open) => { if (!open) setCmdFournisseurDevis(null); }}
        devis={cmdFournisseurDevis}
        produits={produits}
        fournisseurs={fournisseurs}
        produitFournisseurs={produitFournisseurs}
        onSaveCommandes={(commandes) => {
          updateCommandesFournisseur(prev => [...prev, ...commandes]);
        }}
      />

      {/* Email Dialog */}
      <CommandeEmailDialog
        open={!!emailTarget}
        onOpenChange={open => { if (!open) setEmailTarget(null); }}
        target={emailTarget}
      />

      {/* AR PDF + Email Dialog */}
      <CommandeARDialog
        open={arPdfDialogOpen}
        onOpenChange={v => { setArPdfDialogOpen(v); if (!v) setArPdfCommande(null); }}
        commande={arPdfCommande}
        client={arPdfCommande ? clients.find(c => c.id === arPdfCommande.clientId) : undefined}
        dateDepart={arPdfDateDepart}
        dateLivraison={arPdfDateLivraison}
        onSent={handleArSent}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette commande ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
