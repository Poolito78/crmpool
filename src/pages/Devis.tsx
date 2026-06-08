import { useState, useEffect, useRef, useCallback, Fragment, type ReactNode } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useCRM } from '@/lib/StoreContext';
import { generateId, calculerTotalDevis, calculerTotalLigne, calculerFraisPort, calculerFraisPortBareme, BAREMES_TRANSPORT, getStandardBareme, formatMontant, formatDate, getPrixPourQuantite, useCrmActions, RAISON_ARCHIVE, TYPE_CRM_ACTION, STATUT_CRM_ACTION, type Devis as DevisType, type LigneDevis, type TransporteurType, type CommandeClient, type FactureClient, type Produit, type RaisonArchive, type ConcurrentProduit } from '@/lib/store';
import { Plus, Search, Eye, Trash2, FileText, Pencil, Copy, ExternalLink, Download, User, Mail, ShoppingCart, ArrowUp, ArrowDown, Package, Bot, MessageSquare, StickyNote, Paperclip, Receipt, Undo2, FolderPlus, GripVertical, Layers, Send, TrendingUp, Zap, Archive, CalendarClock, RotateCcw, MapPin, LayoutList, Table2, Filter, ChevronUp, ChevronDown, ChevronsUpDown, X as XIcon, Settings, Check } from 'lucide-react';
import { genererScriptOdoo, promptOdooPartnerName } from '@/lib/odooSync';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { exportToExcel } from '@/lib/exportExcel';
import { logHistorique } from '@/lib/historique';
import DevisPreview from '@/components/DevisPreview';
import ProduitCombobox from '@/components/ProduitCombobox';
import ClientCombobox from '@/components/ClientCombobox';
import DevisEmailDialog, { type PreviewOptions } from '@/components/DevisEmailDialog';
import { DELAI_REGLEMENT_OPTIONS } from '@/pages/Clients';
import CommandeFournisseurDialog from '@/components/CommandeFournisseurDialog';
import EmailAnalyzerDialog from '@/components/EmailAnalyzerDialog';
import DevisAssistantDialog from '@/components/DevisAssistantDialog';
import DevisChatter from '@/components/DevisChatter';
import DevisArchiveDialog from '@/components/DevisArchiveDialog';
import CRMActionDialog from '@/components/CRMActionDialog';
import { supabase } from '@/integrations/supabase/client';
import VarianteSelect from '@/components/VarianteSelect';

// ── Colonnes du tableau liste devis ───────────────────────────────────────────
import { DEVIS_TABLE_COLS_DEF, DEFAULT_DEVIS_TABLE_COLS, type DevisTableColKey } from '@/lib/devisTableConfig';
import { useTableColumns } from '@/hooks/useTableColumns';
import ColResizeHandle from '@/components/ColResizeHandle';
import PageHeaderSlot from '@/components/PageHeaderSlot';
import RowActionsMenu from '@/components/RowActionsMenu';
import TableGearMenu from '@/components/TableGearMenu';
import FilterSuggestInput from '@/components/FilterSuggestInput';
import FilterChoiceInput, { parseChoiceFilter } from '@/components/FilterChoiceInput';
import FilterDateInput, { matchDateFilter } from '@/components/FilterDateInput';
import FilterAmountInput, { matchAmountFilter } from '@/components/FilterAmountInput';
import RichTextEditor from '@/components/RichTextEditor';
import { generatePdfFromElement, writeFileToFolder } from '@/lib/pdfFolder';

// ── Colonnes optionnelles (toujours disponibles) ──────────────────────────────
const LIGNE_COLS = [
  { key: 'surface', label: 'Surface (m²)' },
  { key: 'conso',   label: 'Conso. (kg/m²)' },
  { key: 'poids',   label: 'Poids (kg)' },
  { key: 'prixht',  label: 'Prix HT' },
  { key: 'remise',  label: 'Rem. %' },
  { key: 'netht',   label: 'Net HT' },
  { key: 'marge',   label: 'Marge / Coeff' },
] as const;
type LigneColKey = typeof LIGNE_COLS[number]['key'];

// ── Vue tableau éditable : colonnes redimensionnables + déplaçables ───────────
// (les colonnes optionnelles surface/conso/poids/remise/netht/marge ne sont
//  rendues que si présentes dans visibleLigneCols)
type TLCKey = 'ref' | 'description' | 'surface' | 'conso' | 'poids' | 'qte' | 'unite' | 'prixht' | 'remise' | 'netht' | 'marge' | 'total';
const TABLE_LIGNE_COLS: { key: TLCKey; label: string; width: number; optional?: LigneColKey; align?: 'right' }[] = [
  { key: 'ref',         label: 'Réf.',          width: 192 },
  { key: 'description', label: 'Description',   width: 320 },
  { key: 'surface',     label: 'Surface m²',    width: 80,  optional: 'surface' },
  { key: 'conso',       label: 'Conso. kg/m²',  width: 80,  optional: 'conso' },
  { key: 'poids',       label: 'Poids kg',      width: 64,  optional: 'poids' },
  { key: 'qte',         label: 'Qté',           width: 64 },
  { key: 'unite',       label: 'Unité',         width: 56 },
  { key: 'prixht',      label: 'Prix HT',       width: 96,  optional: 'prixht' },
  { key: 'remise',      label: 'Rem. %',        width: 64,  optional: 'remise' },
  { key: 'netht',       label: 'Net HT',        width: 96,  optional: 'netht' },
  { key: 'marge',       label: 'Marge / Coeff', width: 96,  optional: 'marge', align: 'right' },
  { key: 'total',       label: 'Total HT',      width: 96,  align: 'right' },
];
const DEFAULT_LIGNE_COLS: LigneColKey[] = ['surface', 'conso', 'prixht', 'remise', 'netht'];

const statutColors: Record<string, string> = {
  brouillon: 'bg-muted text-muted-foreground',
  envoyé: 'bg-info/10 text-info',
  accepté: 'bg-success/10 text-success',
  refusé: 'bg-destructive/10 text-destructive',
  expiré: 'bg-muted text-muted-foreground',
  système: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  archivé: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export default function Devis() {
  const { devis, updateDevis, clients, updateClients, produits, updateProduits, fournisseurs, produitFournisseurs, commandesFournisseur, updateCommandesFournisseur, commandesClient, updateCommandesClient, facturesClient, updateFacturesClient } = useCRM();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const _savedFilters = (() => { try { const s = localStorage.getItem('crm_devis_filters'); return s ? JSON.parse(s) : {}; } catch { return {}; } })();
  const [filterStatut, setFilterStatut] = useState<string>(_savedFilters.filterStatut ?? 'tous');
  const [filterClient, setFilterClient] = useState<string>(_savedFilters.filterClient ?? 'tous');
  const [filterProduit, setFilterProduit] = useState<string>('');
  const [searchMode, setSearchMode] = useState<'global' | 'produit'>('global');
  const [filterPeriode, setFilterPeriode] = useState<string>(_savedFilters.filterPeriode ?? 'tous');
  const [sortBy, setSortBy] = useState<string>(_savedFilters.sortBy ?? 'date_desc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewDevis, setPreviewDevis] = useState<DevisType | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [emailDevis, setEmailDevis] = useState<DevisType | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  // Mémorise la valeur précédente de surfaceGlobaleM2 pour éviter de l'écraser à l'ouverture du formulaire
  const prevSurfaceGlobaleRef = useRef<number>(0);
  const [previewOptions, setPreviewOptions] = useState<PreviewOptions>(() => {
    try {
      const saved = localStorage.getItem('crm_devis_preview_opts');
      if (saved) return { showConso: false, showRemise: false, showComposants: false, showKgRecap: true, ...JSON.parse(saved) };
    } catch {}
    return { showConso: false, showRemise: false, showComposants: false, showKgRecap: true };
  });
  useEffect(() => { try { localStorage.setItem('crm_devis_preview_opts', JSON.stringify(previewOptions)); } catch {} }, [previewOptions]);
  const [commandeDevis, setCommandeDevis] = useState<DevisType | null>(null);
  const [commandeConfirmDevis, setCommandeConfirmDevis] = useState<DevisType | null>(null);
  const [emailAnalyzerOpen, setEmailAnalyzerOpen] = useState(false);
  const [chatterDevis, setChatterDevis] = useState<DevisType | null>(null);
  const [chatterMode, setChatterMode] = useState<'note' | 'fichier' | null>(null);
  const [sidebarPjs, setSidebarPjs] = useState<Array<{ id: string; type: string; contenu?: string; fichierNom?: string; fichierUrl?: string; fichierTaille?: number; fichierMime?: string; confidentiel?: boolean; date: string }>>([]);
  // Images collées dans les notes de ligne : ligneId → [{url, name}]
  const [lineImages, setLineImages] = useState<Record<string, { url: string; name: string }[]>>({});
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [kitPickerOpen, setKitPickerOpen] = useState(false);
  const [kitSearch, setKitSearch] = useState('');
  const kitPickerRef = useRef<HTMLDivElement>(null);
  const [colChooserOpen, setColChooserOpen] = useState(false);
  const colChooserRef = useRef<HTMLDivElement>(null);

  // ── Vue tableau devis ───────────────────────────────────────────────────────
  const [devisView, setDevisView] = useState<'liste' | 'tableau'>(() => {
    try { return (localStorage.getItem('devis_view') as 'liste' | 'tableau') || 'liste'; } catch { return 'liste'; }
  });
  useEffect(() => { try { localStorage.setItem('devis_view', devisView); } catch {} }, [devisView]);
  const [openFilterColsD, setOpenFilterColsD] = useState<Set<DevisTableColKey>>(new Set());
  const [colFiltersD, setColFiltersD] = useState<Partial<Record<DevisTableColKey, string>>>({});
  const [visDevisTableCols, setVisDevisTableCols] = useState<Set<DevisTableColKey>>(() => {
    try {
      const s = localStorage.getItem('devis_table_cols');
      if (s) { const p = JSON.parse(s) as DevisTableColKey[]; if (Array.isArray(p) && p.length > 0) return new Set(p); }
    } catch {}
    return new Set(DEFAULT_DEVIS_TABLE_COLS);
  });
  useEffect(() => { try { localStorage.setItem('devis_table_cols', JSON.stringify([...visDevisTableCols])); } catch {} }, [visDevisTableCols]);
  const devisCols = useTableColumns<DevisTableColKey>('devis_table', DEVIS_TABLE_COLS_DEF.map(c => c.key));
  // Colonnes de la vue tableau éditable des lignes (resize + ordre persistés)
  const ligneTableCols = useTableColumns<TLCKey>('devis_lignes_table', TABLE_LIGNE_COLS.map(c => c.key));
  const [colMenuDevis, setColMenuDevis] = useState(false);
  const colMenuDevisRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!colMenuDevis) return;
    const h = (e: MouseEvent) => { if (colMenuDevisRef.current && !colMenuDevisRef.current.contains(e.target as Node)) setColMenuDevis(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [colMenuDevis]);

  function toggleFilterColD(col: DevisTableColKey) {
    setOpenFilterColsD(prev => {
      const n = new Set(prev);
      if (n.has(col)) {
        // Fermeture → on efface aussi le filtre en cours de cette colonne
        n.delete(col);
        setColFiltersD(f => { const nf = { ...f }; delete nf[col]; return nf; });
      } else {
        n.add(col);
      }
      return n;
    });
  }
  function setFilterD(col: DevisTableColKey, val: string) { setColFiltersD(prev => ({ ...prev, [col]: val })); }
  function hasActiveFiltersD() { return Object.values(colFiltersD).some(v => v); }

  const [visibleLigneCols, setVisibleLigneCols] = useState<Set<LigneColKey>>(() => {
    try {
      const s = localStorage.getItem('devis_ligne_cols_v3');
      if (s) {
        const parsed = JSON.parse(s) as LigneColKey[];
        if (Array.isArray(parsed) && parsed.length > 0) return new Set(parsed);
      }
    } catch { /* ignore */ }
    return new Set(DEFAULT_LIGNE_COLS);
  });
  // Affichage des lignes : cartes (défaut) ou tableau compact à colonnes
  const [lignesView, setLignesView] = useState<'cartes' | 'tableau'>(() => {
    try { return (localStorage.getItem('devis_lignes_view') as 'cartes' | 'tableau') || 'cartes'; } catch { return 'cartes'; }
  });
  useEffect(() => { try { localStorage.setItem('devis_lignes_view', lignesView); } catch { /* ignore */ } }, [lignesView]);

  // Auto-open devis editor via ?editDevis=<id> URL param
  const editDevisHandledRef = useRef(false);
  // ── Gestion du retour / fermeture du devis ──────────────────────────────────
  // openedViaUrl=true : ouvert depuis une navigation (ex. tableau de bord) → il
  //   existe déjà une vraie entrée d'historique → fermer = revenir en arrière.
  // openedViaUrl=false : ouvert directement depuis la liste (modale sans nav) →
  //   on pousse une entrée factice pour que le bouton « retour » ferme la modale
  //   et reste sur la liste.
  const openedViaUrlRef = useRef(false);
  const dialogOpenRef = useRef(false);
  const pushedStateRef = useRef(false);
  const closeDevisDialog = (fromPop = false) => {
    if (!dialogOpenRef.current) return; // déjà fermé (évite la ré-entrance)
    dialogOpenRef.current = false;
    if (!editingId) { const savedId = save(true); if (savedId) toast.info('Brouillon sauvegardé automatiquement', { duration: 3000 }); }
    setDialogOpen(false);
    setEditingId(null);
    if (openedViaUrlRef.current) {
      // Ouvert via navigation → revenir à la page précédente effective
      openedViaUrlRef.current = false;
      if (!fromPop) navigate(-1);
    } else if (pushedStateRef.current && !fromPop) {
      // Ouvert depuis la liste → retirer l'entrée factice (reste sur la liste)
      pushedStateRef.current = false;
      window.history.back();
    }
  };
  useEffect(() => { dialogOpenRef.current = dialogOpen; }, [dialogOpen]);
  const closeRef = useRef(closeDevisDialog);
  closeRef.current = closeDevisDialog;
  // Entrée d'historique factice à l'ouverture — uniquement pour les ouvertures liste
  useEffect(() => {
    if (dialogOpen && !openedViaUrlRef.current && !pushedStateRef.current) {
      pushedStateRef.current = true;
      window.history.pushState({ devisDialog: true }, '');
    }
  }, [dialogOpen]);
  // Bouton « retour » navigateur → ferme le devis si ouvert depuis la liste
  useEffect(() => {
    const onPop = () => {
      if (dialogOpenRef.current && !openedViaUrlRef.current) {
        pushedStateRef.current = false;
        closeRef.current(true);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (editDevisHandledRef.current) return;
    const editDevisId = searchParams.get('editDevis');
    if (!editDevisId) return;
    if (devis.length === 0) return; // wait for data
    const d = devis.find(dv => dv.id === editDevisId);
    if (d) {
      openEdit(d);
      openedViaUrlRef.current = true; // après openEdit (qui réinitialise les refs)
      editDevisHandledRef.current = true;
      // Nettoie le paramètre d'URL sans ajouter d'entrée d'historique (navigate(-1) reste valide)
      setSearchParams({}, { replace: true });
    }
  }, [devis]); // eslint-disable-line react-hooks/exhaustive-deps

  const [clientId, setClientId] = useState('');
  const [contactId, setContactId] = useState('');
  const [dateCreation, setDateCreation] = useState(new Date().toISOString().split('T')[0]);
  const [dateValidite, setDateValidite] = useState('');
  const [statut, setStatut] = useState<DevisType['statut']>('brouillon');
  const [dateEnvoi, setDateEnvoi] = useState('');
  const [referenceAffaire, setReferenceAffaire] = useState('');
  const [systeme, setSysteme] = useState('');
  const [notes, setNotes] = useState('');
  const [conditions, setConditions] = useState('Paiement à 45 jours fin de mois à compter de la date de facturation.');
  const [moContent, setMoContent] = useState('');
  const [probabiliteReussite, setProbabiliteReussite] = useState<number>(0);
  const [dateRealisation, setDateRealisation] = useState('');
  const [moGenerating, setMoGenerating] = useState(false);
  const moPrintRef = useRef<HTMLDivElement>(null);
  const [lignes, setLignes] = useState<LigneDevis[]>([]);
  const [undoStack, setUndoStack] = useState<LigneDevis[][]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [selectedLignes, setSelectedLignes] = useState<Set<string>>(new Set());
  function toggleLigneSelection(id: string) {
    setSelectedLignes(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const lignesRef = useRef<LigneDevis[]>([]);
  lignesRef.current = lignes;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Synchronisation du défilement horizontal en-tête ↔ lignes (vue tableau)
  const ligneHeaderScrollRef = useRef<HTMLDivElement>(null);
  const ligneBodyScrollRef = useRef<HTMLDivElement>(null);
  const dragScrollRafRef = useRef<number | null>(null);
  const dragClientYRef = useRef<number>(0);
  const [dialogTab, setDialogTab] = useState<'devis' | 'comparatif' | 'mo' | 'crm' | 'notes'>('devis');
  const [selectedFournisseurPerLigne, setSelectedFournisseurPerLigne] = useState<Record<string, string>>({});
  // Comparatif — édition manuelle du PU Achat
  const [portAchatManuel, setPortAchatManuel] = useState<number | null>(null);
  const [compaEditingId, setCompaEditingId] = useState<string | null>(null); // ligneId ou '__transport__'
  const [compaEditingField, setCompaEditingField] = useState<'achat' | 'vente' | 'coeff'>('achat');
  const [compaEditVal, setCompaEditVal] = useState('');
  const [fraisPortHT, setFraisPortHT] = useState(0);
  const [fraisPortTVA, setFraisPortTVA] = useState(20);
  const [fraisPortAuto, setFraisPortAuto] = useState(true);
  const [transporteur, setTransporteur] = useState<TransporteurType>('standard');
  const [coeffTransport, setCoeffTransport] = useState(1.4);
  const [expressJ1, setExpressJ1] = useState(false);
  const [coeffExpress, setCoeffExpress] = useState(1.8);
  const [modeCalcul, setModeCalcul] = useState<'standard' | 'surface'>('standard');
  const [surfaceGlobaleM2, setSurfaceGlobaleM2] = useState(0);
  const [adresseLivraisonId, setAdresseLivraisonId] = useState('');
  const [contactLivraisonId, setContactLivraisonId] = useState('');

  // Archive
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<DevisType | null>(null);
  const [showArchived, setShowArchived] = useState<boolean>(_savedFilters.showArchived ?? false);
  useEffect(() => {
    try { localStorage.setItem('crm_devis_filters', JSON.stringify({ filterStatut, filterClient, filterPeriode, sortBy, showArchived })); } catch {}
  }, [filterStatut, filterClient, filterPeriode, sortBy, showArchived]);

  // CRM tab in devis dialog
  const { actions: crmActions, addAction: addCrmAction } = useCrmActions();
  const [crmActionDialogOpen, setCrmActionDialogOpen] = useState(false);
  const [editingCrmAction, setEditingCrmAction] = useState<import('@/lib/store').CrmAction | null>(null);

  const filtered = devis.filter(d => {
    const client = clients.find(c => c.id === d.clientId);
    const q = search.toLowerCase();
    const matchSearch = [d.numero, client?.nom, client?.societe, d.statut, d.referenceAffaire, d.systeme, d.notes].some(v => v?.toLowerCase().includes(q))
      || d.lignes.some(l => l.variantesChoisies && Object.values(l.variantesChoisies).some(v => v.toLowerCase().includes(q)));
    if (!matchSearch) return false;
    const cs = parseChoiceFilter(colFiltersD.statut || '');
    // Archivés masqués par défaut sauf si showArchived ou ciblés explicitement (colonne "only" archivé)
    if (!showArchived && filterStatut !== 'archivé' && cs.only !== 'archivé' && d.statut === 'archivé') return false;
    // Système (modèles) masqués par défaut sauf si ciblés explicitement (colonne "only" système)
    if (filterStatut === 'tous' && cs.only !== 'système' && d.statut === 'système') return false;
    if (filterStatut !== 'tous' && d.statut !== filterStatut) return false;
    if (filterClient !== 'tous' && d.clientId !== filterClient) return false;
    if (filterProduit.trim()) {
      const fp = filterProduit.trim().toLowerCase();
      const inLignes = d.lignes.some(l => {
        if (l.description?.toLowerCase().includes(fp)) return true;
        const p = l.produitId ? produits.find(pr => pr.id === l.produitId) : null;
        return p && (p.reference.toLowerCase().includes(fp) || p.description.toLowerCase().includes(fp));
      });
      if (!inLignes) return false;
    }
    // En vue tableau, la période est gérée par le filtre de la colonne Date
    if (filterPeriode !== 'tous' && devisView !== 'tableau') {
      const now = new Date();
      const dateD = new Date(d.dateCreation);
      if (filterPeriode === 'mois' && (dateD.getMonth() !== now.getMonth() || dateD.getFullYear() !== now.getFullYear())) return false;
      if (filterPeriode === 'trimestre') {
        const qNow = Math.floor(now.getMonth() / 3);
        const qD = Math.floor(dateD.getMonth() / 3);
        if (qD !== qNow || dateD.getFullYear() !== now.getFullYear()) return false;
      }
      if (filterPeriode === 'annee' && dateD.getFullYear() !== now.getFullYear()) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const clientA = clients.find(c => c.id === a.clientId);
    const clientB = clients.find(c => c.id === b.clientId);
    switch (sortBy) {
      case 'date_asc':  return a.dateCreation.localeCompare(b.dateCreation);
      case 'date_desc': return b.dateCreation.localeCompare(a.dateCreation);
      case 'total_asc':  return calculerTotalDevis(a.lignes, a.fraisPortHT || 0, a.fraisPortTVA ?? 20).totalHT - calculerTotalDevis(b.lignes, b.fraisPortHT || 0, b.fraisPortTVA ?? 20).totalHT;
      case 'total_desc': return calculerTotalDevis(b.lignes, b.fraisPortHT || 0, b.fraisPortTVA ?? 20).totalHT - calculerTotalDevis(a.lignes, a.fraisPortHT || 0, a.fraisPortTVA ?? 20).totalHT;
      case 'numero_asc':  return a.numero.localeCompare(b.numero);
      case 'numero_desc': return b.numero.localeCompare(a.numero);
      case 'client_asc':  return (clientA?.societe || clientA?.nom || '').localeCompare(clientB?.societe || clientB?.nom || '');
      case 'client_desc': return (clientB?.societe || clientB?.nom || '').localeCompare(clientA?.societe || clientA?.nom || '');
      case 'statut_asc':  return a.statut.localeCompare(b.statut);
      case 'statut_desc': return b.statut.localeCompare(a.statut);
      case 'refAffaire_asc':  return (a.referenceAffaire || '').localeCompare(b.referenceAffaire || '');
      case 'refAffaire_desc': return (b.referenceAffaire || '').localeCompare(a.referenceAffaire || '');
      case 'systeme_asc':  return (a.systeme || '').localeCompare(b.systeme || '');
      case 'systeme_desc': return (b.systeme || '').localeCompare(a.systeme || '');
      case 'validite_asc':  return a.dateValidite.localeCompare(b.dateValidite);
      case 'validite_desc': return b.dateValidite.localeCompare(a.dateValidite);
      case 'port_asc':  return (a.fraisPortHT || 0) - (b.fraisPortHT || 0);
      case 'port_desc': return (b.fraisPortHT || 0) - (a.fraisPortHT || 0);
      default: return 0;
    }
  });

  // Tableau trié+filtré (colonne sort → remplace le sortBy select en mode tableau)
  // ⚠️ DOIT être déclaré APRÈS `sorted` : cette IIFE lit `sorted` à l'exécution.
  const sortedTable = (() => {
    const NON_VIDE = '!empty';
    let arr = sorted;
    if (hasActiveFiltersD()) {
      arr = arr.filter(d => {
        const cl = clients.find(c => c.id === d.clientId);
        const fNum = colFiltersD.numero || '';
        if (fNum) { const nv = fNum === NON_VIDE; if (nv ? !d.numero?.trim() : !d.numero?.toLowerCase().includes(fNum.toLowerCase())) return false; }
        const cSt = parseChoiceFilter(colFiltersD.statut || '');
        if (cSt.mode === 'only' && d.statut !== cSt.only) return false;
        if (cSt.mode === 'exclude' && cSt.excluded.includes(d.statut)) return false;
        const fCl = colFiltersD.client || '';
        if (fCl && fCl !== NON_VIDE) {
          const q = fCl.toLowerCase();
          const cn = (cl?.societe || cl?.nom || '').toLowerCase();
          // Recherche aussi dans les contacts du client (nom, prénom, email, tél, fonction)
          const ct = d.contactId ? (cl?.contacts || []).find(c => c.id === d.contactId) : null;
          const inContact = ct
            ? [ct.nom, ct.prenom, ct.email, ct.telephone, ct.telephoneMobile, ct.fonction].some(v => v?.toLowerCase().includes(q))
            : (cl?.contacts || []).some(c => [c.nom, c.prenom, c.email, c.telephone, c.telephoneMobile, c.fonction].some(v => v?.toLowerCase().includes(q)));
          if (!cn.includes(q) && !inContact) return false;
        }
        const fRef = colFiltersD.refAffaire || '';
        if (fRef) { const nv = fRef === NON_VIDE; if (nv ? !d.referenceAffaire?.trim() : !(d.referenceAffaire || '').toLowerCase().includes(fRef.toLowerCase())) return false; }
        const fSys = colFiltersD.systeme || '';
        if (fSys) { const nv = fSys === NON_VIDE; if (nv ? !d.systeme?.trim() : !(d.systeme || '').toLowerCase().includes(fSys.toLowerCase())) return false; }
        const fVal = colFiltersD.validite || '';
        if (fVal) {
          const todayStr = new Date().toISOString().split('T')[0];
          const horsDelai = !!d.dateValidite && d.dateValidite < todayStr;
          if (fVal === 'oui' && !horsDelai) return false;
          if (fVal === 'non' && horsDelai) return false;
        }
        const fDate = colFiltersD.date || '';
        if (fDate && !matchDateFilter(fDate, d.dateCreation)) return false;
        const fTotal = colFiltersD.totalHT || '';
        if (fTotal && !matchAmountFilter(fTotal, calculerTotalDevis(d.lignes, d.fraisPortHT || 0, d.fraisPortTVA ?? 20).totalHT)) return false;
        return true;
      });
    }
    return arr;
  })();




  function populateForm(d: DevisType) {
    setClientId(d.clientId);
    setContactId(d.contactId || '');
    setDateCreation(d.dateCreation);
    setDateValidite(d.dateValidite);
    setStatut(d.statut);
    setDateEnvoi(d.dateEnvoi || '');
    setReferenceAffaire(d.referenceAffaire || '');
    setSysteme(d.systeme || '');
    setNotes(d.notes || '');
    setConditions(d.conditions || 'Paiement à 45 jours fin de mois à compter de la date de facturation.');
    setMoContent(d.moContent || '');
    setProbabiliteReussite(d.probabiliteReussite ?? 0);
    setDateRealisation(d.dateRealisation || '');
    setLignes(d.lignes.map(l => {
      // Recalculer le prix des lignes dont la variante choisie a un prixDiff
      // (corrige les valeurs sauvées avant l'implémentation du +prixDiff)
      if ((!l.type || l.type === 'ligne') && l.produitId && l.variantesChoisies) {
        const prod = produits.find(p => p.id === l.produitId);
        if (prod) {
          const diff = getVarianteDiff(prod, l.variantesChoisies);
          if (diff !== 0) {
            const cl = clients.find(c => c.id === d.clientId);
            const prixUnitaireHT = getPrixLigne(prod, l.quantite, l.variantesChoisies, cl?.estRevendeur);
            return { ...l, prixUnitaireHT };
          }
        }
      }
      return { ...l, id: l.id };
    }));
    setFraisPortHT(d.fraisPortHT || 0);
    setFraisPortTVA(d.fraisPortTVA ?? 20);
    setFraisPortAuto(d.fraisPortAuto ?? !(d.fraisPortHT > 0));
    setAdresseLivraisonId(d.adresseLivraisonId || '');
    setContactLivraisonId(d.contactLivraisonId || '');
    setModeCalcul(d.modeCalcul || 'standard');
    prevSurfaceGlobaleRef.current = d.surfaceGlobaleM2 || 0;
    setSurfaceGlobaleM2(d.surfaceGlobaleM2 || 0);
    prevClientIdRef.current = d.clientId;
    setDialogTab('devis');
    const fInit: Record<string, string> = {};
    for (const l of d.lignes) {
      if (!l.produitId) continue;
      const pfs = produitFournisseurs.filter(pf => pf.produitId === l.produitId);
      const prio = pfs.find(pf => pf.estPrioritaire) || pfs[0];
      if (prio) fInit[l.id] = prio.fournisseurId;
    }
    setSelectedFournisseurPerLigne(fInit);
    setPortAchatManuel(null);
    setCompaEditingId(null);
    setUndoStack([]);
  }

  function openNew() {
    openedViaUrlRef.current = false;
    setEditingId(null);
    setClientId('');
    setContactId('');
    setDateCreation(new Date().toISOString().split('T')[0]);
    setDateValidite(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
    setStatut('brouillon');
    setDateEnvoi('');
    setReferenceAffaire('');
    setSysteme('');
    setNotes('');
    setConditions('Paiement à 45 jours fin de mois à compter de la date de facturation.');
    setMoContent('');
    setProbabiliteReussite(0);
    setDateRealisation('');
    setLignes([{ id: generateId(), description: '', quantite: 1, unite: 'pièce', prixUnitaireHT: 0, tva: 20, remise: 0 }]);
    setFraisPortHT(0);
    setFraisPortTVA(20);
    setFraisPortAuto(true);
    setTransporteur('standard');
    setCoeffTransport(1.4);
    setExpressJ1(false);
    setCoeffExpress(1.8);
    setModeCalcul('standard');
    prevSurfaceGlobaleRef.current = 0;
    setSurfaceGlobaleM2(0);
    prevClientIdRef.current = '';
    setDialogTab('devis');
    setSelectedFournisseurPerLigne({});
    setPortAchatManuel(null);
    setCompaEditingId(null);
    setAdresseLivraisonId('');
    setUndoStack([]);
    setDialogOpen(true);
  }

  function openEdit(d: DevisType) {
    openedViaUrlRef.current = false; // ouverture directe (liste)
    setEditingId(d.id);
    populateForm(d);
    setDialogOpen(true);
  }

  function createProforma(d: DevisType) {
    const year = new Date().getFullYear();
    const prefix = `PRO-${year}`;
    const n = facturesClient.filter(f => f.numero.startsWith(prefix)).length + 1;
    const numero = `${prefix}-${String(n).padStart(3, '0')}`;
    const client = clients.find(c => c.id === d.clientId);
    const total = calculerTotalDevis(d.lignes, d.fraisPortHT || 0, d.fraisPortTVA ?? 20);
    const proforma: FactureClient = {
      id: generateId(),
      numero,
      clientId: d.clientId,
      devisId: d.id,
      dateCreation: new Date().toISOString().split('T')[0],
      statut: 'brouillon',
      lignes: d.lignes,
      totalHT: total.totalHT,
      totalTVA: total.totalTVA,
      totalTTC: total.totalTTC,
      fraisPortHT: d.fraisPortHT || 0,
      referenceAffaire: d.referenceAffaire,
      estProforma: true,
    };
    updateFacturesClient(prev => [...prev, proforma]);
    toast.success(`Proforma ${numero} créée`, {
      action: { label: 'Voir', onClick: () => navigate('/factures-client?search=' + encodeURIComponent(numero)) },
    });
  }

  async function duplicate(d: DevisType) {
    const numero = `DEV-${new Date().getFullYear()}-${String(devis.length + 1).padStart(3, '0')}`;
    const newId = generateId();
    const newDevis: DevisType = {
      ...d,
      id: newId,
      numero,
      dateCreation: new Date().toISOString().split('T')[0],
      dateValidite: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      statut: 'brouillon',
      lignes: d.lignes.map(l => ({ ...l, id: generateId() })),
    };
    updateDevis(prev => [...prev, newDevis]);

    // Copier les pièces jointes (notes + fichiers)
    const { data: pjs } = await supabase
      .from('devis_pieces_jointes')
      .select('*')
      .eq('devis_id', d.id)
      .order('date', { ascending: true });

    if (pjs && pjs.length > 0) {
      const newPjs: any[] = [];
      for (const pj of pjs) {
        const newPjId = generateId();
        if (pj.type === 'fichier' && pj.fichier_url) {
          // Extraire le chemin dans le bucket depuis l'URL
          const pathMatch = (pj.fichier_url as string).match(/\/devis-pj\/([^?]+)/);
          if (pathMatch) {
            const oldPath = decodeURIComponent(pathMatch[1]);
            // Nouveau chemin : remplacer l'ancien devisId par le nouveau
            const newPath = oldPath.replace(d.id, newId);
            const { error: copyErr } = await supabase.storage
              .from('devis-pj')
              .copy(oldPath, newPath);
            if (!copyErr) {
              // Construire la nouvelle URL publique
              const { data: { publicUrl } } = supabase.storage
                .from('devis-pj')
                .getPublicUrl(newPath);
              newPjs.push({
                ...pj,
                id: newPjId,
                devis_id: newId,
                fichier_url: publicUrl,
              });
            }
          }
        } else {
          // Note : copier directement
          newPjs.push({ ...pj, id: newPjId, devis_id: newId });
        }
      }
      if (newPjs.length > 0) {
        await supabase.from('devis_pieces_jointes').insert(newPjs);
      }
      toast.success(`Devis dupliqué avec ${newPjs.length} pièce${newPjs.length > 1 ? 's jointes' : ' jointe'}`);
    } else {
      toast.success('Devis dupliqué');
    }
  }

  const [newLigneId, setNewLigneId] = useState<string | null>(null);

  function saveSnapshot() {
    setUndoStack(prev => [...prev.slice(-29), lignesRef.current]);
  }

  function undo() {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      setLignes(prev[prev.length - 1]);
      return prev.slice(0, -1);
    });
  }

  function addLigne() {
    saveSnapshot();
    const id = generateId();
    setLignes(prev => [...prev, { id, description: '', quantite: 1, unite: 'pièce', prixUnitaireHT: 0, tva: 20, remise: 0 }]);
    setNewLigneId(id);
  }

  function addGroupe() {
    saveSnapshot();
    const grpId = generateId();
    const subId = generateId();
    setLignes(prev => [
      ...prev,
      { id: grpId, type: 'groupe',    description: 'Nouveau groupe', quantite: 0, unite: '', prixUnitaireHT: 0, tva: 20, remise: 0 },
      { id: subId, type: 'soustotal', description: '',               quantite: 0, unite: '', prixUnitaireHT: 0, tva: 20, remise: 0 },
    ]);
    setNewLigneId(grpId);
  }

  function addTexte() {
    saveSnapshot();
    const id = generateId();
    setLignes(prev => [
      ...prev,
      { id, type: 'texte', description: '', quantite: 0, unite: '', prixUnitaireHT: 0, tva: 20, remise: 0 },
    ]);
    setNewLigneId(id);
  }

  // ─── Surcharge énergie — taux lus depuis le catalogue produits (fallback hardcodé) ──
  const _prodSurchargeMMA    = produits.find(p => p.reference === 'SURCHARGE_ENERGIE_MMA');
  const _prodSurchargeHorsMMA = produits.find(p => p.reference === 'SURCHARGE_ENERGIE_HORS_MMA');
  const SURCHARGE_ENERGIE_MMA_VENTE_PCT      = _prodSurchargeMMA?.prixRevendeur ?? 15;
  const SURCHARGE_ENERGIE_MMA_ACHAT_PCT      = _prodSurchargeMMA?.prixAchat     ?? 14.8;
  const SURCHARGE_ENERGIE_HORS_MMA_VENTE_PCT = _prodSurchargeHorsMMA?.prixRevendeur ?? 5;
  const SURCHARGE_ENERGIE_HORS_MMA_ACHAT_PCT = _prodSurchargeHorsMMA?.prixAchat     ?? 4.8;

  function addSurchargeEnergie() {
    // Totaux vente et achat MMA séparés
    let totalVenteMMA = 0, totalAchatMMA = 0;
    for (const l of lignes) {
      if (!l.produitId) continue;
      const prod = produits.find(p => p.id === l.produitId);
      if (!prod || prod.categorie?.toLowerCase() !== 'mma') continue;
      const coeff = 1 - (l.remise || 0) / 100;
      totalVenteMMA += l.quantite * l.prixUnitaireHT * coeff;
      totalAchatMMA += getPrixPourQuantite(prod, l.quantite).prixAchat * l.quantite * coeff;
    }
    if (totalVenteMMA <= 0) {
      toast.warning('Aucun produit MMA trouvé dans le devis.');
      return;
    }
    saveSnapshot();
    const montantVente = Math.round(totalVenteMMA * SURCHARGE_ENERGIE_MMA_VENTE_PCT) / 100;
    const montantAchat = Math.round(totalAchatMMA * SURCHARGE_ENERGIE_MMA_ACHAT_PCT) / 100;
    const id = generateId();
    setLignes(prev => [
      ...prev,
      { id, description: `Surcharge énergie MMA (${SURCHARGE_ENERGIE_MMA_VENTE_PCT}%)`, quantite: 1, unite: 'forfait', prixUnitaireHT: montantVente, prixAchatLigne: montantAchat, tva: 20, remise: 0 },
    ]);
    setNewLigneId(id);
  }

  function addSurchargeEnergieHorsMMA() {
    let totalVenteHorsMMA = 0, totalAchatHorsMMA = 0;
    for (const l of lignes) {
      if (!l.produitId) continue;
      const prod = produits.find(p => p.id === l.produitId);
      if (!prod || prod.categorie?.toLowerCase() === 'mma') continue;
      const coeff = 1 - (l.remise || 0) / 100;
      totalVenteHorsMMA += l.quantite * l.prixUnitaireHT * coeff;
      totalAchatHorsMMA += getPrixPourQuantite(prod, l.quantite).prixAchat * l.quantite * coeff;
    }
    if (totalVenteHorsMMA <= 0) {
      toast.warning('Aucun produit hors MMA trouvé dans le devis.');
      return;
    }
    saveSnapshot();
    const montantVente = Math.round(totalVenteHorsMMA * SURCHARGE_ENERGIE_HORS_MMA_VENTE_PCT) / 100;
    const montantAchat = Math.round(totalAchatHorsMMA * SURCHARGE_ENERGIE_HORS_MMA_ACHAT_PCT) / 100;
    const id = generateId();
    setLignes(prev => [
      ...prev,
      { id, description: `Surcharge énergie hors MMA (${SURCHARGE_ENERGIE_HORS_MMA_VENTE_PCT}%)`, quantite: 1, unite: 'forfait', prixUnitaireHT: montantVente, prixAchatLigne: montantAchat, tva: 20, remise: 0 },
    ]);
    setNewLigneId(id);
  }

  useEffect(() => {
    if (!kitPickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (kitPickerRef.current && !kitPickerRef.current.contains(e.target as Node)) {
        setKitPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [kitPickerOpen]);

  useEffect(() => {
    if (!colChooserOpen) return;
    function handleClick(e: MouseEvent) {
      if (colChooserRef.current && !colChooserRef.current.contains(e.target as Node)) {
        setColChooserOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [colChooserOpen]);

  useEffect(() => {
    localStorage.setItem('devis_ligne_cols_v3', JSON.stringify([...visibleLigneCols]));
  }, [visibleLigneCols]);

  function insertKit(kitProd: Produit) {
    saveSnapshot();
    const grpId = generateId();
    const subId = generateId();
    const newLignes: LigneDevis[] = [
      { id: grpId, type: 'groupe', description: kitProd.description, quantite: 0, unite: '', prixUnitaireHT: 0, tva: 20, remise: 0 },
      ...(kitProd.lignesKit || []).map(lk => ({
        id: generateId(),
        produitId: lk.produitId || undefined,
        description: lk.description,
        quantite: lk.quantite,
        unite: lk.unite,
        prixUnitaireHT: lk.prixUnitaireHT,
        tva: 20,
        remise: lk.remise,
        consommation: lk.consommation || undefined,
        note: lk.note,
      })),
      { id: subId, type: 'soustotal', description: '', quantite: 0, unite: '', prixUnitaireHT: 0, tva: 20, remise: 0 },
    ];
    setLignes(prev => [...prev, ...newLignes]);
    setKitPickerOpen(false);
    setKitSearch('');
  }

  function updateLigne(id: string, field: string, value: any) {
    setLignes(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      // Recalcule le prix si la quantité change et que le produit a des paliers
      if (field === 'quantite' && l.produitId) {
        const p = produits.find(pr => pr.id === l.produitId);
        if (p && p.paliersPrix && p.paliersPrix.length > 0) {
          const client = clients.find(c => c.id === clientId);
          const palierPrix = getPrixPourQuantite(p, value as number);
          updated.prixUnitaireHT = client?.estRevendeur ? palierPrix.prixRevendeur : palierPrix.prixHT;
        }
      }
      return updated;
    }));
  }

  function removeLigne(id: string) {
    saveSnapshot();
    setLignes(prev => prev.filter(l => l.id !== id));
  }

  function moveLigne(id: string, direction: 'up' | 'down') {
    saveSnapshot();
    setLignes(prev => {
      const idx = prev.findIndex(l => l.id === id);
      if (idx < 0) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }

  function duplicateLigne(id: string) {
    saveSnapshot();
    setLignes(prev => {
      const idx = prev.findIndex(l => l.id === id);
      if (idx < 0) return prev;
      const copy = { ...prev[idx], id: generateId() };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }

  function startDragScroll() {
    if (dragScrollRafRef.current !== null) return;
    const ZONE = 80;
    const SPEED = 12;
    function loop() {
      const el = scrollContainerRef.current;
      if (!el) { dragScrollRafRef.current = null; return; }
      const { top, bottom } = el.getBoundingClientRect();
      const y = dragClientYRef.current;
      if (y - top < ZONE) el.scrollTop -= SPEED * (1 - (y - top) / ZONE);
      else if (bottom - y < ZONE) el.scrollTop += SPEED * (1 - (bottom - y) / ZONE);
      dragScrollRafRef.current = requestAnimationFrame(loop);
    }
    dragScrollRafRef.current = requestAnimationFrame(loop);
  }

  function stopDragScroll() {
    if (dragScrollRafRef.current !== null) {
      cancelAnimationFrame(dragScrollRafRef.current);
      dragScrollRafRef.current = null;
    }
  }

  function dropLigne(targetId: string) {
    if (!draggedId) { setDragOverId(null); return; }
    // Bloc à déplacer : la sélection si la ligne tirée en fait partie, sinon juste elle
    const movingIds = selectedLignes.has(draggedId) && selectedLignes.size > 1
      ? lignes.filter(l => selectedLignes.has(l.id)).map(l => l.id)
      : [draggedId];
    if (movingIds.includes(targetId)) { setDraggedId(null); setDragOverId(null); return; }
    saveSnapshot();
    setLignes(prev => {
      const movingSet = new Set(movingIds);
      const block = prev.filter(l => movingSet.has(l.id)); // conserve l'ordre d'origine
      const rest = prev.filter(l => !movingSet.has(l.id));
      const to = rest.findIndex(l => l.id === targetId);
      if (to < 0) return prev;
      const next = [...rest];
      next.splice(to, 0, ...block); // insère le bloc avant la ligne cible
      return next;
    });
    setDraggedId(null);
    setDragOverId(null);
  }

  function calcQuantiteSurface(produit: typeof produits[0], surface: number, consoOverride?: number): number {
    const conso = consoOverride || produit.consommation;
    if (!conso || conso <= 0 || !produit.poids || produit.poids <= 0) return 1;
    const kgNeeded = surface * conso;
    return Math.ceil(kgNeeded / produit.poids);
  }

  /** Somme des prixDiff des variantes choisies sur une ligne */
  function getVarianteDiff(produit: typeof produits[0], variantesChoisies?: Record<string, string>): number {
    if (!produit.variantes?.length || !variantesChoisies) return 0;
    return produit.variantes.reduce((sum, d) => {
      const chosenLabel = variantesChoisies[d.id] ?? d.options[0]?.label;
      const o = d.options.find(x => x.label === chosenLabel);
      return sum + (o?.prixDiff ?? 0);
    }, 0);
  }

  /** Prix unitaire HT final = palier + diff variantes */
  function getPrixLigne(produit: typeof produits[0], quantite: number, variantesChoisies?: Record<string, string>, isRevendeur?: boolean): number {
    const palier = getPrixPourQuantite(produit, quantite);
    const base = isRevendeur ? palier.prixRevendeur : palier.prixHT;
    const diff = getVarianteDiff(produit, variantesChoisies);
    return Math.round((base + diff) * 100) / 100;
  }

  function selectProduit(ligneId: string, produitId: string) {
    const p = produits.find(pr => pr.id === produitId);
    if (!p) return;
    // Si c'est un kit : supprimer la ligne vide et insérer le groupe
    if (p.typeKit) {
      setLignes(prev => prev.filter(l => l.id !== ligneId));
      insertKit(p);
      return;
    }
    if (p) {
      const client = clients.find(c => c.id === clientId);
      const autoQuantite = (surfaceGlobaleM2 > 0 && p.consommation && p.poids)
        ? calcQuantiteSurface(p, surfaceGlobaleM2)
        : null;
      setLignes(prev => prev.map(l => {
        if (l.id !== ligneId) return l;
        const quantite = autoQuantite !== null ? autoQuantite : l.quantite;
        const palierPrix = getPrixPourQuantite(p, quantite);
        const prix = client?.estRevendeur ? palierPrix.prixRevendeur : palierPrix.prixHT;
        // Initialise les variantes : première option de chaque dimension
        const variantesChoisies: Record<string, string> = {};
        if (p.variantes) {
          p.variantes.forEach(dim => {
            if (dim.options.length > 0) variantesChoisies[dim.id] = dim.options[0].label;
          });
        }
        return { ...l, produitId: p.id, description: p.description, prixUnitaireHT: prix, tva: p.tva, unite: p.unite, remise: 0, quantite, surfaceM2: surfaceGlobaleM2 > 0 ? surfaceGlobaleM2 : undefined, consommation: undefined, variantesChoisies: Object.keys(variantesChoisies).length > 0 ? variantesChoisies : undefined };
      }));
      // Initialise le fournisseur prioritaire pour cette ligne dans le comparatif
      const pfs = produitFournisseurs.filter(pf => pf.produitId === produitId);
      const prio = pfs.find(pf => pf.estPrioritaire) || pfs[0];
      if (prio) setSelectedFournisseurPerLigne(prev => ({ ...prev, [ligneId]: prio.fournisseurId }));
    }
  }

  // Recalculer les prix quand le client change (revendeur / remises par catégorie)
  const prevClientIdRef = useRef(clientId);
  useEffect(() => {
    if (!dialogOpen || clientId === prevClientIdRef.current) {
      prevClientIdRef.current = clientId;
      return;
    }
    prevClientIdRef.current = clientId;
    const client = clients.find(c => c.id === clientId);
    setLignes(prev => prev.map(l => {
      if (!l.produitId) return l;
      const p = produits.find(pr => pr.id === l.produitId);
      if (!p) return l;
      const palierPrix = getPrixPourQuantite(p, l.quantite);
      const prix = client?.estRevendeur ? palierPrix.prixRevendeur : palierPrix.prixHT;
      return { ...l, prixUnitaireHT: prix, remise: 0 };
    }));
  }, [clientId, dialogOpen, clients, produits]);

  function save(silent = false): string | null {
    if (!clientId && statut !== 'système') { if (!silent) toast.error('Sélectionnez un client'); return null; }
    if (lignes.length === 0) { if (!silent) toast.error('Ajoutez au moins une ligne'); return null; }

    let savedId = editingId;
    if (editingId) {
      const existing = devis.find(d => d.id === editingId);
      updateDevis(prev => prev.map(d => d.id === editingId ? {
        ...d, clientId, contactId: contactId || undefined, dateCreation, dateValidite, statut, dateEnvoi: dateEnvoi || undefined, lignes, referenceAffaire, systeme: systeme || undefined, notes, conditions, moContent: moContent || undefined, probabiliteReussite, dateRealisation: dateRealisation || undefined, fraisPortHT, fraisPortTVA, fraisPortAuto, adresseLivraisonId: adresseLivraisonId || undefined, contactLivraisonId: contactLivraisonId || undefined, modeCalcul: 'standard', surfaceGlobaleM2: surfaceGlobaleM2 || undefined
      } : d));
      if (!silent) {
        toast.success('Devis modifié');
        logHistorique({ entiteType: 'devis', entiteId: editingId, entiteNumero: existing?.numero ?? editingId, action: 'modification', details: { client: clients.find(c => c.id === clientId)?.nom, referenceAffaire: referenceAffaire || undefined, snapshot: existing ?? null } });
      }
    } else {
      const numero = `DEV-${new Date().getFullYear()}-${String(devis.length + 1).padStart(3, '0')}`;
      savedId = generateId();
      const newDevis: DevisType = {
        id: savedId, numero, clientId, contactId: contactId || undefined, adresseLivraisonId: adresseLivraisonId || undefined, contactLivraisonId: contactLivraisonId || undefined, dateCreation,
        dateValidite, statut, dateEnvoi: dateEnvoi || undefined, lignes, referenceAffaire, systeme: systeme || undefined, notes, conditions, moContent: moContent || undefined, probabiliteReussite, dateRealisation: dateRealisation || undefined, fraisPortHT, fraisPortTVA, fraisPortAuto, modeCalcul: 'standard', surfaceGlobaleM2: surfaceGlobaleM2 || undefined
      };
      updateDevis(prev => [...prev, newDevis]);
      if (!silent) {
        toast.success('Devis créé');
        logHistorique({ entiteType: 'devis', entiteId: savedId!, entiteNumero: numero, action: 'creation', details: { client: clients.find(c => c.id === clientId)?.nom, referenceAffaire: referenceAffaire || undefined } });
      }
    }
    if (!silent) {
      dialogOpenRef.current = false; // évite la ré-entrance via popstate
      setDialogOpen(false);
      setEditingId(null);
      if (openedViaUrlRef.current) { openedViaUrlRef.current = false; navigate(-1); }
      else if (pushedStateRef.current) { pushedStateRef.current = false; window.history.back(); }
    }
    return savedId;
  }

  // ── Mise en œuvre (MO) ──────────────────────────────────────────────────────
  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Construit le récap HTML depuis groupes, notes (texte) et lignes (description + note de ligne)
  function buildMoRecap(): string {
    const parts: string[] = [];
    for (const l of lignes) {
      if (l.type === 'groupe') {
        parts.push(`<h2>${escapeHtml(l.description || 'Groupe')}</h2>`);
      } else if (l.type === 'texte') {
        if (l.description?.trim()) parts.push(`<p>${escapeHtml(l.description)}</p>`);
      } else if (l.type === 'soustotal') {
        // ignoré dans la MO
      } else {
        // ligne produit : description du produit puis note de ligne
        const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
        const titre = prod?.description || l.description || prod?.reference || '';
        if (titre.trim()) parts.push(`<p><strong>${escapeHtml(titre)}</strong></p>`);
        if (l.note?.trim()) parts.push(`<p>${escapeHtml(l.note).replace(/\n/g, '<br>')}</p>`);
      }
    }
    if (parts.length === 0) return '<p></p>';
    return parts.join('\n');
  }
  function regenerateMo() {
    if (moContent.trim() && !window.confirm('Régénérer le récapitulatif écrasera le contenu actuel de la Mise en œuvre. Continuer ?')) return;
    setMoContent(buildMoRecap());
    toast.success('Récapitulatif Mise en œuvre généré');
  }
  async function exportMoPdf() {
    if (!moPrintRef.current) return;
    // S'assure que le devis est enregistré (pour disposer d'un id auquel rattacher la PJ)
    const devisId = editingId || save(true);
    setMoGenerating(true);
    try {
      const numero = (devisId ? devis.find(d => d.id === devisId)?.numero : '') || 'devis';
      const fileName = `MO_${numero}${systeme ? '_' + systeme.replace(/[^\w-]+/g, '_') : ''}.pdf`;
      const base64 = await generatePdfFromElement(moPrintRef.current, { docTitle: `Mise en œuvre — ${numero}` });
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      // Enregistre dans le même dossier que les devis
      const res = await writeFileToFolder(fileName, bytes, false);
      // Joint le PDF aux Notes & Fichiers du devis (CRM)
      let attached = false;
      if (devisId) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const uid = user?.id;
          if (uid) {
            const path = `${uid}/${devisId}/${Date.now()}_${fileName}`;
            const { error: upErr } = await supabase.storage.from('devis-pj').upload(path, blob, { upsert: false, contentType: 'application/pdf' });
            if (!upErr) {
              const { data: signedData } = await supabase.storage.from('devis-pj').createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
              const url = signedData?.signedUrl ?? path;
              const { error: dbErr } = await supabase.from('devis_pieces_jointes').insert({
                user_id: uid, devis_id: devisId, type: 'fichier',
                fichier_nom: fileName, fichier_url: url, fichier_taille: bytes.length, fichier_mime: 'application/pdf',
              });
              attached = !dbErr;
            }
          }
        } catch (e) { console.error('[MO PJ]', e); }
      }
      const suffix = attached ? ' · ajouté aux Notes & Fichiers' : '';
      if (res.ok) toast.success(`PDF Mise en œuvre sauvegardé dans "${res.folderName}"${suffix}`, { description: fileName, duration: 6000 });
      else toast.success(`PDF Mise en œuvre généré${suffix}`, { description: fileName, duration: 4000 });
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la génération du PDF Mise en œuvre');
    } finally {
      setMoGenerating(false);
    }
  }

  // Auto-save en temps réel pour les devis en édition
  const autoSaveRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!editingId || !dialogOpen) return;
    clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      if ((clientId || statut === 'système') && lignes.length > 0) {
        updateDevis(prev => prev.map(d => d.id === editingId ? {
          ...d, clientId, contactId: contactId || undefined, dateCreation, dateValidite, statut, dateEnvoi: dateEnvoi || undefined, lignes, referenceAffaire, systeme: systeme || undefined, notes, conditions, moContent: moContent || undefined, probabiliteReussite, dateRealisation: dateRealisation || undefined, fraisPortHT, fraisPortTVA, fraisPortAuto, adresseLivraisonId: adresseLivraisonId || undefined, contactLivraisonId: contactLivraisonId || undefined, modeCalcul: 'standard', surfaceGlobaleM2: surfaceGlobaleM2 || undefined
        } : d));
      }
    }, 500);
    return () => clearTimeout(autoSaveRef.current);
  }, [clientId, dateCreation, dateValidite, statut, dateEnvoi, lignes, referenceAffaire, notes, conditions, moContent, probabiliteReussite, dateRealisation, fraisPortHT, fraisPortTVA, fraisPortAuto, adresseLivraisonId, editingId, dialogOpen, modeCalcul, surfaceGlobaleM2]);

  // Chargement pièces jointes pour la sidebar
  useEffect(() => {
    if (!editingId || !dialogOpen) { setSidebarPjs([]); return; }
    supabase.from('devis_pieces_jointes')
      .select('id, type, contenu, fichier_nom, fichier_url, fichier_taille, fichier_mime, confidentiel, date')
      .eq('devis_id', editingId)
      .order('date', { ascending: false })
      .then(({ data }) => setSidebarPjs((data ?? []).map(r => ({
        id: r.id, type: r.type, contenu: r.contenu ?? undefined,
        fichierNom: r.fichier_nom ?? undefined, fichierUrl: r.fichier_url ?? undefined,
        fichierTaille: r.fichier_taille ?? undefined, fichierMime: r.fichier_mime ?? undefined,
        confidentiel: r.confidentiel ?? false, date: r.date,
      }))));
  }, [editingId, dialogOpen, chatterDevis]); // rechargé quand le chatter se ferme

  // Recalcul auto des quantités quand surface globale change — s'applique aux lignes ayant surface+conso
  // Ne s'exécute que si surfaceGlobaleM2 a réellement changé (pas à l'ouverture du formulaire)
  useEffect(() => {
    if (!dialogOpen || surfaceGlobaleM2 <= 0) {
      prevSurfaceGlobaleRef.current = surfaceGlobaleM2;
      return;
    }
    // Évite d'écraser les surfaces individuelles à l'ouverture du formulaire
    if (prevSurfaceGlobaleRef.current === surfaceGlobaleM2) return;
    prevSurfaceGlobaleRef.current = surfaceGlobaleM2;
    const client = clients.find(c => c.id === clientId);
    setLignes(prev => prev.map(l => {
      if (!l.produitId) return l;
      const p = produits.find(pr => pr.id === l.produitId);
      if (!p || !p.poids) return { ...l, surfaceM2: surfaceGlobaleM2 };
      const conso = l.consommation || p.consommation;
      if (!conso) return { ...l, surfaceM2: surfaceGlobaleM2 };
      const quantite = calcQuantiteSurface(p, surfaceGlobaleM2, l.consommation);
      const prixUnitaireHT = getPrixLigne(p, quantite, l.variantesChoisies, client?.estRevendeur);
      return { ...l, quantite, surfaceM2: surfaceGlobaleM2, prixUnitaireHT };
    }));
  }, [surfaceGlobaleM2, modeCalcul, dialogOpen]);

  // Auto-calcul frais de port basé sur le poids
  useEffect(() => {
    if (!fraisPortAuto || !dialogOpen) return;
    const poidsTotal = lignes.reduce((acc, l) => {
      const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
      return acc + (prod?.poids || 0) * l.quantite;
    }, 0);

    if (transporteur !== 'standard' && BAREMES_TRANSPORT[transporteur]) {
      const { prix } = calculerFraisPortBareme(BAREMES_TRANSPORT[transporteur].bareme, poidsTotal);
      const coeffTotal = expressJ1 ? coeffTransport * coeffExpress : coeffTransport;
      if (prix !== null) setFraisPortHT(Math.round(prix * coeffTotal * 100) / 100);
    } else {
      // Franco : si total HT lignes ≥ seuil → port offert
      const totalHTLignes = calculerTotalDevis(lignes, 0, 0).totalHT;
      const std = getStandardBareme();
      if (totalHTLignes >= std.seuilFranco) {
        setFraisPortHT(0);
        return;
      }
      const hasGranulat = lignes.some(l => {
        const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
        return prod?.categorie?.toLowerCase().includes('granulat');
      });
      const port = calculerFraisPort(poidsTotal, hasGranulat);
      if (port !== null) setFraisPortHT(port);
    }
  }, [lignes, fraisPortAuto, dialogOpen, produits, transporteur, coeffTransport, expressJ1, coeffExpress]);

  function openArchiveDialog(d: DevisType) {
    setArchiveTarget(d);
    setArchiveDialogOpen(true);
  }

  function confirmArchive(d: DevisType, data: { archiveRaison: RaisonArchive; archiveCommentaire: string; archiveConcurrents: ConcurrentProduit[] }) {
    updateDevis(prev => prev.map(dv => dv.id === d.id ? {
      ...dv,
      statut: 'archivé' as DevisType['statut'],
      archiveDate: new Date().toISOString().split('T')[0],
      archiveRaison: data.archiveRaison,
      archiveCommentaire: data.archiveCommentaire,
      archiveConcurrents: data.archiveConcurrents.length > 0 ? data.archiveConcurrents : undefined,
    } : dv));
    logHistorique({ entiteType: 'devis', entiteId: d.id, entiteNumero: d.numero, action: 'statut', details: { ancienStatut: d.statut, nouveauStatut: 'archivé', raison: data.archiveRaison } });
    toast.success(`Devis ${d.numero} archivé`);
    setArchiveDialogOpen(false);
    setArchiveTarget(null);
  }

  function updateStatut(id: string, newStatut: DevisType['statut']) {
    const d = devis.find(dv => dv.id === id);
    // Ouvrir le dialog d'archivage si passage à 'archivé' ou 'refusé'
    if ((newStatut === 'archivé' || newStatut === 'refusé') && d) {
      openArchiveDialog({ ...d, statut: newStatut });
      return;
    }
    // Passage à 'accepté' → probabilité 100% + date de réalisation = aujourd'hui (si absente)
    const acceptPatch = (newStatut === 'accepté')
      ? { probabiliteReussite: 100, dateRealisation: d?.dateRealisation || new Date().toISOString().split('T')[0] }
      : {};
    updateDevis(prev => prev.map(dv => dv.id === id ? { ...dv, statut: newStatut, ...acceptPatch } : dv));
    toast.success('Statut mis à jour');
    logHistorique({ entiteType: 'devis', entiteId: id, entiteNumero: d?.numero ?? id, action: 'statut', details: { ancienStatut: d?.statut, nouveauStatut: newStatut } });
    if (newStatut === 'accepté' && d) {
      const devisData = { ...d, statut: newStatut as DevisType['statut'] };

      // Création automatique de la commande client si elle n'existe pas encore
      const dejaExistante = commandesClient.some(c => c.devisId === id);
      if (!dejaExistante) {
        const total = calculerTotalDevis(devisData.lignes, devisData.fraisPortHT, devisData.fraisPortTVA);
        const newNumero = `CMD-${new Date().getFullYear()}-${String(commandesClient.length + 1).padStart(4, '0')}`;
        const newCmd: CommandeClient = {
          id: generateId(),
          clientId: devisData.clientId,
          devisId: devisData.id,
          numero: newNumero,
          dateCreation: new Date().toISOString().split('T')[0],
          statut: 'a_traiter',
          lignes: devisData.lignes,
          totalHT: total.totalHT,
          totalTVA: total.totalTVA,
          totalTTC: total.totalTTC,
          fraisPortHT: devisData.fraisPortHT || 0,
          referenceAffaire: devisData.referenceAffaire || undefined,
          notes: devisData.notes || undefined,
        };
        updateCommandesClient(prev => [...prev, newCmd]);
        toast.success(`✅ Commande client ${newNumero} créée automatiquement`);
      }

      setCommandeConfirmDevis(devisData);
    }
  }

  function confirmRemove(id: string) {
    setDeleteTargetId(id);
    setDeleteConfirmOpen(true);
  }

  function executeDelete() {
    if (deleteTargetId) {
      updateDevis(prev => prev.filter(d => d.id !== deleteTargetId));
      toast.success('Devis supprimé');
      setDeleteTargetId(null);
      setDeleteConfirmOpen(false);
    }
  }

  const total = calculerTotalDevis(lignes, fraisPortHT, fraisPortTVA);

  /* ── Coller image dans note de ligne ── */
  function handleLigneNotePaste(ligneId: string, e: React.ClipboardEvent) {
    const imageItems = Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    e.preventDefault();
    for (const item of imageItems) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (!file) continue;
      const ext = file.type.split('/')[1] || 'png';
      const name = `image_${Date.now()}.${ext}`;
      // Aperçu immédiat avec URL blob locale
      const preview = URL.createObjectURL(file);
      setLineImages(prev => ({ ...prev, [ligneId]: [...(prev[ligneId] || []), { url: preview, name }] }));
      // Upload en arrière-plan
      if (editingId) {
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (!user) return;
          const path = `${user.id}/${editingId}/${Date.now()}_${name}`;
          supabase.storage.from('devis-pj').upload(path, file, { upsert: false })
            .then(({ error: upErr }) => {
              if (upErr) { toast.error('Erreur upload image'); return; }
              return supabase.storage.from('devis-pj').createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
            })
            .then(res => {
              if (!res?.data) return;
              const signedUrl = res.data.signedUrl;
              // Remplace l'URL blob par l'URL signée Supabase
              setLineImages(prev => ({
                ...prev,
                [ligneId]: (prev[ligneId] || []).map(img => img.url === preview ? { ...img, url: signedUrl } : img),
              }));
              URL.revokeObjectURL(preview);
              supabase.from('devis_pieces_jointes').insert({
                user_id: user.id, devis_id: editingId, type: 'fichier',
                fichier_nom: name, fichier_url: signedUrl, fichier_taille: file.size, fichier_mime: file.type,
                ligne_id: ligneId,
              });
            });
        });
      }
    }
    toast.success('Image(s) collée(s)');
  }

  // Contrôle de filtre par colonne (rendu dans un popover ancré à l'icône filtre)
  // onClose : si fermé sans filtre actif → replie la colonne (retour à l'icône seule)
  function renderFilterControl(colKey: DevisTableColKey) {
    const fVal = colFiltersD[colKey] || '';
    const handleClose = () => {
      if (!colFiltersD[colKey]) {
        setOpenFilterColsD(prev => { const n = new Set(prev); n.delete(colKey); return n; });
      }
    };
    if (colKey === 'statut') {
      return <FilterChoiceInput value={fVal} onChange={v => setFilterD('statut', v)} onClose={handleClose} excludable options={[
        { value: '', label: 'Tous' },
        { value: 'brouillon', label: 'Brouillon' },
        { value: 'envoyé', label: 'Envoyé' },
        { value: 'accepté', label: 'Accepté' },
        { value: 'refusé', label: 'Refusé' },
        { value: 'expiré', label: 'Expiré' },
        { value: 'archivé', label: '🗄 Archivés' },
        { value: 'système', label: 'Système (modèles)' },
      ]} />;
    }
    if (colKey === 'validite') {
      return <FilterChoiceInput value={fVal} onChange={v => setFilterD('validite', v)} onClose={handleClose} options={[
        { value: '', label: 'Tous' },
        { value: 'oui', label: 'Hors délais' },
        { value: 'non', label: 'Dans les délais' },
      ]} />;
    }
    if (colKey === 'date') return <FilterDateInput value={fVal} onChange={v => setFilterD('date', v)} onClose={handleClose} />;
    if (colKey === 'totalHT') return <FilterAmountInput value={fVal} onChange={v => setFilterD('totalHT', v)} onClose={handleClose} />;
    const clientSugg = [
      ...clients.map(c => c.societe || c.nom).filter(Boolean) as string[],
      ...clients.flatMap(c => (c.contacts || []).map(ct => [ct.prenom, ct.nom].filter(Boolean).join(' ')).filter(Boolean)),
    ];
    const suggSource: Record<string, string[]> = {
      client: clientSugg,
      numero: devis.map(d => d.numero).filter(Boolean),
      refAffaire: devis.map(d => d.referenceAffaire).filter(Boolean) as string[],
      systeme: devis.map(d => d.systeme).filter(Boolean) as string[],
    };
    return <FilterSuggestInput value={fVal} onChange={v => setFilterD(colKey, v)} onClose={handleClose} suggestions={suggSource[colKey] || []} placeholder={colKey === 'client' ? 'Client ou contact…' : 'Filtrer…'} />;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      <PageHeaderSlot>
          <div className="relative w-40 sm:w-56 md:w-80">
            {searchMode === 'produit'
              ? <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
              : <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />}
            <Input
              placeholder={searchMode === 'produit' ? 'Filtrer par produit…' : 'Rechercher…'}
              value={searchMode === 'produit' ? filterProduit : search}
              onChange={e => (searchMode === 'produit' ? setFilterProduit(e.target.value) : setSearch(e.target.value))}
              className="pl-9 pr-9 h-9"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted" title="Mode de recherche">
                  <Settings className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setSearchMode('global')}>
                  <Search className="w-4 h-4 mr-2 text-muted-foreground" /> Recherche générale {searchMode === 'global' && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSearchMode('produit')}>
                  <Package className="w-4 h-4 mr-2 text-muted-foreground" /> Filtrer par produit {searchMode === 'produit' && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
                </DropdownMenuItem>
                {(search || filterProduit) && (
                  <DropdownMenuItem onClick={() => { setSearch(''); setFilterProduit(''); }}>
                    <XIcon className="w-4 h-4 mr-2 text-muted-foreground" /> Tout effacer
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="ml-auto flex gap-2 shrink-0 flex-wrap justify-end items-center">
            {/* Vue + Analyser un mail regroupés dans un bouton Action */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="px-3 gap-1 shrink-0">Action <ChevronDown className="w-3 h-3 opacity-60" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setDevisView('liste')}>
                  <LayoutList className="w-4 h-4 mr-2 text-muted-foreground" /> Vue liste (cartes) {devisView === 'liste' && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDevisView('tableau')}>
                  <Table2 className="w-4 h-4 mr-2 text-muted-foreground" /> Vue tableau {devisView === 'tableau' && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEmailAnalyzerOpen(true)} className="border-t border-border mt-1">
                  <Mail className="w-4 h-4 mr-2 text-muted-foreground" /> Analyser un mail
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={openNew} className="shrink-0"><Plus className="w-4 h-4 mr-2" /> Nouveau devis</Button>
          </div>
      </PageHeaderSlot>

      {/* ══ Vue Tableau ══════════════════════════════════════════════════════ */}
      {devisView === 'tableau' && (
        <div className="bg-card overflow-hidden flex flex-col flex-1 min-h-0 rounded-xl border border-border md:rounded-none md:border-0 md:absolute md:inset-0">
          {(hasActiveFiltersD()) && (
            <div className="px-4 py-2 border-b border-border flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Filtres actifs :</span>
              {Object.entries(colFiltersD).filter(([, v]) => v).map(([k, v]) => {
                let display = v;
                if (k === 'statut') {
                  const cs = parseChoiceFilter(v);
                  if (cs.mode === 'exclude') display = `sauf ${cs.excluded.join(', ')}`;
                  else display = cs.only;
                }
                return (
                  <span key={k} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                    {DEVIS_TABLE_COLS_DEF.find(c => c.key === k)?.label} : {display}
                    <button onClick={() => setFilterD(k as DevisTableColKey, '')}><XIcon className="w-3 h-3" /></button>
                  </span>
                );
              })}
              <button onClick={() => { setColFiltersD({}); setOpenFilterColsD(new Set()); }} className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"><XIcon className="w-3 h-3" /> Effacer</button>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {devisCols.ordered(DEVIS_TABLE_COLS_DEF, k => visDevisTableCols.has(k)).map(col => {
                    const sortKey = col.key === 'totalHT' ? 'total' : col.key === 'date' ? 'date' : col.key === 'validite' ? 'validite' : col.key === 'marge' ? 'marge' : col.key === 'port' ? 'port' : col.key === 'numero' ? 'numero' : col.key === 'client' ? 'client' : col.key;
                    const isAsc = sortBy === `${sortKey}_asc`;
                    const isDesc = sortBy === `${sortKey}_desc`;
                    const isSorted = isAsc || isDesc;
                    const SI = isSorted ? (isAsc ? ChevronUp : ChevronDown) : ChevronsUpDown;
                    const isFilterable = ['numero', 'statut', 'client', 'refAffaire', 'systeme', 'validite', 'date', 'totalHT'].includes(col.key);
                    const hasFilter = !!(colFiltersD[col.key]);
                    const isFilterOpen = openFilterColsD.has(col.key);
                    const isDragOver = devisCols.dragOverKey === col.key && devisCols.dragKey !== col.key;
                    return (
                      <th key={col.key} {...devisCols.thProps(col.key)} style={devisCols.widthStyle(col.key)} className={`relative px-3 py-2 font-medium text-muted-foreground select-none whitespace-nowrap cursor-grab active:cursor-grabbing sticky top-0 z-10 ${isDragOver ? 'bg-primary/10' : devisCols.dragKey === col.key ? 'bg-muted opacity-40' : 'bg-muted'}`}>
                        {isDragOver && <span className="absolute top-0 left-0 h-full w-0.5 bg-primary z-20" />}
                        <div className={`flex items-center gap-0.5 ${col.align === 'right' ? 'justify-end' : ''}`}>
                          <button onClick={() => { const asc = `${sortKey}_asc`; const desc = `${sortKey}_desc`; setSortBy(isAsc ? desc : asc); }} className="flex items-center gap-1 hover:text-foreground cursor-pointer min-w-0">
                            {col.align === 'right' && <SI className={`w-3 h-3 shrink-0 ${isSorted ? 'text-primary' : 'opacity-40'}`} />}
                            <span className="truncate">{col.label}</span>
                            {col.align !== 'right' && <SI className={`w-3 h-3 shrink-0 ${isSorted ? 'text-primary' : 'opacity-40'}`} />}
                          </button>
                          {isFilterable && (
                            isFilterOpen ? (() => {
                              // Choix fixes : largeur auto. Champs (texte/date/montant) : largeur fixe.
                              const isChoice = col.key === 'statut' || col.key === 'validite';
                              return (
                                <span className="font-normal inline-flex items-center gap-0.5 min-w-0" onClick={e => e.stopPropagation()}>
                                  <span className={isChoice ? 'shrink-0' : 'min-w-0 w-36'}>{renderFilterControl(col.key)}</span>
                                  <button onClick={() => toggleFilterColD(col.key)} title="Fermer le filtre" className="p-0.5 rounded hover:bg-muted/80 text-muted-foreground/60 shrink-0"><XIcon className="w-3 h-3" /></button>
                                </span>
                              );
                            })() : (
                              <button onClick={() => toggleFilterColD(col.key)} className={`p-0.5 rounded hover:bg-muted/80 transition-colors shrink-0 ${hasFilter ? 'text-primary' : 'text-muted-foreground/25 hover:text-muted-foreground/60'}`}>
                                <Filter className="w-3 h-3" />
                              </button>
                            )
                          )}
                        </div>
                        <ColResizeHandle {...devisCols.resizeHandleProps(col.key)} />
                      </th>
                    );
                  })}
                  <th className="px-2 py-2 sticky top-0 z-10 bg-muted text-right whitespace-nowrap">
                    <div className="relative inline-block" ref={colMenuDevisRef}>
                      <button onClick={() => setColMenuDevis(o => !o)} title="Colonnes & export" className="p-1.5 rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground transition-colors">
                        <Settings className="w-4 h-4" />
                      </button>
                      {colMenuDevis && (
                        <div className="absolute right-0 top-full mt-1 z-40 bg-card border border-border rounded-xl shadow-lg py-1 min-w-48 text-left font-normal">
                          <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Colonnes affichées</p>
                          <div className="max-h-72 overflow-y-auto">
                            {DEVIS_TABLE_COLS_DEF.map(c => (
                              <label key={c.key} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted/50 cursor-pointer text-sm select-none">
                                <input type="checkbox" checked={visDevisTableCols.has(c.key)} onChange={() => setVisDevisTableCols(prev => { const n = new Set(prev); n.has(c.key) ? n.delete(c.key) : n.add(c.key); return n; })} className="rounded accent-primary w-3.5 h-3.5" />
                                {c.label}
                              </label>
                            ))}
                          </div>
                          <button onClick={() => { setColMenuDevis(false); exportToExcel(devis.map(d => { const client = clients.find(c => c.id === d.clientId); const totals = calculerTotalDevis(d.lignes, d.fraisPortHT, d.fraisPortTVA); return { Numéro: d.numero, Client: client?.nom || '', Société: client?.societe || '', Date: d.dateCreation, Validité: d.dateValidite, Statut: d.statut, 'Réf. Affaire': d.referenceAffaire || '', 'Total HT': totals.totalHT, 'Total TVA': totals.totalTVA, 'Total TTC': totals.totalTTC, Notes: d.notes || '' }; }), 'devis', 'Devis'); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 text-foreground border-t border-border mt-1">
                            <Download className="w-4 h-4 text-muted-foreground" /> Exporter (Excel)
                          </button>
                        </div>
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTable.map(d => {
                  const client = clients.find(c => c.id === d.clientId);
                  const t = calculerTotalDevis(d.lignes, d.fraisPortHT || 0, d.fraisPortTVA ?? 20);
                  const totalAchat = d.lignes.reduce((acc, l) => {
                    if (l.type && l.type !== 'ligne') return acc;
                    if (!l.produitId) return acc + (l.prixAchatLigne ?? 0) * l.quantite;
                    const prod = produits.find(p => p.id === l.produitId);
                    if (!prod) return acc;
                    return acc + getPrixPourQuantite(prod, l.quantite).prixAchat * l.quantite * (1 - (l.remise || 0) / 100);
                  }, 0);
                  const totalHTD = calculerTotalDevis(d.lignes, 0, 0).totalHT;
                  const margeD = totalHTD > 0 ? ((totalHTD - totalAchat) / totalHTD * 100) : 0;
                  const horsDelai = !!d.dateValidite && d.dateValidite < new Date().toISOString().split('T')[0] && !['accepté', 'refusé', 'archivé', 'système'].includes(d.statut);
                  const renderCellD = (key: DevisTableColKey) => {
                    const ws = devisCols.widthStyle(key);
                    const trunc = ws ? ' truncate' : '';
                    switch (key) {
                      case 'numero': return <td style={ws} className={`px-3 py-2.5${trunc}`}><p className="font-semibold text-sm truncate">{d.numero}</p></td>;
                      case 'statut': return (
                        <td style={ws} className="px-3 py-2.5">
                          <select value={d.statut} onClick={e => e.stopPropagation()} onChange={e => { const ns = e.target.value as DevisType['statut']; const patch = ns === 'accepté' ? { probabiliteReussite: 100, dateRealisation: d.dateRealisation || new Date().toISOString().split('T')[0] } : {}; updateDevis(prev => prev.map(dv => dv.id === d.id ? { ...dv, statut: ns, ...patch } : dv)); }} className={`text-xs px-1.5 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary ${statutColors[d.statut] || 'bg-muted text-muted-foreground'}`}>
                            <option value="brouillon">brouillon</option><option value="envoyé">envoyé</option><option value="accepté">accepté</option><option value="refusé">refusé</option><option value="expiré">expiré</option><option value="archivé">archivé</option>
                          </select>
                        </td>
                      );
                      case 'client': return <td style={ws} className="px-3 py-2.5"><p className="text-sm font-medium truncate max-w-[160px]">{client?.societe || client?.nom || '—'}</p></td>;
                      case 'refAffaire': return <td style={ws} className={`px-3 py-2.5 text-muted-foreground text-xs${trunc}`} title={d.referenceAffaire || ''}>{d.referenceAffaire || '—'}</td>;
                      case 'systeme': return <td style={ws} className={`px-3 py-2.5 text-muted-foreground text-xs${trunc}`} title={d.systeme || ''}>{d.systeme || '—'}</td>;
                      case 'date': return <td style={ws} className="px-3 py-2.5 text-sm text-muted-foreground whitespace-nowrap">{formatDate(d.dateCreation)}</td>;
                      case 'validite': return <td style={ws} className={`px-3 py-2.5 text-sm whitespace-nowrap ${horsDelai ? 'text-destructive font-medium' : 'text-muted-foreground'}`} title={horsDelai ? 'Hors délais' : undefined}>{formatDate(d.dateValidite)}</td>;
                      case 'totalHT': return <td style={ws} className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{formatMontant(t.totalHT)}</td>;
                      case 'marge': return <td style={ws} className={`px-3 py-2.5 text-right text-sm font-medium whitespace-nowrap ${margeD < 0 ? 'text-destructive' : margeD < 20 ? 'text-warning' : 'text-success'}`}>{totalHTD > 0 ? `${margeD.toFixed(1)} %` : '—'}</td>;
                      case 'port': return <td style={ws} className="px-3 py-2.5 text-right text-sm text-muted-foreground whitespace-nowrap">{d.fraisPortHT ? formatMontant(d.fraisPortHT) : '—'}</td>;
                      case 'reussite': return <td style={ws} className="px-3 py-2.5 text-right text-sm whitespace-nowrap">{d.probabiliteReussite != null ? <span className={`font-medium ${d.probabiliteReussite >= 75 ? 'text-success' : d.probabiliteReussite >= 50 ? 'text-warning' : d.probabiliteReussite > 0 ? 'text-orange-500' : 'text-muted-foreground'}`}>{d.probabiliteReussite}%</span> : <span className="text-muted-foreground">—</span>}</td>;
                      case 'realisation': return <td style={ws} className="px-3 py-2.5 text-sm text-muted-foreground whitespace-nowrap">{d.dateRealisation ? formatDate(d.dateRealisation) : '—'}</td>;
                      default: return <td style={ws} className="px-3 py-2.5" />;
                    }
                  };
                  return (
                    <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer" onClick={e => { if ((e.target as HTMLElement).closest('select, button, a')) return; openEdit(d); }}>
                      {devisCols.ordered(DEVIS_TABLE_COLS_DEF, k => visDevisTableCols.has(k)).map(col => <Fragment key={col.key}>{renderCellD(col.key)}</Fragment>)}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end">
                          <RowActionsMenu actions={[
                            { icon: <Eye className="w-4 h-4" />, label: 'Aperçu', onClick: () => setPreviewDevis(d) },
                            { icon: <MessageSquare className="w-4 h-4" />, label: 'Notes & fichiers', onClick: () => setChatterDevis(d) },
                            { icon: <Copy className="w-4 h-4" />, label: 'Dupliquer', onClick: () => duplicate(d) },
                            { icon: <Mail className="w-4 h-4" />, label: 'Envoyer par email', onClick: () => setEmailDevis(d) },
                            { icon: <Archive className="w-4 h-4" />, label: 'Archiver', onClick: () => openArchiveDialog(d) },
                            { icon: <Trash2 className="w-4 h-4" />, label: 'Supprimer', onClick: () => confirmRemove(d.id), danger: true },
                          ]} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sortedTable.length === 0 && <p className="text-center py-8 text-muted-foreground text-sm">Aucun devis</p>}
          {sortedTable.length > 0 && <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border">{sortedTable.length} devis</p>}
        </div>
      )}

      {/* ══ Vue Liste (cartes) ════════════════════════════════════════════════ */}
      {devisView === 'liste' && <div className="flex flex-col flex-1 min-h-0 gap-2 -mt-2">
        {/* Bandeau d'en-têtes fixe au-dessus des cartes */}
        <div className="shrink-0 space-y-2 bg-background -mx-4 md:-mx-6 px-4 md:px-6 pb-1">
        {/* Barre tri + filtres (reprend l'en-tête du tableau) — une seule ligne défilante */}
        <div className="flex flex-nowrap items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 overflow-x-auto [&>*]:shrink-0">
          <span className="text-xs text-muted-foreground mr-1 shrink-0">Trier / filtrer :</span>
          {DEVIS_TABLE_COLS_DEF.filter(c => visDevisTableCols.has(c.key)).map(col => {
            const sortKey = col.key === 'totalHT' ? 'total' : col.key;
            const isAsc = sortBy === `${sortKey}_asc`;
            const isDesc = sortBy === `${sortKey}_desc`;
            const isSorted = isAsc || isDesc;
            const SI = isSorted ? (isAsc ? ChevronUp : ChevronDown) : ChevronsUpDown;
            const isFilterable = ['numero', 'statut', 'client', 'refAffaire', 'systeme', 'validite', 'date', 'totalHT'].includes(col.key);
            const hasFilter = !!(colFiltersD[col.key]);
            const isFilterOpen = openFilterColsD.has(col.key);
            const isChoice = col.key === 'statut' || col.key === 'validite';
            return (
              <div key={col.key} className="flex items-center gap-0.5 rounded-md border border-border/60 bg-background pl-2 pr-1 py-0.5">
                <button onClick={() => setSortBy(isAsc ? `${sortKey}_desc` : `${sortKey}_asc`)} className="flex items-center gap-1 text-xs hover:text-foreground">
                  <span>{col.label}</span>
                  <SI className={`w-3 h-3 ${isSorted ? 'text-primary' : 'opacity-40'}`} />
                </button>
                {isFilterable && (
                  isFilterOpen ? (
                    <span className="font-normal inline-flex items-center gap-0.5 min-w-0">
                      <span className={isChoice ? 'shrink-0' : 'min-w-0 w-32'}>{renderFilterControl(col.key)}</span>
                      <button onClick={() => toggleFilterColD(col.key)} title="Fermer le filtre" className="p-0.5 rounded hover:bg-muted/80 text-muted-foreground/60 shrink-0"><XIcon className="w-3 h-3" /></button>
                    </span>
                  ) : (
                    <button onClick={() => toggleFilterColD(col.key)} title="Filtrer" className={`p-0.5 rounded hover:bg-muted/80 transition-colors shrink-0 ${hasFilter ? 'text-primary' : 'text-muted-foreground/30 hover:text-muted-foreground/60'}`}><Filter className="w-3 h-3" /></button>
                  )
                )}
              </div>
            );
          })}
          <div className="ml-auto shrink-0">
            <TableGearMenu
              cols={DEVIS_TABLE_COLS_DEF}
              visible={visDevisTableCols}
              onToggle={k => setVisDevisTableCols(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; })}
              onExport={() => exportToExcel(devis.map(d => { const client = clients.find(c => c.id === d.clientId); const totals = calculerTotalDevis(d.lignes, d.fraisPortHT, d.fraisPortTVA); return { Numéro: d.numero, Client: client?.nom || '', Société: client?.societe || '', Date: d.dateCreation, Validité: d.dateValidite, Statut: d.statut, 'Réf. Affaire': d.referenceAffaire || '', 'Total HT': totals.totalHT, 'Total TVA': totals.totalTVA, 'Total TTC': totals.totalTTC, Notes: d.notes || '' }; }), 'devis', 'Devis')}
            />
          </div>
        </div>
        {hasActiveFiltersD() && (
          <div className="flex items-center gap-2 flex-wrap rounded-lg border border-border bg-card px-3 py-2">
            <span className="text-xs text-muted-foreground">Filtres actifs :</span>
            {Object.entries(colFiltersD).filter(([, v]) => v).map(([k, v]) => {
              let display = v;
              if (k === 'statut') { const cs = parseChoiceFilter(v); display = cs.mode === 'exclude' ? `sauf ${cs.excluded.join(', ')}` : cs.only; }
              return (
                <span key={k} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                  {DEVIS_TABLE_COLS_DEF.find(c => c.key === k)?.label} : {display}
                  <button onClick={() => setFilterD(k as DevisTableColKey, '')}><XIcon className="w-3 h-3" /></button>
                </span>
              );
            })}
            <button onClick={() => { setColFiltersD({}); setOpenFilterColsD(new Set()); }} className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"><XIcon className="w-3 h-3" /> Effacer</button>
          </div>
        )}
        </div>
        <div className="flex-1 min-h-0 overflow-auto space-y-3 pr-0.5">
        {sortedTable.map(d => {
          const client = clients.find(c => c.id === d.clientId);
          const t = calculerTotalDevis(d.lignes, d.fraisPortHT || 0, d.fraisPortTVA ?? 20);
          const totalAchatD = d.lignes.reduce((acc, l) => {
            if (l.type && l.type !== 'ligne') return acc;
            if (!l.produitId) {
              // Toutes les lignes libres (surcharges incluses) : utiliser prixAchatLigne stocké
              return acc + (l.prixAchatLigne ?? 0) * l.quantite;
            }
            const prod = produits.find(p => p.id === l.produitId);
            if (!prod) return acc;
            const prixAchat = getPrixPourQuantite(prod, l.quantite).prixAchat;
            return acc + prixAchat * l.quantite * (1 - (l.remise || 0) / 100);
          }, 0);
          const totalHTD = calculerTotalDevis(d.lignes, 0, 0).totalHT;
          const margeD = totalHTD - totalAchatD;
          const tauxMargeD = totalHTD > 0 ? (margeD / totalHTD) * 100 : 0;
          const coeffD = totalAchatD > 0 ? Math.round(totalHTD / totalAchatD * 100) / 100 : null;
          const cfLies = commandesFournisseur.filter(cf => cf.devisId === d.id);
          const ccLies = commandesClient.filter(cc => cc.devisId === d.id);
          const facLies = facturesClient.filter(f => f.devisId === d.id);
          const devisContact = d.contactId && client
            ? (client.contacts || []).find(ct => ct.id === d.contactId)
            : null;
          const contactLabel = devisContact
            ? [devisContact.prenom, devisContact.nom].filter(Boolean).join(' ') + (devisContact.fonction ? ` · ${devisContact.fonction}` : '')
            : null;
          const adresseLivraison = d.adresseLivraisonId
            ? client?.adressesLivraison?.find(a => a.id === d.adresseLivraisonId)
            : null;
          return (
            <div key={d.id} className="bg-card rounded-xl border border-border p-4 cursor-pointer hover:border-primary/40 transition-colors" onClick={e => { if ((e.target as HTMLElement).closest('select, button, a')) return; openEdit(d); }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-heading font-semibold">{d.numero}</p>
                    {visDevisTableCols.has('refAffaire') && d.referenceAffaire && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-medium">
                        {d.referenceAffaire}
                      </span>
                    )}
                    {visDevisTableCols.has('systeme') && d.systeme && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        {d.systeme}
                      </span>
                    )}
                    {visDevisTableCols.has('statut') && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statutColors[d.statut]}`}>{d.statut}</span>}
                    {d.statut === 'système' && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border border-violet-300 dark:border-violet-700 tracking-wide">
                        MODÈLE
                      </span>
                    )}
                    {d.statut === 'archivé' && d.archiveRaison && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RAISON_ARCHIVE[d.archiveRaison]?.color || 'bg-muted text-muted-foreground'}`}>
                        {RAISON_ARCHIVE[d.archiveRaison]?.label}
                      </span>
                    )}
                  </div>
                  {d.statut === 'archivé' && d.archiveCommentaire && (
                    <p className="text-xs text-muted-foreground mt-0.5 italic">{d.archiveCommentaire}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {client ? (
                      <button
                        onClick={() => navigate(`/clients?search=${encodeURIComponent(client.societe || client.nom)}`)}
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <User className="w-3 h-3" />
                        {client.societe || client.nom}
                      </button>
                    ) : '—'}
                    {contactLabel && <span className="text-muted-foreground"> · {contactLabel}</span>}
                    {' • '}{formatDate(d.dateCreation)}
                  </p>
                  {adresseLivraison && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {adresseLivraison.libelle} — {adresseLivraison.codePostal} {adresseLivraison.ville}
                    </p>
                  )}
                  {d.notes && <p className="text-xs text-muted-foreground mt-1">{d.notes}</p>}
                  {/* ── Documents liés ── */}
                  {(cfLies.length > 0 || ccLies.length > 0 || facLies.length > 0 || d.statut === 'accepté' || d.statut === 'envoyé') && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                      <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      {d.statut === 'accepté' && cfLies.length === 0 ? (
                        <button
                          onClick={() => setCommandeDevis(d)}
                          className="text-xs text-primary hover:underline font-medium"
                        >
                          + Créer BC fournisseur
                        </button>
                      ) : (
                        cfLies.map(cf => (
                          <button
                            key={cf.id}
                            onClick={() => navigate(`/commandes?search=${encodeURIComponent(cf.numero)}`)}
                            className="text-xs px-2 py-0.5 rounded-full bg-info/10 text-info font-medium hover:bg-info/20 transition-colors"
                          >
                            {cf.numero}
                          </button>
                        ))
                      )}
                      {ccLies.map(cc => (
                        <button
                          key={cc.id}
                          onClick={() => navigate(`/commandes-client?search=${encodeURIComponent(cc.numero)}`)}
                          className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium hover:bg-success/20 transition-colors"
                        >
                          <ShoppingCart className="w-3 h-3 inline mr-1" />{cc.numero}
                        </button>
                      ))}
                      {facLies.map(f => (
                        <button
                          key={f.id}
                          onClick={() => navigate(`/factures-client?search=${encodeURIComponent(f.numero)}`)}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${f.estProforma ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
                        >
                          <Receipt className="w-3 h-3 inline mr-1" />{f.numero}
                        </button>
                      ))}
                      {(d.statut === 'envoyé' || d.statut === 'accepté') && facLies.filter(f => f.estProforma).length === 0 && (
                        <button
                          onClick={() => createProforma(d)}
                          className="text-xs text-amber-600 hover:underline font-medium"
                        >
                          + Proforma
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {visDevisTableCols.has('marge') && totalAchatD > 0 && (
                    <div className="text-right text-xs hidden sm:block">
                      <p className={`font-semibold ${coeffD == null ? 'text-muted-foreground' : coeffD >= 1.6 ? 'text-emerald-600 dark:text-emerald-400' : coeffD >= 1.43 ? 'text-orange-500' : 'text-destructive'}`}>
                        {formatMontant(margeD)} · {tauxMargeD.toFixed(1)}%
                      </p>
                      <p className="text-muted-foreground">Marge · Coeff {coeffD ?? '—'}</p>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="font-heading font-bold text-lg">{formatMontant(t.totalHT)}</p>
                    <p className="text-xs text-muted-foreground">HT</p>
                  </div>
                  <div className="flex gap-1 items-center">
                    <select
                      className="text-xs rounded border border-input bg-background px-2 py-1"
                      value={d.statut}
                      onChange={e => updateStatut(d.id, e.target.value as DevisType['statut'])}
                    >
                      <option value="brouillon">Brouillon</option>
                      <option value="envoyé">Envoyé</option>
                      <option value="accepté">Accepté</option>
                      <option value="refusé">Refusé</option>
                      <option value="expiré">Expiré</option>
                      <option value="archivé">🗄 Archivé</option>
                      <option value="système">Système</option>
                    </select>
                    <RowActionsMenu actions={[
                      { icon: <Eye className="w-4 h-4" />, label: 'Aperçu', onClick: () => setPreviewDevis(d) },
                      { icon: <MessageSquare className="w-4 h-4" />, label: 'Notes & fichiers', onClick: () => setChatterDevis(d) },
                      { icon: <Copy className="w-4 h-4" />, label: 'Dupliquer', onClick: () => duplicate(d) },
                      { icon: <Mail className="w-4 h-4" />, label: 'Envoyer par email', onClick: () => setEmailDevis(d) },
                      { icon: <Archive className="w-4 h-4" />, label: 'Archiver', onClick: () => openArchiveDialog(d) },
                      { icon: <Trash2 className="w-4 h-4" />, label: 'Supprimer', onClick: () => confirmRemove(d.id), danger: true },
                    ]} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {sortedTable.length === 0 && <p className="text-center py-8 text-muted-foreground">Aucun devis</p>}
        </div>
      </div>}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open) { closeDevisDialog(); return; }
        setDialogOpen(open);
      }}>
        <DialogContent mobileFullscreen className="sm:w-[92vw] sm:max-w-[92vw] sm:max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between gap-2 pr-8">
              <DialogTitle className="truncate text-base sm:text-lg">
                {editingId ? (<>
                  <span className="hidden md:inline">Modifier le devis — </span>
                  <span>{devis.find(d => d.id === editingId)?.numero ?? ''}</span>
                </>) : 'Nouveau devis'}
              </DialogTitle>
              <div className="flex items-center gap-1.5 shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="px-3 gap-1">Action <ChevronDown className="w-3 h-3 opacity-60" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => {
                      const existing = editingId ? devis.find(d => d.id === editingId) : null;
                      const preview: DevisType = {
                        id: editingId || 'preview', numero: existing?.numero || 'APERÇU',
                        clientId, contactId: contactId || undefined, adresseLivraisonId: adresseLivraisonId || undefined, contactLivraisonId: contactLivraisonId || undefined,
                        dateCreation, dateValidite, statut, lignes, referenceAffaire, systeme: systeme || undefined, notes, conditions,
                        fraisPortHT, fraisPortTVA, modeCalcul, surfaceGlobaleM2: surfaceGlobaleM2 || undefined,
                      };
                      setPreviewOptions(prev => ({ ...prev, showConso: modeCalcul === 'surface' || prev.showConso }));
                      setPreviewDevis(preview);
                    }}>
                      <Eye className="w-4 h-4 mr-2 text-muted-foreground" /> Aperçu
                    </DropdownMenuItem>
                    {editingId && (
                      <DropdownMenuItem onClick={() => {
                        save(true);
                        const existing = devis.find(d => d.id === editingId);
                        const current: DevisType = {
                          id: editingId, numero: existing?.numero || editingId,
                          clientId, contactId: contactId || undefined, adresseLivraisonId: adresseLivraisonId || undefined,
                          dateCreation, dateValidite, statut, dateEnvoi: dateEnvoi || undefined, lignes, referenceAffaire,
                          systeme: systeme || undefined, notes, conditions, fraisPortHT, fraisPortTVA, modeCalcul,
                          surfaceGlobaleM2: modeCalcul === 'surface' ? surfaceGlobaleM2 : undefined,
                        };
                        setEmailDevis(current);
                      }}>
                        <Mail className="w-4 h-4 mr-2 text-muted-foreground" /> Envoyer par mail
                      </DropdownMenuItem>
                    )}
                    {editingId && (
                      <DropdownMenuItem onClick={async () => {
                        try {
                          save(true);
                          const selectedClient = clients.find(c => c.id === clientId);
                          if (!selectedClient) { toast.error('Client introuvable'); return; }
                          const defaultName = selectedClient.societe || selectedClient.nom;
                          const odooNom = promptOdooPartnerName(clientId, defaultName);
                          if (odooNom === null) return;
                          const allContacts = selectedClient.contacts || [];
                          const contact = allContacts.find(ct => ct.id === contactId);
                          const contactNom = contact ? [contact.prenom, contact.nom].filter(Boolean).join(' ') : undefined;
                          const current: DevisType = {
                            id: editingId, numero: devis.find(d => d.id === editingId)?.numero || editingId,
                            clientId, contactId: contactId || undefined,
                            dateCreation, dateValidite, statut, lignes, referenceAffaire,
                            systeme: systeme || undefined, notes, conditions, fraisPortHT, fraisPortTVA, modeCalcul,
                            surfaceGlobaleM2: modeCalcul === 'surface' ? surfaceGlobaleM2 : undefined,
                          };
                          const script = genererScriptOdoo(current, selectedClient, produits, { surface: surfaceGlobaleM2 || 0, contactNom, odooPartnerName: odooNom });
                          await navigator.clipboard.writeText(script);
                          toast.success('Script Odoo copié !', { description: 'Ouvre Odoo → F12 → Console → Ctrl+V → Ctrl+Entrée', duration: 6000 });
                        } catch (err) {
                          toast.error('Erreur lors de la génération du script Odoo');
                          console.error(err);
                        }
                      }}>
                        <Send className="w-4 h-4 mr-2 text-muted-foreground" /> Envoyer vers Odoo
                      </DropdownMenuItem>
                    )}
                    {dialogTab === 'devis' && (
                      <>
                        <DropdownMenuItem onClick={() => setLignesView('cartes')} className="border-t border-border mt-1 pt-1.5">
                          <LayoutList className="w-4 h-4 mr-2 text-muted-foreground" /> Vue cartes {lignesView === 'cartes' && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setLignesView('tableau')}>
                          <Table2 className="w-4 h-4 mr-2 text-muted-foreground" /> Vue tableau {lignesView === 'tableau' && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAssistantOpen(true)} className="border-t border-border mt-1 pt-1.5 text-primary">
                          <Bot className="w-4 h-4 mr-2" /> Assistant Claude
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" onClick={() => closeDevisDialog()}>Annuler</Button>
                <Button size="sm" onClick={() => save()}>
                  <FileText className="w-4 h-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">{editingId ? 'Enregistrer' : 'Créer le devis'}</span>
                  <span className="sm:hidden">{editingId ? 'Enreg.' : 'Créer'}</span>
                </Button>
              </div>
            </div>
          </DialogHeader>
          {/* Onglets (barre fixe) */}
          <div className="flex items-end gap-1 border-b border-border shrink-0 overflow-x-auto">
            <button type="button" onClick={() => setDialogTab('devis')} className={`shrink-0 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${dialogTab === 'devis' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Devis</button>
            <button type="button" onClick={() => setDialogTab('comparatif')} className={`shrink-0 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${dialogTab === 'comparatif' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Comparatif achat / vente</button>
            <button type="button" onClick={() => setDialogTab('mo')} className={`shrink-0 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${dialogTab === 'mo' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>MO</button>
            {editingId && <button type="button" onClick={() => setDialogTab('crm')} className={`shrink-0 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${dialogTab === 'crm' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>CRM</button>}
            {editingId && <button type="button" onClick={() => setDialogTab('notes')} className={`shrink-0 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${dialogTab === 'notes' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Notes & Fichiers</button>}
          </div>
          <div ref={scrollContainerRef} className={`space-y-4 py-2 flex-1 overflow-y-auto overflow-x-hidden pr-1 ${dialogTab !== 'devis' ? 'hidden' : ''}`} onDragOver={e => { dragClientYRef.current = e.clientY; }}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <div>
                <div className="flex items-center justify-between">
                  <Label>Client *</Label>
                  {clientId && (
                    <button
                      type="button"
                      onClick={() => {
                        const savedId = save(true);
                        const devisId = savedId || editingId;
                        if (devisId) {
                          navigate(`/clients?search=${encodeURIComponent(clients.find(c => c.id === clientId)?.nom || '')}&returnDevis=${devisId}`);
                        } else {
                          navigate(`/clients?search=${encodeURIComponent(clients.find(c => c.id === clientId)?.nom || '')}`);
                        }
                      }}
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> Voir fiche
                    </button>
                  )}
                </div>
                <ClientCombobox
                  clients={clients}
                  value={clientId}
                  onSelect={(id) => {
                    setClientId(id);
                    setContactId('');
                    // Auto-remplir les conditions depuis le délai de règlement du client
                    if (id) {
                      const c = clients.find(cl => cl.id === id);
                      const opt = DELAI_REGLEMENT_OPTIONS.find(o => o.value === c?.delaiReglement);
                      if (opt) setConditions(opt.conditions);
                    }
                  }}
                  onCreateNew={(societe) => {
                    const newClient = {
                      id: generateId(),
                      nom: societe,
                      email: '', telephone: '', adresse: '', ville: '', codePostal: '',
                      societe,
                      dateCreation: new Date().toISOString().split('T')[0],
                      adressesLivraison: [],
                      contacts: [],
                    };
                    // Crée + persiste la société, la sélectionne, puis ouvre le formulaire complet
                    updateClients(prev => [...prev, newClient]);
                    setClientId(newClient.id);
                    setContactId('');
                    const savedDevisId = save(true) || editingId;
                    toast.success(`Société « ${societe} » créée`);
                    navigate(`/clients?editClient=${newClient.id}${savedDevisId ? `&returnDevis=${savedDevisId}` : ''}`);
                    return newClient.id;
                  }}
                />
                {(() => {
                  const selectedClient = clients.find(c => c.id === clientId);
                  if (!selectedClient) return null;
                  // Contacts : nouveau format contacts[] + fallback legacy nom/email/tel
                  const storedContacts = selectedClient.contacts || [];
                  const allContacts = storedContacts.length > 0 ? storedContacts : (
                    (selectedClient.nom || selectedClient.email || selectedClient.telephone)
                      ? [{ id: '__legacy__', nom: selectedClient.nom || '', prenom: '', email: selectedClient.email || '', telephone: selectedClient.telephone || '', telephoneMobile: selectedClient.telephoneMobile || '', fonction: '' }]
                      : []
                  );
                  const selectedContact = allContacts.find(ct => ct.id === contactId) ?? (allContacts.length === 1 ? allContacts[0] : undefined);
                  const effectiveContactId = selectedContact?.id || '';
                  const displayEmail = selectedContact?.email || selectedClient.email;
                  const displayTel = selectedContact?.telephone || selectedContact?.telephoneMobile || selectedClient.telephone;
                  return (
                    <div className="mt-2 bg-muted/30 rounded-lg border border-border p-3 text-xs space-y-2">
                      <div className="space-y-0.5">
                        <p className="font-semibold text-sm">{selectedClient.societe || selectedClient.nom}</p>
                        {selectedClient.adresse && <p className="text-muted-foreground">{selectedClient.adresse}</p>}
                        {(selectedClient.codePostal || selectedClient.ville) && <p className="text-muted-foreground">{selectedClient.codePostal} {selectedClient.ville}</p>}
                      </div>
                      {/* Sélecteur de contact — toujours visible si au moins 1 contact */}
                      {allContacts.length > 0 && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1">Contact</label>
                          <select
                            value={effectiveContactId}
                            onChange={e => setContactId(e.target.value === '__legacy__' ? '' : e.target.value)}
                            className="w-full text-xs rounded border border-input bg-background px-2 py-1.5"
                          >
                            {allContacts.length > 1 && <option value="">— Sélectionner un contact —</option>}
                            {allContacts.map(ct => (
                              <option key={ct.id} value={ct.id}>
                                {[ct.prenom, ct.nom].filter(Boolean).join(' ') || ct.email || 'Contact principal'}
                                {ct.fonction ? ` · ${ct.fonction}` : ''}
                              </option>
                            ))}
                          </select>
                          {selectedContact && (
                            <div className="mt-1 text-muted-foreground space-y-0.5">
                              {selectedContact.email && <p>{selectedContact.email}</p>}
                              {(selectedContact.telephone || selectedContact.telephoneMobile) && (
                                <p>{selectedContact.telephone || selectedContact.telephoneMobile}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {!selectedContact && (displayEmail || displayTel) && (
                        <div className="text-muted-foreground space-y-0.5">
                          {displayEmail && <p>{displayEmail}</p>}
                          {displayTel && <p>{displayTel}</p>}
                        </div>
                      )}
                      {selectedClient.adressesLivraison?.length > 0 && (
                        <div className="border-t border-border pt-2 mt-2 space-y-1">
                          <p className="font-medium text-muted-foreground text-xs">Adresse de livraison :</p>
                          {/* Option "identique facturation" */}
                          <button
                            type="button"
                            onClick={() => setAdresseLivraisonId('')}
                            className={`w-full text-left flex items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors ${!adresseLivraisonId ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-muted-foreground'}`}
                          >
                            <span className="text-[10px] px-1.5 py-0 rounded-full border border-border shrink-0">Fact.</span>
                            <span>Identique à l'adresse de facturation</span>
                            {!adresseLivraisonId && <span className="ml-auto text-[10px]">✓</span>}
                          </button>
                          {selectedClient.adressesLivraison.map(a => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => setAdresseLivraisonId(a.id)}
                              className={`w-full text-left flex items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors ${adresseLivraisonId === a.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-muted-foreground'}`}
                            >
                              <span className={`text-[10px] px-1.5 py-0 rounded-full border shrink-0 ${a.type === 'facturation' ? 'border-primary/30 text-primary' : 'border-border'}`}>
                                {a.type === 'facturation' ? 'Fact.' : 'Livr.'}
                              </span>
                              <span className="truncate">{a.libelle} — {a.adresse}, {a.codePostal} {a.ville}</span>
                              {a.parDefaut && <span className="text-[10px] text-muted-foreground shrink-0">(défaut)</span>}
                              {adresseLivraisonId === a.id && <span className="ml-auto text-[10px] shrink-0">✓</span>}
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Contact de livraison */}
                      {(() => {
                        const allContacts = selectedClient.contacts || [];
                        const hasContactPrincipal = selectedClient.nom || selectedClient.telephone;
                        if (allContacts.length === 0 && !hasContactPrincipal) return null;
                        return (
                          <div className="border-t border-border pt-2 mt-2 space-y-1">
                            <p className="font-medium text-muted-foreground text-xs">Contact livraison :</p>
                            {/* Contact principal (client lui-même) */}
                            <button
                              type="button"
                              onClick={() => setContactLivraisonId('__principal__')}
                              className={`w-full text-left flex items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors ${contactLivraisonId === '__principal__' || (!contactLivraisonId && !allContacts.find(c => c.id === contactLivraisonId)) ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-muted-foreground'}`}
                            >
                              <span className="truncate">{selectedClient.societe || selectedClient.nom} {selectedClient.telephone ? `· ${selectedClient.telephone}` : ''}</span>
                              {(contactLivraisonId === '__principal__' || !contactLivraisonId) && <span className="ml-auto text-[10px] shrink-0">✓</span>}
                            </button>
                            {allContacts.map(ct => (
                              <button
                                key={ct.id}
                                type="button"
                                onClick={() => setContactLivraisonId(ct.id)}
                                className={`w-full text-left flex items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors ${contactLivraisonId === ct.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-muted-foreground'}`}
                              >
                                <span className="truncate">{[ct.prenom, ct.nom].filter(Boolean).join(' ') || ct.email}{ct.telephone || ct.telephoneMobile ? ` · ${ct.telephone || ct.telephoneMobile}` : ''}</span>
                                {contactLivraisonId === ct.id && <span className="ml-auto text-[10px] shrink-0">✓</span>}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}
              </div>
              {/* Colonne droite : dates + statut + réf + système + surface */}
              <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date de création</Label>
                <Input type="date" value={dateCreation} onChange={e => setDateCreation(e.target.value)} />
              </div>
              <div>
                <Label>Date de validité</Label>
                <Input type="date" value={dateValidite} onChange={e => setDateValidite(e.target.value)} />
              </div>
              <div>
                <Label>Statut</Label>
                <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={statut} onChange={e => {
                  const ns = e.target.value as DevisType['statut'];
                  setStatut(ns);
                  // Passage à 'accepté' → probabilité 100% + date de réalisation auto (si absente)
                  if (ns === 'accepté') {
                    setProbabiliteReussite(100);
                    if (!dateRealisation) setDateRealisation(new Date().toISOString().split('T')[0]);
                  }
                }}>
                  <option value="brouillon">Brouillon</option>
                  <option value="envoyé">Envoyé</option>
                  <option value="accepté">Accepté</option>
                  <option value="refusé">Refusé</option>
                  <option value="expiré">Expiré</option>
                  <option value="système">Système (modèle)</option>
                </select>
              </div>
              {(statut === 'envoyé' || statut === 'accepté' || statut === 'refusé') && (
                <div>
                  <Label>Date d'envoi</Label>
                  <Input type="date" value={dateEnvoi} onChange={e => setDateEnvoi(e.target.value)} />
                </div>
              )}
              </div>{/* fin grille dates/statut */}
              <div>
                <Label>Référence affaire</Label>
                <Input placeholder="Ex: AFF-2024-001" value={referenceAffaire} onChange={e => setReferenceAffaire(e.target.value)} />
              </div>
              <div>
                <Label>Système</Label>
                <Input placeholder="Ex: Chape liquide isolante" value={systeme} onChange={e => setSysteme(e.target.value)} />
              </div>
              {/* Surface globale + % de réussite */}
              <div className="border border-border rounded-lg p-3 bg-muted/30">
                <div className="flex items-end gap-4 flex-wrap">
                  <div className="w-32">
                    <Label className="text-xs">Surface globale (m²)</Label>
                    <Input type="number" step="0.01" value={surfaceGlobaleM2 || ''} onChange={e => setSurfaceGlobaleM2(parseFloat(e.target.value) || 0)} placeholder="Optionnel…" className="h-8 text-sm" title="Si surface + conso. renseignées → quantité calculée automatiquement" />
                  </div>
                  <div className="w-32">
                    <Label className="text-xs">% de réussite</Label>
                    <select value={probabiliteReussite} onChange={e => setProbabiliteReussite(Number(e.target.value))} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm">
                      {[0, 25, 50, 75, 100].map(p => <option key={p} value={p}>{p}%</option>)}
                    </select>
                  </div>
                  <div className="w-40">
                    <Label className="text-xs">Date de réalisation</Label>
                    <Input type="date" value={dateRealisation} onChange={e => setDateRealisation(e.target.value)} className="h-8 text-sm" />
                  </div>
                </div>
              </div>
              </div>{/* fin colonne droite */}
            </div>{/* fin grille 2 colonnes */}

            {/* Lines */}
            <div onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } }}>
              <div className="sticky -top-2 z-20 bg-background border-b border-border py-2 -mx-1 px-1 mb-2">
                <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-base font-semibold">Lignes</Label>
                  {selectedLignes.size > 0 && (
                    <span className="text-xs text-primary bg-primary/10 rounded-full px-2 py-0.5 flex items-center gap-1">
                      {selectedLignes.size} sélectionnée{selectedLignes.size > 1 ? 's' : ''} — glissez pour déplacer
                      <button onClick={() => setSelectedLignes(new Set())} title="Désélectionner" className="hover:text-foreground"><XIcon className="w-3 h-3" /></button>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 min-w-0">
                  <div className="flex items-center gap-1 overflow-x-auto min-w-0 [&>*]:shrink-0">
                  <Button variant="ghost" size="sm" onClick={undo} disabled={undoStack.length === 0} title="Annuler la dernière action (Ctrl+Z)" className="h-7 px-2 text-muted-foreground">
                    <Undo2 className="w-3.5 h-3.5 mr-1" /><span className="text-xs">Annuler</span>
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={addLigne}><Plus className="w-3 h-3 mr-1" /> Ligne</Button>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={addGroupe} title="Ajouter un en-tête de groupe"><FolderPlus className="w-3 h-3 mr-1" /> Groupe</Button>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={addTexte} title="Ajouter une ligne de texte"><StickyNote className="w-3 h-3 mr-1" /> Note</Button>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={addSurchargeEnergie} title={`Ajouter surcharge énergie MMA (vente ${SURCHARGE_ENERGIE_MMA_VENTE_PCT}% / achat ${SURCHARGE_ENERGIE_MMA_ACHAT_PCT}%)`}><Zap className="w-3 h-3 mr-1" /> <span className="hidden lg:inline">Surcharge </span>MMA</Button>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={addSurchargeEnergieHorsMMA} title={`Ajouter surcharge énergie hors MMA (vente ${SURCHARGE_ENERGIE_HORS_MMA_VENTE_PCT}% / achat ${SURCHARGE_ENERGIE_HORS_MMA_ACHAT_PCT}%)`}><Zap className="w-3 h-3 mr-1" /> <span className="hidden lg:inline">Surcharge </span>hors MMA</Button>
                  </div>
                  <div ref={kitPickerRef} className="relative shrink-0">
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => { setKitPickerOpen(o => !o); setKitSearch(''); }} title="Insérer un kit (groupe de lignes type)">
                      <Layers className="w-3 h-3 mr-1" /> Kit
                    </Button>
                    {kitPickerOpen && (
                      <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-popover border border-border rounded-md shadow-lg">
                        <div className="p-2 border-b border-border">
                          <input
                            autoFocus
                            type="text"
                            value={kitSearch}
                            onChange={e => setKitSearch(e.target.value)}
                            placeholder="Rechercher un kit…"
                            className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground px-1 py-0.5"
                          />
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                          {(() => {
                            const kits = produits.filter(p => p.typeKit).filter(p => !kitSearch || `${p.reference} ${p.description}`.toLowerCase().includes(kitSearch.toLowerCase())).sort((a, b) => a.reference.localeCompare(b.reference));
                            if (kits.length === 0) return <p className="text-xs text-muted-foreground text-center py-4">Aucun kit trouvé — créez-en un dans la fiche produit</p>;
                            return kits.map(k => (
                              <button key={k.id} type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex flex-col gap-0.5"
                                onClick={() => insertKit(k)}
                              >
                                <span className="font-medium">{k.reference}</span>
                                <span className="text-xs text-muted-foreground truncate">{k.description} · {(k.lignesKit || []).length} ligne{(k.lignesKit || []).length !== 1 ? 's' : ''}</span>
                              </button>
                            ));
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Roue crantée : colonnes visibles */}
                  <div ref={colChooserRef} className="relative shrink-0">
                    <Button variant="outline" size="sm" onClick={() => setColChooserOpen(o => !o)} title="Colonnes visibles">
                      <Settings className="w-3.5 h-3.5" />
                    </Button>
                    {colChooserOpen && (
                      <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-xl p-3 min-w-[200px]">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Colonnes visibles</p>
                        {LIGNE_COLS.map(col => (
                          <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer text-sm hover:text-foreground text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={visibleLigneCols.has(col.key)}
                              onChange={() => setVisibleLigneCols(prev => {
                                const next = new Set(prev);
                                next.has(col.key) ? next.delete(col.key) : next.add(col.key);
                                return next;
                              })}
                              className="rounded border-input accent-primary"
                            />
                            {col.label}
                          </label>
                        ))}
                        <button
                          className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground border-t border-border pt-2 text-left"
                          onClick={() => setVisibleLigneCols(new Set(DEFAULT_LIGNE_COLS))}
                        >
                          Réinitialiser
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                </div>
                {/* En-tête de colonnes (figé avec les boutons, dessous), défilement H synchronisé avec les lignes */}
                {lignesView === 'tableau' && (
                  <div ref={ligneHeaderScrollRef} className="overflow-x-hidden mt-1.5 -mb-2 pb-1">
                    <div className="flex items-center gap-1 px-1 py-1 min-w-max text-xs font-bold text-foreground border-b-2 border-border">
                      <span className="w-4 shrink-0" />
                      <span className="w-3.5 shrink-0" />
                      <span className="w-6 shrink-0">#</span>
                      {ligneTableCols.ordered(TABLE_LIGNE_COLS, k => { const c = TABLE_LIGNE_COLS.find(x => x.key === k)!; return !c.optional || visibleLigneCols.has(c.optional); }).map(c => {
                        const isDragOver = ligneTableCols.dragOverKey === c.key && ligneTableCols.dragKey !== c.key;
                        return (
                          <div key={c.key} {...ligneTableCols.thProps(c.key)} style={ligneTableCols.widthStyle(c.key)} className={`relative shrink-0 cursor-grab active:cursor-grabbing select-none ${c.align === 'right' ? 'text-right' : ''} ${ligneTableCols.dragKey === c.key ? 'opacity-40' : ''} ${isDragOver ? 'bg-primary/10' : ''}`}>
                            <span className="truncate block pr-1">{c.label}</span>
                            <ColResizeHandle {...ligneTableCols.resizeHandleProps(c.key)} />
                          </div>
                        );
                      })}
                      <span className="shrink-0 w-[76px]" />
                    </div>
                  </div>
                )}
              </div>
              <div ref={ligneBodyScrollRef} onScroll={e => { if (ligneHeaderScrollRef.current) ligneHeaderScrollRef.current.scrollLeft = e.currentTarget.scrollLeft; }} className={lignesView === 'tableau' ? 'overflow-x-auto' : ''}>
              <div className={lignesView === 'tableau' ? 'flex flex-col gap-0.5 [&_label]:hidden [&>div]:border-b [&>div]:border-border/30 min-w-max' : 'flex flex-col gap-2'}>
                {(() => {
                  // Appartenance groupe : entre en-tête et marqueur soustotal
                  let curGrp: string | null = null;
                  const lineGroup: Record<string, string | null> = {};
                  const grpTitles: Record<string, string> = {};
                  const subGrpId: Record<string, string | null> = {};
                  for (const l of lignes) {
                    if (l.type === 'groupe') { curGrp = l.id; lineGroup[l.id] = null; grpTitles[l.id] = l.description; }
                    else if (l.type === 'soustotal') { subGrpId[l.id] = curGrp; lineGroup[l.id] = null; curGrp = null; }
                    else { lineGroup[l.id] = curGrp; }
                  }
                  const grpSub: Record<string, number> = {};
                  for (const l of lignes) {
                    if (!l.type || l.type === 'ligne') {
                      const gid = lineGroup[l.id];
                      if (gid) grpSub[gid] = (grpSub[gid] || 0) + calculerTotalLigne(l).totalHT;
                    }
                  }
                  let ligneNum = 0;
                  const ligneNums: Record<string, number> = {};
                  for (const l of lignes) { if (!l.type || l.type === 'ligne') { ligneNum++; ligneNums[l.id] = ligneNum; } }

                  return lignes.map((l, i) => {
                    const isGroupe = l.type === 'groupe';
                    const isSousTotal = l.type === 'soustotal';

                    if (isSousTotal) {
                      const gid = subGrpId[l.id];
                      const titre = gid ? grpTitles[gid] : '';
                      const montant = gid ? (grpSub[gid] || 0) : 0;
                      return (
                        <div key={l.id}
                          draggable
                          onDragStart={() => { setDraggedId(l.id); startDragScroll(); }}
                          onDragOver={e => { e.preventDefault(); setDragOverId(l.id); }}
                          onDrop={() => dropLigne(l.id)}
                          onDragEnd={() => { setDraggedId(null); setDragOverId(null); stopDragScroll(); }}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing transition-all border
                            ${selectedLignes.has(l.id) ? 'ring-2 ring-primary/50' : ''}
                            ${draggedId === l.id ? 'opacity-40 border-primary/20 bg-primary/5' : ''}
                            ${dragOverId === l.id && draggedId !== l.id ? 'border-primary border-2 shadow-md bg-primary/5' : draggedId === l.id ? '' : 'bg-primary/5 border-primary/20'}`}>
                          <input type="checkbox" checked={selectedLignes.has(l.id)} onChange={() => toggleLigneSelection(l.id)} onClick={e => e.stopPropagation()} title="Sélectionner pour déplacer en groupe" className="shrink-0 rounded border-input accent-primary cursor-pointer" />
                          <GripVertical className="w-4 h-4 text-primary/30 shrink-0" />
                          <span className="flex-1 text-sm font-semibold text-primary italic">
                            Sous-total{titre ? ` — ${titre}` : ''}
                          </span>
                          <span className="text-sm font-bold text-primary">{formatMontant(montant)} HT</span>
                          <button onClick={() => removeLigne(l.id)} className="text-destructive hover:text-destructive/80 ml-1"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      );
                    }

                    if (l.type === 'texte') return (
                      <div key={l.id}
                        draggable
                        onDragStart={() => { setDraggedId(l.id); startDragScroll(); }}
                        onDragOver={e => { e.preventDefault(); setDragOverId(l.id); }}
                        onDrop={() => dropLigne(l.id)}
                        onDragEnd={() => { setDraggedId(null); setDragOverId(null); stopDragScroll(); }}
                        className={`flex items-start gap-2 rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing transition-all border
                          ${selectedLignes.has(l.id) ? 'ring-2 ring-primary/50' : ''}
                          ${draggedId === l.id ? 'opacity-40' : ''}
                          ${dragOverId === l.id && draggedId !== l.id ? 'border-amber-400 border-2 shadow-md bg-amber-50/50 dark:bg-amber-900/10' : draggedId === l.id ? '' : 'bg-amber-50/40 dark:bg-amber-900/10 border-amber-300/40'}`}>
                        <input type="checkbox" checked={selectedLignes.has(l.id)} onChange={() => toggleLigneSelection(l.id)} onClick={e => e.stopPropagation()} title="Sélectionner pour déplacer en groupe" className="shrink-0 mt-0.5 rounded border-input accent-primary cursor-pointer" />
                        <GripVertical className="w-4 h-4 text-amber-400/50 shrink-0 mt-0.5" />
                        <StickyNote className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <textarea
                          value={l.description}
                          onChange={e => updateLigne(l.id, 'description', e.target.value)}
                          onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                          autoFocus={l.id === newLigneId}
                          rows={1}
                          className="flex-1 text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50 resize-none overflow-hidden leading-normal"
                          placeholder="Texte libre…"
                          style={{ minHeight: '1.5rem' }}
                        />
                        <div className="flex items-center gap-1">
                          <button onClick={() => moveLigne(l.id, 'up')} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                          <button onClick={() => moveLigne(l.id, 'down')} disabled={i === lignes.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                          <button onClick={() => removeLigne(l.id)} className="text-destructive hover:text-destructive/80 ml-1"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    );

                    if (isGroupe) return (
                      <div key={l.id}
                        draggable
                        onDragStart={() => { setDraggedId(l.id); startDragScroll(); }}
                        onDragOver={e => { e.preventDefault(); setDragOverId(l.id); }}
                        onDrop={() => dropLigne(l.id)}
                        onDragEnd={() => { setDraggedId(null); setDragOverId(null); stopDragScroll(); }}
                        className={`flex items-center gap-2 bg-primary/10 border rounded-lg px-3 py-2.5 mt-1 cursor-grab active:cursor-grabbing transition-all
                          ${selectedLignes.has(l.id) ? 'ring-2 ring-primary/50' : ''}
                          ${draggedId === l.id ? 'opacity-40' : ''}
                          ${dragOverId === l.id && draggedId !== l.id ? 'border-primary border-2 shadow-md' : 'border-primary/30'}`}>
                        <input type="checkbox" checked={selectedLignes.has(l.id)} onChange={() => toggleLigneSelection(l.id)} onClick={e => e.stopPropagation()} title="Sélectionner pour déplacer en groupe" className="shrink-0 rounded border-input accent-primary cursor-pointer" />
                        <GripVertical className="w-4 h-4 text-primary/40 shrink-0" />
                        <FolderPlus className="w-4 h-4 text-primary shrink-0" />
                        <input type="text" value={l.description} onChange={e => updateLigne(l.id, 'description', e.target.value)}
                          autoFocus={l.id === newLigneId}
                          onFocus={e => { if (l.id === newLigneId) { e.target.select(); setNewLigneId(null); } }}
                          className="flex-1 font-semibold text-sm bg-transparent border-none outline-none text-primary placeholder:text-primary/50" placeholder="Titre du groupe…" />
                        <div className="flex items-center gap-1">
                          <button onClick={() => moveLigne(l.id, 'up')} disabled={i === 0} className="text-primary/60 hover:text-primary disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                          <button onClick={() => moveLigne(l.id, 'down')} disabled={i === lignes.length - 1} className="text-primary/60 hover:text-primary disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                          <button onClick={() => removeLigne(l.id)} className="text-destructive hover:text-destructive/80 ml-1"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    );

                    const t = calculerTotalLigne(l);
                    const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                    const prixNetHT = l.prixUnitaireHT * (1 - l.remise / 100);
                    const tauxMarque = prod && prixNetHT > 0 ? ((prixNetHT - prod.prixAchat) / prixNetHT) * 100 : null;
                    // Coeff revendeur du produit (depuis la fiche), indépendant du prix public saisi dans le devis
                    const coeff = prod && prod.coefficient > 0 ? prod.coefficient : null;
                    const prixKg = prod?.poids && prod.poids > 0 ? prixNetHT / prod.poids : null;
                    const surfaceVal = l.surfaceM2 || surfaceGlobaleM2;
                    const consoLigne = l.consommation ?? prod?.consommation;
                    const kgReel = surfaceVal > 0 && consoLigne != null && consoLigne > 0
                      ? Math.round(surfaceVal * consoLigne * 1000) / 1000 : null;
                    // Auto-calc quantité : surface ET conso renseignées (peu importe le mode)
                    const hasAutoCalc = !!(surfaceVal > 0 && consoLigne != null && consoLigne > 0 && prod?.poids && prod.poids > 0);

                    // Sélecteurs de variantes (rendus inline en cartes, en sous-ligne en tableau)
                    const variantEls = (prod?.variantes && prod.variantes.length > 0) ? prod.variantes.map(dim => (
                      <div key={dim.id} className="shrink-0 min-w-[120px] max-w-[180px]">
                        <span className="text-xs truncate block text-muted-foreground">{dim.nom || 'Variante'}</span>
                        <VarianteSelect
                          dimension={dim}
                          value={l.variantesChoisies?.[dim.id] || (dim.options[0]?.label ?? '')}
                          onChange={label => {
                            setLignes(prev => prev.map(li => {
                              if (li.id !== l.id) return li;
                              const validIds = new Set(prod.variantes!.map(d => d.id));
                              const cleaned = Object.fromEntries(Object.entries(li.variantesChoisies || {}).filter(([k]) => validIds.has(k)));
                              const variantesChoisies = { ...cleaned, [dim.id]: label };
                              const totalDiff = prod.variantes!.reduce((sum, d) => {
                                const chosenLabel = d.id === dim.id ? label : (li.variantesChoisies?.[d.id] ?? d.options[0]?.label);
                                const o = d.options.find(x => x.label === chosenLabel);
                                return sum + (o?.prixDiff ?? 0);
                              }, 0);
                              const client = clients.find(c => c.id === clientId);
                              const palierPrix = getPrixPourQuantite(prod, li.quantite);
                              const basePrix = client?.estRevendeur ? palierPrix.prixRevendeur : palierPrix.prixHT;
                              return { ...li, variantesChoisies, prixUnitaireHT: Math.round((basePrix + totalDiff) * 100) / 100 };
                            }));
                          }}
                        />
                      </div>
                    )) : null;

                    const card = (
                      <div
                        draggable
                        onDragStart={() => { setDraggedId(l.id); startDragScroll(); }}
                        onDragOver={e => { e.preventDefault(); setDragOverId(l.id); }}
                        onDrop={() => dropLigne(l.id)}
                        onDragEnd={() => { setDraggedId(null); setDragOverId(null); stopDragScroll(); }}
                        className={`rounded-lg py-1.5 border transition-all cursor-grab active:cursor-grabbing
                          ${lignesView === 'tableau' ? 'px-1' : 'px-2'}
                          ${lineGroup[l.id] && lignesView !== 'tableau' ? ' ml-4' : ''}
                          ${selectedLignes.has(l.id) ? 'ring-2 ring-primary/50' : ''}
                          ${draggedId === l.id ? 'opacity-40 border-border/60 bg-muted/40' : ''}
                          ${dragOverId === l.id && draggedId !== l.id ? 'border-primary border-2 shadow-md bg-primary/5' : draggedId === l.id ? '' : 'bg-zinc-200 dark:bg-zinc-700 border-border'}`}>
                        <>
                            {/* ── Cellules (contenu réutilisé cartes + tableau) ── */}
                            {(() => {
                              const achatLigne = !l.produitId ? (l.prixAchatLigne ?? 0) * l.quantite : (prod ? getPrixPourQuantite(prod, l.quantite).prixAchat * l.quantite * (1 - (l.remise || 0) / 100) : 0);
                              const margeLigne = t.totalHT - achatLigne;
                              const coeffLigne = achatLigne > 0 ? t.totalHT / achatLigne : null;
                              const cell: Record<TLCKey, ReactNode> = {
                                ref: (
                                  <div className="flex gap-0.5 items-center">
                                    <div className="flex-1 min-w-0">
                                      <ProduitCombobox produits={produits} value={l.produitId || ''} onSelect={(produitId) => { produitId ? selectProduit(l.id, produitId) : updateLigne(l.id, 'produitId', undefined); setNewLigneId(null); }} autoFocus={l.id === newLigneId} />
                                    </div>
                                    {l.produitId && (
                                      <Button variant="ghost" size="icon" className="h-8 w-7 shrink-0" title="Voir la fiche produit" onClick={() => { const savedId = save(true); const devisId = savedId || editingId; const p2 = produits.find(p => p.id === l.produitId); navigate(`/produits?search=${encodeURIComponent(p2?.reference || '')}&returnDevis=${devisId || ''}`); }}>
                                        <ExternalLink className="w-3 h-3" />
                                      </Button>
                                    )}
                                  </div>
                                ),
                                description: <Input value={l.description} onChange={e => updateLigne(l.id, 'description', e.target.value)} className="h-8 text-sm" title={l.description} />,
                                surface: <Input type="number" step="0.01" value={l.surfaceM2 || ''} onFocus={e => e.target.select()} onChange={e => {
                                  const surface = parseFloat(e.target.value) || 0;
                                  const conso = l.consommation ?? prod?.consommation;
                                  const quantite = prod && conso && prod.poids ? calcQuantiteSurface(prod, surface, l.consommation) : l.quantite;
                                  const client = clients.find(c => c.id === clientId);
                                  const prixUnitaireHT = prod ? getPrixLigne(prod, quantite, l.variantesChoisies, client?.estRevendeur) : undefined;
                                  setLignes(prev => prev.map(li => li.id === l.id ? { ...li, surfaceM2: surface, quantite, ...(prixUnitaireHT != null ? { prixUnitaireHT } : {}) } : li));
                                }} className="h-8 text-sm" placeholder="m²" />,
                                conso: <Input type="number" step="0.01" value={l.consommation ?? prod?.consommation ?? ''} onFocus={e => e.target.select()} onChange={e => {
                                  const raw = e.target.value;
                                  const conso = raw === '' ? undefined : parseFloat(raw);
                                  const surface = l.surfaceM2 || surfaceGlobaleM2;
                                  const quantite = prod && prod.poids && conso != null && conso > 0 ? calcQuantiteSurface(prod, surface, conso) : l.quantite;
                                  const client = clients.find(c => c.id === clientId);
                                  const prixUnitaireHT = prod ? getPrixLigne(prod, quantite, l.variantesChoisies, client?.estRevendeur) : undefined;
                                  setLignes(prev => prev.map(li => li.id === l.id ? { ...li, consommation: conso, quantite, ...(prixUnitaireHT != null ? { prixUnitaireHT } : {}) } : li));
                                }} className="h-8 text-sm" placeholder={prod?.consommation != null ? String(prod.consommation) : 'kg/m²'} />,
                                poids: <Input value={prod?.poids ? `${prod.poids}` : '—'} readOnly className="h-8 text-sm bg-muted/50" />,
                                qte: <Input type="number" value={l.quantite || ''} onFocus={e => e.target.select()} onChange={e => updateLigne(l.id, 'quantite', e.target.value === '' ? 0 : parseFloat(e.target.value))} className="h-8 text-sm" readOnly={hasAutoCalc} />,
                                unite: <Input value={l.unite || ''} onChange={e => updateLigne(l.id, 'unite', e.target.value)} className="h-8 text-sm" />,
                                prixht: <Input type="number" step="0.01" value={l.prixUnitaireHT || ''} onFocus={e => e.target.select()} onChange={e => updateLigne(l.id, 'prixUnitaireHT', parseFloat(e.target.value) || 0)} className="h-8 text-sm" placeholder="0,00" />,
                                remise: <Input type="number" value={l.remise || ''} onFocus={e => e.target.select()} onChange={e => updateLigne(l.id, 'remise', e.target.value === '' ? 0 : parseFloat(e.target.value))} className="h-8 text-sm" />,
                                netht: <Input type="number" step="0.01" value={l.prixUnitaireHT > 0 ? Math.round(l.prixUnitaireHT * (1 - l.remise / 100) * 100) / 100 : ''} onFocus={e => e.target.select()} onChange={e => { const net = parseFloat(e.target.value) || 0; const ht = l.remise < 100 ? Math.round(net / (1 - l.remise / 100) * 100) / 100 : net; updateLigne(l.id, 'prixUnitaireHT', ht); }} className="h-8 text-sm" placeholder="0,00" />,
                                marge: (
                                  <div className="h-8 flex flex-col justify-center text-right leading-tight">
                                    <span className={`text-xs font-medium ${coeffLigne == null ? 'text-muted-foreground' : coeffLigne >= 1.6 ? 'text-emerald-600 dark:text-emerald-400' : coeffLigne >= 1.43 ? 'text-orange-500' : 'text-destructive'}`}>{formatMontant(margeLigne)}</span>
                                    <span className="text-[10px] text-muted-foreground">× {coeffLigne != null ? coeffLigne.toFixed(2) : '—'}</span>
                                  </div>
                                ),
                                total: <span className="text-sm font-semibold h-8 flex items-center justify-end text-right">{formatMontant(t.totalHT)}</span>,
                              };
                              const labels: Record<TLCKey, string> = { ref: 'Réf.', description: 'Description', surface: 'Surface m²', conso: 'Conso. kg/m²', poids: 'Poids kg', qte: hasAutoCalc ? 'Qté auto' : 'Qté', unite: 'Unité', prixht: 'Prix HT', remise: 'Rem. %', netht: 'Net HT', marge: 'Marge / Coeff', total: 'Total HT' };
                              const actionsCell = (
                                <div className="flex items-center h-8 gap-0.5">
                                  <button onClick={() => moveLigne(l.id, 'up')} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => moveLigne(l.id, 'down')} disabled={i === lignes.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => duplicateLigne(l.id)} title="Dupliquer" className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => removeLigne(l.id)} className="text-destructive hover:text-destructive/80"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              );
                              const colVisible = (c: typeof TABLE_LIGNE_COLS[number]) => !c.optional || visibleLigneCols.has(c.optional);

                              // ── Mode TABLEAU : colonnes redimensionnables + déplaçables, une seule ligne ──
                              if (lignesView === 'tableau') {
                                return (
                                  <div className="flex items-center gap-1 flex-nowrap">
                                    <input type="checkbox" checked={selectedLignes.has(l.id)} onChange={() => toggleLigneSelection(l.id)} onClick={e => e.stopPropagation()} title="Sélectionner pour déplacer en groupe" className="w-4 shrink-0 rounded border-input accent-primary cursor-pointer" />
                                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                                    <span className="text-xs font-medium text-muted-foreground shrink-0 w-6">#{ligneNums[l.id]}</span>
                                    {ligneTableCols.ordered(TABLE_LIGNE_COLS, k => colVisible(TABLE_LIGNE_COLS.find(c => c.key === k)!)).map(c => (
                                      <div key={c.key} style={ligneTableCols.widthStyle(c.key)} className={`shrink-0 ${c.align === 'right' ? 'text-right' : ''}`}>
                                        {cell[c.key]}
                                      </div>
                                    ))}
                                    <div className="shrink-0 w-[76px] flex justify-end">{actionsCell}</div>
                                  </div>
                                );
                              }

                              // ── Mode CARTES : libellés par cellule, retour à la ligne ──
                              return (
                                <div className="flex items-end gap-1 flex-wrap">
                                  <input type="checkbox" checked={selectedLignes.has(l.id)} onChange={() => toggleLigneSelection(l.id)} onClick={e => e.stopPropagation()} title="Sélectionner pour déplacer en groupe" className="mb-2 shrink-0 rounded border-input accent-primary cursor-pointer" />
                                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 mb-2 shrink-0" />
                                  <span className="text-xs font-medium text-muted-foreground mb-2 shrink-0 w-6">#{ligneNums[l.id]}</span>
                                  <div className="w-48 shrink-0"><Label className="text-xs">Réf.</Label>{cell.ref}</div>
                                  <div className="flex-1 min-w-[120px]"><Label className="text-xs">Description</Label>{cell.description}</div>
                                  {variantEls}
                                  {TABLE_LIGNE_COLS.filter(c => c.key !== 'ref' && c.key !== 'description' && c.key !== 'total' && colVisible(c)).map(c => (
                                    <div key={c.key} style={{ width: c.width }} className="shrink-0"><Label className="text-xs">{labels[c.key]}</Label>{cell[c.key]}</div>
                                  ))}
                                  <div className="shrink-0 flex flex-col items-end">
                                    <Label className="text-xs">Total HT</Label>
                                    <div className="flex items-center h-8 gap-0.5">
                                      <span className="text-sm font-semibold w-24 text-right">{formatMontant(t.totalHT)}</span>
                                      {actionsCell}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                            {/* Variantes en sous-ligne (mode tableau) */}
                            {lignesView === 'tableau' && variantEls && (
                              <div className="mt-1 pl-10 flex flex-wrap items-end gap-1">{variantEls}</div>
                            )}
                            {/* Note */}
                            <div className="mt-1 pl-9">
                              <textarea
                                value={l.note || ''}
                                onChange={e => {
                                  updateLigne(l.id, 'note', e.target.value || undefined);
                                  e.target.style.height = 'auto';
                                  e.target.style.height = e.target.scrollHeight + 'px';
                                }}
                                onFocus={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                onPaste={e => handleLigneNotePaste(l.id, e)}
                                placeholder="Note (optionnelle)… Ctrl+V pour coller une image"
                                rows={1}
                                style={{ resize: 'none', overflow: 'hidden', minHeight: '1.5rem' }}
                                className="w-full text-xs text-muted-foreground bg-transparent border border-transparent hover:border-input focus:border-input rounded-md px-3 py-1 outline-none leading-5"
                              />
                              {(lineImages[l.id] || []).length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {(lineImages[l.id] || []).map((img, i) => (
                                    <div key={i} className="relative group/img">
                                      <img src={img.url} alt={img.name} className="h-14 w-auto rounded border border-border object-cover cursor-pointer" onClick={() => window.open(img.url, '_blank')} />
                                      <button
                                        type="button"
                                        onClick={() => setLineImages(prev => ({ ...prev, [l.id]: prev[l.id].filter((_, j) => j !== i) }))}
                                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white text-[10px] flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                                      >×</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            {/* Infos marges */}
                            {(tauxMarque !== null || coeff !== null || prixKg !== null || kgReel !== null) && (
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 pl-9 flex-wrap">
                                {tauxMarque !== null && <span className={tauxMarque < 0 ? 'text-destructive font-medium' : 'text-emerald-600 dark:text-emerald-400 font-medium'}>Marge: {tauxMarque.toFixed(1)}%</span>}
                                {coeff !== null && <span>Coeff: {coeff.toFixed(2)}</span>}
                                {prixKg !== null && <span>{formatMontant(prixKg)}/kg</span>}
                                {kgReel !== null && (() => {
                                  const poidsConditionne = prod?.poids ? Math.round(l.quantite * prod.poids * 100) / 100 : null;
                                  return (
                                    <span className="italic">
                                      ↳ {kgReel} kg chantier
                                      {poidsConditionne != null && poidsConditionne !== kgReel && (
                                        <span className="text-muted-foreground/70"> · {poidsConditionne} kg cond.</span>
                                      )}
                                    </span>
                                  );
                                })()}
                              </div>
                            )}
                        </>
                      </div>
                    );

                    return card;
                  });
                })()}
              </div>
              </div>
            </div>

            {/* Frais de port */}
            <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Frais de port</p>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={fraisPortAuto} onChange={e => setFraisPortAuto(e.target.checked)} className="rounded" />
                  Auto (selon poids)
                </label>
              </div>
              {fraisPortAuto && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTransporteur('standard')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${transporteur === 'standard' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                  >
                    Standard
                  </button>
                  {Object.entries(BAREMES_TRANSPORT).map(([key, { label }]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { setTransporteur(key as TransporteurType); setCoeffTransport(BAREMES_TRANSPORT[key as Exclude<TransporteurType, 'standard'>].coeffDefaut); setCoeffExpress(BAREMES_TRANSPORT[key as Exclude<TransporteurType, 'standard'>].coeffExpressDefaut); }}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${transporteur === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {fraisPortAuto && transporteur !== 'standard' && (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={expressJ1} onChange={e => setExpressJ1(e.target.checked)} className="rounded" />
                    <span className="text-xs font-medium">Express J+1</span>
                  </label>
                  {expressJ1 && (
                    <div className="flex items-center gap-1.5">
                      <Label className="text-[10px] whitespace-nowrap">Coeff. Express</Label>
                      <Input type="number" step="0.1" min="1" value={coeffExpress} onChange={e => setCoeffExpress(parseFloat(e.target.value) || 1)} className="h-6 text-xs w-16" />
                    </div>
                  )}
                </div>
              )}
              {fraisPortAuto && (() => {
                const poidsTotal = lignes.reduce((acc, l) => {
                  const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                  return acc + (prod?.poids || 0) * l.quantite;
                }, 0);

                if (transporteur !== 'standard' && BAREMES_TRANSPORT[transporteur]) {
                  const config = BAREMES_TRANSPORT[transporteur];
                  const { prix, palier } = calculerFraisPortBareme(config.bareme, poidsTotal);
                  const coeffTotal = expressJ1 ? coeffTransport * coeffExpress : coeffTransport;
                  return (
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>Poids total : <span className="font-medium">{poidsTotal.toFixed(2)} kg</span> · Palier {config.label} : {palier}</p>
                      {prix !== null && <p>Tarif brut : {formatMontant(prix)} × {coeffTransport}{expressJ1 ? ` × ${coeffExpress} (express)` : ''} = <span className="font-medium">{formatMontant(prix * coeffTotal)}</span></p>}
                      {prix === null && <p className="text-amber-600 dark:text-amber-400 font-medium">⚠ Hors barème {config.label} : tarif sur devis</p>}
                      <div className="flex items-center gap-2 pt-0.5">
                        <Label className="text-xs whitespace-nowrap">Coeff. {config.label}</Label>
                        <Input type="number" step="0.1" min="0.1" value={coeffTransport} onChange={e => setCoeffTransport(parseFloat(e.target.value) || 1)} className="h-7 text-xs w-20" />
                      </div>
                    </div>
                  );
                }

                const hasGranulat = lignes.some(l => {
                  const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                  return prod?.categorie?.toLowerCase().includes('granulat');
                });
                const port = calculerFraisPort(poidsTotal, hasGranulat);
                return (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>Poids total : <span className="font-medium">{poidsTotal.toFixed(2)} kg</span></p>
                    {port === null && <p className="text-amber-600 dark:text-amber-400 font-medium">⚠ &gt;2000 kg avec granulat : tarif hors catégorie</p>}
                    {port === 0 && poidsTotal > 2000 && <p className="text-emerald-600 dark:text-emerald-400 font-medium">Franco de port (&gt;2000 kg)</p>}
                    <p className="text-[10px]">0-25 kg: 49€ · 26-100 kg: 85€ · 101-700 kg: 178€ · 701-2000 kg: 230€ · &gt;2000 kg: franco</p>
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Montant HT</Label>
                  <Input type="number" step="0.01" value={fraisPortHT || ''} onChange={e => { setFraisPortAuto(false); setFraisPortHT(e.target.value === '' ? 0 : parseFloat(e.target.value)); }} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">TVA %</Label>
                  <Input type="number" value={fraisPortTVA} onChange={e => setFraisPortTVA(parseFloat(e.target.value) || 20)} className="h-8 text-sm" />
                </div>
              </div>
            </div>

            {/* Totals */}
            {(() => {
              const poidsTotal = lignes.reduce((acc, l) => {
                const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                return acc + (prod?.poids || 0) * l.quantite;
              }, 0);
              const totalAchat = lignes.reduce((acc, l) => {
                if (l.type && l.type !== 'ligne') return acc;
                if (!l.produitId) {
                  return acc + (l.prixAchatLigne ?? 0) * l.quantite;
                }
                const prod = produits.find(p => p.id === l.produitId);
                if (!prod) return acc;
                const prixAchat = getPrixPourQuantite(prod, l.quantite).prixAchat;
                return acc + prixAchat * l.quantite * (1 - (l.remise || 0) / 100);
              }, 0);
              // Inclure transport dans le total achat pour marge/coeff cohérents avec comparatif
              const portAchatApercu = (() => {
                if (fraisPortHT <= 0) return 0;
                if (transporteur !== 'standard' && BAREMES_TRANSPORT[transporteur as Exclude<TransporteurType, 'standard'>]) {
                  const poidsTot = lignes.reduce((acc, l) => {
                    const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                    return acc + (prod?.poids || 0) * l.quantite;
                  }, 0);
                  const { prix } = calculerFraisPortBareme(BAREMES_TRANSPORT[transporteur as Exclude<TransporteurType, 'standard'>].bareme, poidsTot);
                  return prix ?? 0;
                }
                return fraisPortHT;
              })();
              const totalHTLignes = calculerTotalDevis(lignes, 0, 0).totalHT;
              const totalAchatAvecPort = totalAchat + portAchatApercu;
              const totalVenteAvecPort = totalHTLignes + fraisPortHT;
              const margeTotal = totalVenteAvecPort - totalAchatAvecPort;
              const tauxMarque = totalVenteAvecPort > 0 ? (margeTotal / totalVenteAvecPort) * 100 : 0;
              const coeffTotal = totalAchatAvecPort > 0 ? totalVenteAvecPort / totalAchatAvecPort : null;
              return (
                <div className="bg-muted/50 rounded-lg p-4 space-y-1 text-sm">
                  <div className="flex justify-between"><span>Total HT (lignes)</span><span className="font-semibold">{formatMontant(totalHTLignes)}</span></div>
                  {fraisPortHT > 0 && <div className="flex justify-between"><span>Frais de port HT</span><span>{formatMontant(fraisPortHT)}</span></div>}
                  <div className="flex justify-between"><span>Total TVA</span><span>{formatMontant(total.totalTVA)}</span></div>
                  <div className="flex justify-between border-t border-border pt-1 mt-1"><span className="font-semibold">Total TTC</span><span className="font-heading font-bold text-lg">{formatMontant(total.totalTTC)}</span></div>
                  {modeCalcul === 'surface' && surfaceGlobaleM2 > 0 && (
                    <div className="flex justify-between border-t border-border pt-2 mt-2 text-muted-foreground">
                      <span>Surface</span>
                      <span className="font-medium">{surfaceGlobaleM2} m²</span>
                    </div>
                  )}
                  <div className={`flex justify-between ${modeCalcul !== 'surface' ? 'border-t border-border pt-2 mt-2' : ''} text-muted-foreground`}>
                    <span>Poids total</span>
                    <span className="font-medium">{poidsTotal.toFixed(2)} kg</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Marge totale</span>
                    <span className={`font-medium ${margeTotal < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {formatMontant(margeTotal)} ({tauxMarque.toFixed(1)}%{coeffTotal !== null ? ` · coeff ${coeffTotal.toFixed(2)}` : ''})
                    </span>
                  </div>
                  {(() => {
                    // Coût chantier = produits consommés (surface × conso kg/m² × prix/kg)
                    let sumCoutConso = 0;
                    for (const l of lignes) {
                      if (l.type === 'groupe' || l.type === 'soustotal' || l.type === 'texte') continue;
                      const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                      const conso = l.consommation || prod?.consommation || 0;
                      // surfaceM2 peut être 0 si saisie uniquement en global (preview stocke en local) → fallback sur surfaceGlobaleM2
                      const surfLigne = l.surfaceM2 || surfaceGlobaleM2;
                      if (conso > 0 && surfLigne > 0) {
                        const poids = prod?.poids || null;
                        const prixKg = poids && l.prixUnitaireHT ? l.prixUnitaireHT * (1 - (l.remise || 0) / 100) / poids : null;
                        if (prixKg != null) sumCoutConso += surfLigne * conso * prixKg;
                      } else if (l.prixUnitaireHT > 0) {
                        // Produit sans taux de conso ou sans surface → coût conditionné
                        sumCoutConso += l.quantite * l.prixUnitaireHT * (1 - (l.remise || 0) / 100);
                      }
                    }
                    if (sumCoutConso <= 0) return null;
                    const surfaceRef = surfaceGlobaleM2 > 0 ? surfaceGlobaleM2 : Math.max(0, ...lignes.map(l => l.surfaceM2 || 0));
                    const coutM2 = surfaceRef > 0 ? Math.round(sumCoutConso / surfaceRef * 100) / 100 : null;
                    return (
                      <div className="flex justify-between border-t border-[#CC0000]/20 pt-2 mt-1">
                        <span className="text-xs font-semibold text-[#CC0000] uppercase tracking-wide">Coût chantier</span>
                        <div className="text-right">
                          <span className="font-bold text-[#CC0000]">{formatMontant(sumCoutConso)}</span>
                          {coutM2 && <span className="text-xs text-[#CC0000]/70 ml-2">· {coutM2.toFixed(2)} €/m²</span>}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            <div><Label>Notes</Label><textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
            <div><Label>Conditions</Label><textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" rows={2} value={conditions} onChange={e => setConditions(e.target.value)} /></div>

            {/* ── Notes & fichiers joints (chatter) ── */}
            {editingId && (
              <div className="border-t border-border/50 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Notes & pièces jointes</p>
                  {sidebarPjs.length > 0 && (
                    <span className="text-[10px] bg-muted rounded-full px-2 py-0.5 text-muted-foreground">{sidebarPjs.length}</span>
                  )}
                </div>
                {/* Boutons d'ajout */}
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                    onClick={() => { const d = devis.find(dv => dv.id === editingId); if (d) { setChatterMode('note'); setChatterDevis(d); } }}>
                    <StickyNote className="w-3.5 h-3.5" /> Note
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                    onClick={() => { const d = devis.find(dv => dv.id === editingId); if (d) { setChatterMode('fichier'); setChatterDevis(d); } }}>
                    <Paperclip className="w-3.5 h-3.5" /> Joindre un fichier
                  </Button>
                  {sidebarPjs.length > 0 && (
                    <Button size="sm" variant="ghost" className="gap-1.5 text-xs ml-auto"
                      onClick={() => { const d = devis.find(dv => dv.id === editingId); if (d) setChatterDevis(d); }}>
                      <MessageSquare className="w-3.5 h-3.5" /> Tout voir
                    </Button>
                  )}
                </div>
                {/* Liste des pièces jointes */}
                {sidebarPjs.length > 0 && (
                  <div className="space-y-1">
                    {sidebarPjs.slice(0, 5).map(pj => (
                      <div key={pj.id} className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs border ${pj.confidentiel ? 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20' : 'border-border bg-muted/30'}`}>
                        {pj.type === 'note'
                          ? <StickyNote className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          : pj.fichierMime?.includes('pdf')
                            ? <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            : <Paperclip className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        }
                        <span className="flex-1 truncate text-muted-foreground">
                          {pj.type === 'note' ? (pj.contenu?.substring(0, 40) + (pj.contenu && pj.contenu.length > 40 ? '…' : '')) : pj.fichierNom}
                        </span>
                        {pj.confidentiel && <span className="text-amber-500 shrink-0">🔒</span>}
                        {pj.fichierUrl && (
                          <button
                            onClick={() => window.open(pj.fichierUrl, '_blank')}
                            className="p-0.5 rounded hover:bg-muted shrink-0"
                            title="Ouvrir"
                          >
                            <Eye className="w-3 h-3 text-primary" />
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (!confirm('Supprimer cet élément ?')) return;
                            if (pj.type === 'fichier' && pj.fichierUrl) {
                              const pathMatch = pj.fichierUrl.match(/\/devis-pj\/([^?]+)/);
                              if (pathMatch) await supabase.storage.from('devis-pj').remove([decodeURIComponent(pathMatch[1])]);
                            }
                            await supabase.from('devis_pieces_jointes').delete().eq('id', pj.id);
                            setSidebarPjs(prev => prev.filter(p => p.id !== pj.id));
                            toast.success('Supprimé');
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 text-destructive shrink-0"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {sidebarPjs.length > 5 && (
                      <p className="text-[10px] text-muted-foreground text-center">+ {sidebarPjs.length - 5} autre{sidebarPjs.length - 5 > 1 ? 's' : ''}…</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* ── Onglet Comparatif achat / vente ─────────────────────────────── */}
          {dialogTab === 'comparatif' && (() => {
            const lignesCompa = lignes.filter(l => !l.type || l.type === 'ligne');
            let totalAchat = 0, totalVente = 0;
            // ── Transport ──
            const poidsCompa = lignes.reduce((acc, l) => {
              const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
              return acc + (prod?.poids || 0) * l.quantite;
            }, 0);
            const hasGranulatCompa = lignes.some(l => {
              const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
              return prod?.categorie?.toLowerCase().includes('granulat');
            });
            let portAchatCalcule = 0;
            if (fraisPortHT > 0) {
              if (transporteur !== 'standard' && BAREMES_TRANSPORT[transporteur as Exclude<TransporteurType, 'standard'>]) {
                const { prix } = calculerFraisPortBareme(BAREMES_TRANSPORT[transporteur as Exclude<TransporteurType, 'standard'>].bareme, poidsCompa);
                portAchatCalcule = prix ?? 0;
              } else {
                // standard : pas de markup → achat = vente
                portAchatCalcule = calculerFraisPort(poidsCompa, hasGranulatCompa) ?? fraisPortHT;
              }
            }
            const portAchat = portAchatManuel ?? portAchatCalcule;
            const portVente = fraisPortHT;
            const portMarge = portVente - portAchat;
            const portCoeff = portAchat > 0 ? portVente / portAchat : null;
            const transportLabel = transporteur !== 'standard' && BAREMES_TRANSPORT[transporteur as Exclude<TransporteurType, 'standard'>]
              ? `Transport — ${BAREMES_TRANSPORT[transporteur as Exclude<TransporteurType, 'standard'>].label}${expressJ1 ? ' Express' : ''}`
              : 'Transport';
            return (
              <div className="flex-1 overflow-y-auto py-2 pr-1">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-2 py-2 font-medium">Désignation</th>
                        <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Qté</th>
                        <th className="text-left px-2 py-2 font-medium">Fournisseur</th>
                        <th className="text-right px-2 py-2 font-medium whitespace-nowrap">PU Achat</th>
                        <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Total Achat</th>
                        <th className="text-right px-2 py-2 font-medium whitespace-nowrap">PU Vente net</th>
                        <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Total Vente</th>
                        <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Marge €</th>
                        <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Marge %</th>
                        <th className="text-right px-2 py-2 font-medium whitespace-nowrap">Coeff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignesCompa.map(l => {
                        const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                        const pfs = l.produitId ? produitFournisseurs.filter(pf => pf.produitId === l.produitId) : [];
                        const selFournId = selectedFournisseurPerLigne[l.id];
                        const selPf = pfs.find(pf => pf.fournisseurId === selFournId);
                        // prod.prixAchat = prix achat conditionné (référence utilisée dans ProduitFournisseursPanel)
                        // selPf.prixAchat est un champ distinct (prix kg fournisseur) — on n'utilise pas
                        // Paliers : on utilise getPrixPourQuantite pour tenir compte des tarifs par palier
                        const prixPalier = prod ? getPrixPourQuantite(prod, l.quantite) : null;
                        const isSurcharge = !!l.description?.includes('Surcharge énergie');
                        const puVente = l.prixUnitaireHT * (1 - (l.remise || 0) / 100);
                        // Surcharges et lignes libres : utiliser prixAchatLigne stocké (calculé sur base achat)
                        const puAchat = l.prixAchatLigne != null ? l.prixAchatLigne : (prixPalier?.prixAchat ?? 0);
                        const totAchat = puAchat * l.quantite;
                        const totVente = puVente * l.quantite;
                        const marge = totVente - totAchat;
                        const margePct = totVente > 0 ? (marge / totVente) * 100 : 0;
                        const coeff = totAchat > 0 ? totVente / totAchat : null;
                        totalAchat += totAchat;
                        totalVente += totVente;
                        const coeffColor = coeff == null ? '' : coeff >= 1.55 ? 'text-emerald-600 dark:text-emerald-400' : coeff >= 1.43 ? 'text-orange-500' : 'text-destructive';
                        return (
                          <tr key={l.id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="px-2 py-1.5 max-w-[220px]">
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="truncate" title={l.description}>{l.description || <span className="text-muted-foreground italic">—</span>}</span>
                                {prod && (
                                  <button
                                    type="button"
                                    title="Voir la fiche produit"
                                    onClick={() => { const savedId = save(true); navigate(`/produits?search=${encodeURIComponent(prod.reference || '')}&highlight=${prod.id}&returnDevis=${savedId || editingId || ''}`); }}
                                    className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right whitespace-nowrap">{l.quantite} {l.unite}</td>
                            <td className="px-2 py-1.5">
                              {pfs.length > 1 ? (
                                <select
                                  className="text-xs rounded border border-input bg-background px-1 py-0.5 max-w-[140px]"
                                  value={selFournId || ''}
                                  onChange={e => setSelectedFournisseurPerLigne(prev => ({ ...prev, [l.id]: e.target.value }))}
                                >
                                  {pfs.map(pf => {
                                    const f = fournisseurs.find(f => f.id === pf.fournisseurId);
                                    return <option key={pf.id} value={pf.fournisseurId}>{f?.societe || f?.nom || pf.fournisseurId}{pf.estPrioritaire ? ' ★' : ''}</option>;
                                  })}
                                </select>
                              ) : pfs.length === 1 ? (
                                <span className="text-muted-foreground text-xs">{fournisseurs.find(f => f.id === pfs[0].fournisseurId)?.societe || fournisseurs.find(f => f.id === pfs[0].fournisseurId)?.nom || '—'}</span>
                              ) : (
                                <span className="text-muted-foreground italic text-xs">—</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              {isSurcharge ? (
                                // Surcharge : valeur auto-calculée, lecture seule
                                puAchat > 0 ? <span className="text-muted-foreground italic">{formatMontant(puAchat)}</span> : <span className="text-muted-foreground">—</span>
                              ) : !l.produitId ? (
                                // Ligne libre : input toujours éditable
                                <input
                                  type="number" min={0} step={0.01}
                                  value={l.prixAchatLigne ?? ''}
                                  onChange={e => updateLigne(l.id, 'prixAchatLigne', parseFloat(e.target.value) || 0)}
                                  className="w-20 text-right border border-border rounded px-1 py-0 text-xs bg-background"
                                  placeholder="0,00"
                                />
                              ) : compaEditingId === l.id && compaEditingField === 'achat' ? (
                                // Édition en cours
                                <input
                                  type="number" min={0} step={0.01}
                                  value={compaEditVal}
                                  onChange={e => setCompaEditVal(e.target.value)}
                                  onBlur={() => {
                                    const v = parseFloat(compaEditVal);
                                    updateLigne(l.id, 'prixAchatLigne', !isNaN(v) && v > 0 ? v : undefined);
                                    setCompaEditingId(null);
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                    if (e.key === 'Escape') setCompaEditingId(null);
                                  }}
                                  autoFocus
                                  className="w-20 text-right border border-primary rounded px-1 py-0 text-xs bg-background"
                                />
                              ) : (
                                // Lecture — clic pour éditer
                                <div className="flex items-center gap-0.5 justify-end group/edit">
                                  {l.prixAchatLigne != null && (
                                    <button type="button" title="Remettre le prix achat automatique"
                                      onClick={() => updateLigne(l.id, 'prixAchatLigne', undefined)}
                                      className="opacity-0 group-hover/edit:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                                    ><RotateCcw className="w-3 h-3" /></button>
                                  )}
                                  <span
                                    title={l.prixAchatLigne != null ? 'Prix achat modifié manuellement — cliquer pour éditer' : 'Cliquer pour modifier le prix achat'}
                                    onClick={() => { setCompaEditingId(l.id); setCompaEditingField('achat'); setCompaEditVal(String(puAchat || 0)); }}
                                    className={`cursor-pointer hover:underline decoration-dashed underline-offset-2 transition-colors ${l.prixAchatLigne != null ? 'text-amber-600 dark:text-amber-400 font-medium' : 'hover:text-primary'}`}
                                  >
                                    {puAchat > 0 ? formatMontant(puAchat) : <span className="text-muted-foreground">—</span>}
                                  </span>
                                  <Pencil
                                    className="w-3 h-3 opacity-0 group-hover/edit:opacity-50 text-muted-foreground shrink-0 cursor-pointer hover:opacity-100"
                                    onClick={() => { setCompaEditingId(l.id); setCompaEditingField('achat'); setCompaEditVal(String(puAchat || 0)); }}
                                  />
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right">{totAchat > 0 ? formatMontant(totAchat) : <span className="text-muted-foreground">—</span>}</td>
                            {/* PU Vente — éditable par clic */}
                            <td className="px-2 py-1.5 text-right">
                              {isSurcharge ? (
                                <span className="text-muted-foreground italic">{formatMontant(puVente)}</span>
                              ) : compaEditingId === l.id && compaEditingField === 'vente' ? (
                                <input
                                  type="number" min={0} step={0.01}
                                  value={compaEditVal}
                                  onChange={e => setCompaEditVal(e.target.value)}
                                  onBlur={() => {
                                    const v = parseFloat(compaEditVal);
                                    if (!isNaN(v) && v >= 0) {
                                      const remise = l.remise || 0;
                                      updateLigne(l.id, 'prixUnitaireHT', remise < 100 ? v / (1 - remise / 100) : v);
                                    }
                                    setCompaEditingId(null);
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                    if (e.key === 'Escape') setCompaEditingId(null);
                                  }}
                                  autoFocus
                                  className="w-20 text-right border border-primary rounded px-1 py-0 text-xs bg-background"
                                />
                              ) : (
                                <div className="flex items-center gap-0.5 justify-end group/editv">
                                  <span
                                    title="Cliquer pour modifier le prix de vente"
                                    onClick={() => { setCompaEditingId(l.id); setCompaEditingField('vente'); setCompaEditVal(String(+puVente.toFixed(4))); }}
                                    className="cursor-pointer hover:underline decoration-dashed underline-offset-2 transition-colors hover:text-primary"
                                  >
                                    {formatMontant(puVente)}
                                  </span>
                                  <Pencil
                                    className="w-3 h-3 opacity-0 group-hover/editv:opacity-50 text-muted-foreground shrink-0 cursor-pointer hover:opacity-100"
                                    onClick={() => { setCompaEditingId(l.id); setCompaEditingField('vente'); setCompaEditVal(String(+puVente.toFixed(4))); }}
                                  />
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right font-medium">{formatMontant(totVente)}</td>
                            <td className={`px-2 py-1.5 text-right ${marge < 0 ? 'text-destructive' : ''}`}>{totAchat > 0 ? formatMontant(marge) : <span className="text-muted-foreground">—</span>}</td>
                            <td className={`px-2 py-1.5 text-right ${margePct < 30 && totAchat > 0 ? 'text-orange-500' : ''}`}>{totAchat > 0 ? `${margePct.toFixed(1)}%` : <span className="text-muted-foreground">—</span>}</td>
                            {/* Coeff — éditable par clic */}
                            <td className={`px-2 py-1.5 text-right font-semibold ${coeffColor}`}>
                              {isSurcharge ? (
                                coeff != null ? coeff.toFixed(2) : <span className="text-muted-foreground font-normal">—</span>
                              ) : compaEditingId === l.id && compaEditingField === 'coeff' ? (
                                <input
                                  type="number" min={0} step={0.01}
                                  value={compaEditVal}
                                  onChange={e => setCompaEditVal(e.target.value)}
                                  onBlur={() => {
                                    const v = parseFloat(compaEditVal);
                                    if (!isNaN(v) && v > 0 && puAchat > 0) {
                                      const newPuVente = puAchat * v;
                                      const remise = l.remise || 0;
                                      updateLigne(l.id, 'prixUnitaireHT', remise < 100 ? newPuVente / (1 - remise / 100) : newPuVente);
                                    }
                                    setCompaEditingId(null);
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                    if (e.key === 'Escape') setCompaEditingId(null);
                                  }}
                                  autoFocus
                                  className="w-16 text-right border border-primary rounded px-1 py-0 text-xs bg-background"
                                />
                              ) : (
                                <div className="flex items-center gap-0.5 justify-end group/editc">
                                  <span
                                    title={coeff != null && puAchat > 0 ? 'Cliquer pour modifier le coefficient' : ''}
                                    onClick={() => { if (coeff != null && puAchat > 0) { setCompaEditingId(l.id); setCompaEditingField('coeff'); setCompaEditVal(coeff.toFixed(2)); } }}
                                    className={coeff != null && puAchat > 0 ? 'cursor-pointer hover:underline decoration-dashed underline-offset-2 transition-colors hover:text-primary font-semibold' : 'font-normal text-muted-foreground'}
                                  >
                                    {coeff != null ? coeff.toFixed(2) : '—'}
                                  </span>
                                  {coeff != null && puAchat > 0 && (
                                    <Pencil
                                      className="w-3 h-3 opacity-0 group-hover/editc:opacity-50 text-muted-foreground shrink-0 cursor-pointer hover:opacity-100"
                                      onClick={() => { setCompaEditingId(l.id); setCompaEditingField('coeff'); setCompaEditVal(coeff.toFixed(2)); }}
                                    />
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {portVente > 0 && (() => {
                        const portCoeffColor = portCoeff == null ? '' : portCoeff >= 1.55 ? 'text-emerald-600 dark:text-emerald-400' : portCoeff >= 1.43 ? 'text-orange-500' : 'text-destructive';
                        totalAchat += portAchat;
                        totalVente += portVente;
                        return (
                          <tr className="border-b border-border/50 hover:bg-muted/30 bg-blue-50/30 dark:bg-blue-950/20">
                            <td className="px-2 py-1.5 text-muted-foreground italic" colSpan={3}>{transportLabel}</td>
                            <td className="px-2 py-1.5 text-right">
                              {compaEditingId === '__transport__' ? (
                                <input
                                  type="number" min={0} step={0.01}
                                  value={compaEditVal}
                                  onChange={e => setCompaEditVal(e.target.value)}
                                  onBlur={() => {
                                    const v = parseFloat(compaEditVal);
                                    setPortAchatManuel(!isNaN(v) && v >= 0 ? v : null);
                                    setCompaEditingId(null);
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                    if (e.key === 'Escape') setCompaEditingId(null);
                                  }}
                                  autoFocus
                                  className="w-20 text-right border border-primary rounded px-1 py-0 text-xs bg-background"
                                />
                              ) : (
                                <div className="flex items-center gap-0.5 justify-end group/edit">
                                  {portAchatManuel != null && (
                                    <button type="button" title="Remettre le coût transport automatique"
                                      onClick={() => setPortAchatManuel(null)}
                                      className="opacity-0 group-hover/edit:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                                    ><RotateCcw className="w-3 h-3" /></button>
                                  )}
                                  <span
                                    title={portAchatManuel != null ? 'Coût transport modifié manuellement — cliquer pour éditer' : 'Cliquer pour modifier le coût transport achat'}
                                    onClick={() => { setCompaEditingId('__transport__'); setCompaEditVal(String(portAchat || 0)); }}
                                    className={`cursor-pointer hover:underline decoration-dashed underline-offset-2 transition-colors ${portAchatManuel != null ? 'text-amber-600 dark:text-amber-400 font-medium' : 'hover:text-primary'}`}
                                  >
                                    {portAchat > 0 ? formatMontant(portAchat) : <span className="text-muted-foreground">—</span>}
                                  </span>
                                  <Pencil
                                    className="w-3 h-3 opacity-0 group-hover/edit:opacity-50 text-muted-foreground shrink-0 cursor-pointer hover:opacity-100"
                                    onClick={() => { setCompaEditingId('__transport__'); setCompaEditVal(String(portAchat || 0)); }}
                                  />
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right">{portAchat > 0 ? formatMontant(portAchat) : <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-2 py-1.5 text-right">{formatMontant(portVente)}</td>
                            <td className="px-2 py-1.5 text-right font-medium">{formatMontant(portVente)}</td>
                            <td className={`px-2 py-1.5 text-right ${portMarge < 0 ? 'text-destructive' : ''}`}>{portAchat > 0 ? formatMontant(portMarge) : <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-2 py-1.5 text-right text-muted-foreground">—</td>
                            <td className={`px-2 py-1.5 text-right font-semibold ${portCoeffColor}`}>{portCoeff != null ? portCoeff.toFixed(2) : <span className="text-muted-foreground font-normal">—</span>}</td>
                          </tr>
                        );
                      })()}
                    </tbody>
                    {lignesCompa.length > 0 && (() => {
                      const mTotal = totalVente - totalAchat;
                      const margePctTotal = totalVente > 0 ? (mTotal / totalVente) * 100 : 0;
                      const coeffTotal = totalAchat > 0 ? totalVente / totalAchat : null;
                      const coeffTotalColor = coeffTotal == null ? '' : coeffTotal >= 1.55 ? 'text-emerald-600 dark:text-emerald-400' : coeffTotal >= 1.43 ? 'text-orange-500' : 'text-destructive';
                      return (
                        <tfoot>
                          <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                            <td className="px-2 py-2" colSpan={4}>Total</td>
                            <td className="px-2 py-2 text-right">{totalAchat > 0 ? formatMontant(totalAchat) : '—'}</td>
                            <td className="px-2 py-2"></td>
                            <td className="px-2 py-2 text-right">{formatMontant(totalVente)}</td>
                            <td className={`px-2 py-2 text-right ${mTotal < 0 ? 'text-destructive' : ''}`}>{totalAchat > 0 ? formatMontant(mTotal) : '—'}</td>
                            <td className={`px-2 py-2 text-right ${margePctTotal < 30 && totalAchat > 0 ? 'text-orange-500' : ''}`}>{totalAchat > 0 ? `${margePctTotal.toFixed(1)}%` : '—'}</td>
                            <td className={`px-2 py-2 text-right ${coeffTotalColor}`}>{coeffTotal != null ? coeffTotal.toFixed(2) : '—'}</td>
                          </tr>
                        </tfoot>
                      );
                    })()}
                  </table>
                </div>
              </div>
            );
          })()}
          {/* ── Onglet MO (Mise en œuvre) ──────────────────────────────────────── */}
          {dialogTab === 'mo' && (
            <div className="flex flex-col flex-1 min-h-0 py-2 gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap shrink-0">
                <div className="text-sm text-muted-foreground">
                  Document de <span className="font-medium text-foreground">Mise en œuvre</span> joint au devis (PDF). Reprend les groupes, notes et descriptions/notes de lignes.
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={regenerateMo}><RotateCcw className="w-4 h-4 mr-1.5" /> (Re)générer le récap</Button>
                  <Button size="sm" onClick={exportMoPdf} disabled={moGenerating}><FileText className="w-4 h-4 mr-1.5" /> {moGenerating ? 'Génération…' : 'PDF Mise en œuvre'}</Button>
                </div>
              </div>
              <RichTextEditor value={moContent} onChange={setMoContent} placeholder="Cliquez sur « (Re)générer le récap » ou saisissez le texte de mise en œuvre…" className="flex-1 min-h-0" />
              {/* Zone hors-écran pour la génération PDF (titre + contenu) */}
              <div className="fixed -left-[9999px] top-0 pointer-events-none" aria-hidden>
                <div ref={moPrintRef} style={{ width: 794, padding: 32, background: '#fff', color: '#000', fontFamily: 'Arial, sans-serif' }}>
                  <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Mise en œuvre</h1>
                  <p style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
                    {(editingId ? devis.find(d => d.id === editingId)?.numero : '') || 'Devis'}
                    {systeme ? ` — ${systeme}` : ''}
                  </p>
                  <div style={{ fontSize: 13, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: moContent || '<p style="color:#888">(vide)</p>' }} />
                </div>
              </div>
            </div>
          )}
          {/* ── Onglet CRM ──────────────────────────────────────────────────────── */}
          {dialogTab === 'crm' && editingId && (() => {
            const devisActions = crmActions.filter(a => a.devisId === editingId);
            const currentDevis = devis.find(d => d.id === editingId);
            return (
              <div className="flex-1 overflow-y-auto py-3 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Actions CRM liées à ce devis</h3>
                  <Button size="sm" variant="outline" onClick={() => { setEditingCrmAction(null); setCrmActionDialogOpen(true); }}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Nouvelle action
                  </Button>
                </div>
                {devisActions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Aucune action CRM pour ce devis.</p>
                ) : (
                  <div className="space-y-2">
                    {devisActions.sort((a, b) => (b.datePlanifiee || '') > (a.datePlanifiee || '') ? 1 : -1).map(action => (
                      <div key={action.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
                        <span className="text-lg">{TYPE_CRM_ACTION[action.type]?.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm">{action.titre}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUT_CRM_ACTION[action.statut]?.color}`}>{STATUT_CRM_ACTION[action.statut]?.label}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_CRM_ACTION[action.type]?.color}`}>{TYPE_CRM_ACTION[action.type]?.label}</span>
                          </div>
                          {action.description && <p className="text-xs text-muted-foreground mt-1">{action.description}</p>}
                          {action.datePlanifiee && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <CalendarClock className="w-3 h-3" /> {formatDate(action.datePlanifiee)}
                              {action.dateRealisee && ` → réalisée le ${formatDate(action.dateRealisee)}`}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
          {/* ── Onglet Notes & Fichiers ─────────────────────────────────────────── */}
          {dialogTab === 'notes' && editingId && (
            <div className="flex flex-col flex-1 min-h-0 py-2">
              <DevisChatter
                embedded
                open
                onOpenChange={() => {}}
                devisId={editingId}
                devisNumero={devis.find(d => d.id === editingId)?.numero || ''}
                clients={clients}
                produits={produits}
                onRestore={(snap) => { populateForm(snap); toast.success('Version restaurée'); }}
              />
            </div>
          )}

        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      {previewDevis && (
        <Dialog open={!!previewDevis} onOpenChange={() => setPreviewDevis(null)}>
          <DialogContent className="max-w-[98vw] md:max-w-[960px] max-h-[95vh] overflow-y-auto p-0 bg-muted/30">
            <DevisPreview devis={previewDevis} client={clients.find(c => c.id === previewDevis.clientId)} produits={produits} lineImages={lineImages} onEdit={() => { const d = previewDevis; setPreviewDevis(null); setEditingId(d.id); populateForm(d); setDialogOpen(true); }} onOptionsChange={setPreviewOptions} initialShowConso={previewDevis.modeCalcul === 'surface' || previewOptions.showConso} initialShowRemise={previewOptions.showRemise} initialShowComposants={previewOptions.showComposants} initialShowKgRecap={previewOptions.showKgRecap} onPrint={() => { const updated = { ...previewDevis, statut: 'envoyé' as const }; setPreviewDevis(updated); updateDevis(prev => prev.map(d => d.id === previewDevis.id ? updated : d)); toast.success('Statut mis à jour : Envoyé'); }} onSurfaceChange={(ligneId, val) => { setPreviewDevis(prev => { if (!prev) return prev; const updated = { ...prev, lignes: prev.lignes.map(l => l.id === ligneId ? { ...l, surfaceM2: val || undefined } : l) }; updateDevis(all => all.map(d => d.id === updated.id ? updated : d)); return updated; }); }} />
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>Êtes-vous sûr de vouloir supprimer ce devis ? Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conteneur caché pour génération PDF */}
      {emailDevis && (
        <div
          ref={pdfContainerRef}
          style={{ position: 'fixed', left: '-9999px', top: '0', width: '794px', background: 'white', zIndex: -1 }}
          aria-hidden="true"
        >
          <DevisPreview
            key={`${previewOptions.showConso}-${previewOptions.showRemise}-${previewOptions.showComposants}-${previewOptions.showKgRecap}`}
            devis={{ ...emailDevis, statut: 'envoyé' }}
            client={clients.find(c => c.id === emailDevis.clientId)}
            produits={produits}
            lineImages={lineImages}
            hideControls={true}
            initialShowConso={previewOptions.showConso || emailDevis.modeCalcul === 'surface'}
            initialShowRemise={previewOptions.showRemise}
            initialShowComposants={previewOptions.showComposants}
            initialShowKgRecap={previewOptions.showKgRecap}
          />
        </div>
      )}

      {/* Email Dialog */}
      <DevisEmailDialog
        open={!!emailDevis}
        onOpenChange={(open) => { if (!open) setEmailDevis(null); }}
        devis={emailDevis}
        client={emailDevis ? clients.find(c => c.id === emailDevis.clientId) : undefined}
        produits={produits}
        pdfContainerRef={pdfContainerRef}
        previewOptions={previewOptions}
        onPreviewOptionsChange={setPreviewOptions}
        onSent={(dateEnvoi) => {
          if (emailDevis) {
            updateDevis(prev => prev.map(d =>
              d.id === emailDevis.id ? { ...d, statut: 'envoyé', dateEnvoi } : d
            ));
            toast.success('Devis envoyé — statut et date d\'envoi mis à jour');
            logHistorique({ entiteType: 'devis', entiteId: emailDevis.id, entiteNumero: emailDevis.numero, action: 'envoi_email', details: { destinataire: clients.find(c => c.id === emailDevis.clientId)?.email, dateEnvoi, client: clients.find(c => c.id === emailDevis.clientId)?.nom } });
          }
        }}
      />

      {/* Commande Fournisseur Dialog */}
      <CommandeFournisseurDialog
        open={!!commandeDevis}
        onOpenChange={(open) => { if (!open) setCommandeDevis(null); }}
        devis={commandeDevis}
        produits={produits}
        fournisseurs={fournisseurs}
        produitFournisseurs={produitFournisseurs}
        onSaveCommandes={(commandes) => {
          updateCommandesFournisseur(prev => [...prev, ...commandes]);
        }}
        onPriseStock={(items) => {
          updateProduits(prev => prev.map(p => {
            const item = items.find(i => i.produitId === p.id);
            if (!item) return p;
            return { ...p, stock: Math.max(0, (p.stock ?? 0) - item.quantite) };
          }));
        }}
      />

      {/* Confirmation commande fournisseur quand devis accepté */}
      <AlertDialog open={!!commandeConfirmDevis} onOpenChange={(open) => { if (!open) setCommandeConfirmDevis(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Créer une commande fournisseur ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Le devis {commandeConfirmDevis?.numero} a été accepté et une <strong>commande client a été créée automatiquement</strong>. Souhaitez-vous également générer les bons de commande fournisseur correspondants ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Plus tard</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setCommandeDevis(commandeConfirmDevis);
              setCommandeConfirmDevis(null);
            }}>
              Créer la commande
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EmailAnalyzerDialog
        open={emailAnalyzerOpen}
        onOpenChange={setEmailAnalyzerOpen}
        onDevisCreated={(devisId) => {
          const d = devis.find(dv => dv.id === devisId);
          if (d) openEdit(d);
        }}
      />

      {chatterDevis && (
        <DevisChatter
          open={!!chatterDevis}
          onOpenChange={(open) => { if (!open) { setChatterDevis(null); setChatterMode(null); } }}
          devisId={chatterDevis.id}
          devisNumero={chatterDevis.numero}
          initialMode={chatterMode}
          clients={clients}
          produits={produits}
          onRestore={(snapshot) => {
            updateDevis(prev => prev.map(d => d.id === snapshot.id ? { ...snapshot } : d));
            logHistorique({ entiteType: 'devis', entiteId: snapshot.id, entiteNumero: snapshot.numero, action: 'modification', details: { client: clients.find(c => c.id === snapshot.clientId)?.nom, referenceAffaire: snapshot.referenceAffaire, snapshot: devis.find(d => d.id === snapshot.id) ?? null, note: 'Restauration version précédente' } });
          }}
        />
      )}

      {/* Archive Dialog */}
      <DevisArchiveDialog
        devis={archiveTarget}
        open={archiveDialogOpen}
        onOpenChange={(open) => { setArchiveDialogOpen(open); if (!open) setArchiveTarget(null); }}
        onConfirm={(data) => archiveTarget && confirmArchive(archiveTarget, data)}
        produits={produits}
      />

      {/* CRM Action Dialog (from devis CRM tab) */}
      <CRMActionDialog
        open={crmActionDialogOpen}
        onOpenChange={setCrmActionDialogOpen}
        action={editingCrmAction}
        clients={clients}
        produits={produits.map(p => ({ id: p.id, reference: p.reference, description: p.description }))}
        defaultDevisId={editingId || undefined}
        defaultClientId={clientId || undefined}
        onSave={async (a) => { const err = await addCrmAction(a); return err ?? null; }}
      />

      <DevisAssistantDialog
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        produits={produits}
        onInsertLignes={(newLignes) => {
          saveSnapshot();
          setLignes(prev => [...prev, ...newLignes]);
          setNewLigneId(newLignes[newLignes.length - 1]?.id ?? null);
        }}
        devisContext={(() => {
          const lines = lignes.map((l, i) => {
            if (l.type === 'groupe') return `[Groupe] ${l.description}`;
            if (l.type === 'texte') return `[Note] ${l.description}`;
            if (l.type === 'soustotal') return `[Sous-total]`;
            const t = calculerTotalLigne(l);
            return `${i + 1}. ${l.description || 'sans nom'} | Réf: ${l.produitId ? (produits.find(p => p.id === l.produitId)?.reference ?? l.produitId) : 'libre'} | Qté: ${l.quantite} ${l.unite || ''} | Prix HT: ${l.prixUnitaireHT} | Remise: ${l.remise}% | Total HT: ${formatMontant(t.totalHT)}`;
          }).join('\n');
          const total = calculerTotalDevis(lignes, fraisPortHT, fraisPortTVA);
          return `Lignes du devis:\n${lines}\n\nTotal HT: ${formatMontant(total.totalHT)}\nTotal TTC: ${formatMontant(total.totalTTC)}`;
        })()}
      />

    </div>
  );
}
