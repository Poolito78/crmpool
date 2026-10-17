import { prochainNumero } from '@/lib/numeroDevis';
import { useSocietes } from '@/hooks/useSocietes';
import { useState, useMemo, Fragment } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTableColumns } from '@/hooks/useTableColumns';
import ColResizeHandle from '@/components/ColResizeHandle';
import PageHeaderSlot from '@/components/PageHeaderSlot';
import FilterSuggestInput from '@/components/FilterSuggestInput';
import FilterDateInput, { matchDateFilter, parseDateFilter } from '@/components/FilterDateInput';
import FilterAmountInput, { matchAmountFilter, parseAmountFilter } from '@/components/FilterAmountInput';
import TableGearMenu from '@/components/TableGearMenu';
import RowActionsMenu from '@/components/RowActionsMenu';
import FilterChoiceInput from '@/components/FilterChoiceInput';
import { exportToExcel } from '@/lib/exportExcel';
import { useCRM } from '@/lib/StoreContext';
import { useCurrentUser } from '@/hooks/useAuth';
import { useCommercials } from '@/hooks/useCommercials';
import {
  generateId, formatMontant, formatDate,
  STATUTS_FACTURE_CLIENT, type FactureClient, type StatutFactureClient, type LigneDevis,
  calculerTotalDevis, dbToFactureClient,
} from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import { EMETTEUR } from '@/lib/emetteur';
import { societeDuDocument, emetteurDe } from '@/lib/societes';
import {
  controlerFacture, clientFige, categorieSuggeree, mentionsPaiement,
  CATEGORIES_OPERATION, type CategorieOperation,
} from '@/lib/factureConforme';
import { Plus, Search, Trash2, Pencil, FileText, Receipt, CheckCircle2, AlertCircle, Euro, ArrowRight, Filter, X, Stamp, Undo2, Lock, Building2 } from 'lucide-react';
import SocieteDocumentDialog from '@/components/SocieteDocumentDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import ClientCombobox from '@/components/ClientCombobox';

/** Statuts d'une facture ÉMISE : elle ne revient ni en brouillon ni en annulée (on émet un avoir). */
const statutsEmise: StatutFactureClient[] = ['envoyée', 'payée'];
const allStatuts = Object.keys(STATUTS_FACTURE_CLIENT) as StatutFactureClient[];

/** Libellé du numéro : un brouillon n'en a pas encore (la base l'attribue à l'émission). */
function libelleNumero(f: Pick<FactureClient, 'numero' | 'typeDocument'>) {
  return f.numero || (f.typeDocument === 'avoir' ? 'Avoir brouillon' : 'Brouillon');
}
/** Montant signé : un avoir vient en déduction. */
const signe = (f: FactureClient) => (f.typeDocument === 'avoir' ? -1 : 1);

type ViewMode = 'toutes' | 'factures' | 'proformas';

type FCColKey = 'numero' | 'client' | 'ref' | 'date' | 'echeance' | 'paiement' | 'total' | 'statut' | 'commercial';
const FC_COLS: { key: FCColKey; label: string; cls: string }[] = [
  { key: 'numero', label: 'N°', cls: 'text-left' },
  { key: 'client', label: 'Client', cls: 'text-left' },
  { key: 'ref', label: 'Réf. / Liens', cls: 'text-left hidden sm:table-cell' },
  { key: 'date', label: 'Date', cls: 'text-left hidden md:table-cell' },
  { key: 'echeance', label: 'Échéance', cls: 'text-left hidden lg:table-cell' },
  { key: 'paiement', label: 'Paiement', cls: 'text-left hidden lg:table-cell' },
  { key: 'total', label: 'Total TTC', cls: 'text-right' },
  { key: 'statut', label: 'Statut', cls: 'text-center' },
  { key: 'commercial', label: 'Commercial', cls: 'text-left' },
];

export default function FacturesClient() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { facturesClient, updateFacturesClient, clients, devis, commandesClient } = useCRM();
  const { serieDe, societes } = useSocietes();
  /** Émetteur d'une facture : sa société ; ISOSIGN codé en dur tant que la table manque. */
  const emetteurDeFacture = (f: FactureClient) => { const soc = societeDuDocument(f, societes); return soc ? emetteurDe(soc) : EMETTEUR; };
  const { isAdmin, userId } = useCurrentUser();
  const { commercials, nameOf } = useCommercials();
  const fcCols = useTableColumns<FCColKey>('factures_client_table', FC_COLS.map(c => c.key));

  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [filterStatut, setFilterStatut] = useState<string>('tous');
  const [viewMode, setViewMode] = useState<ViewMode>('toutes');
  const [colFilters, setColFilters] = useState<Partial<Record<FCColKey, string>>>({});
  const [openFilterCols, setOpenFilterCols] = useState<Set<FCColKey>>(new Set());
  const [visCols, setVisCols] = useState<Set<FCColKey>>(() => {
    try { const s = localStorage.getItem('factures_client_visible'); if (s) return new Set([...(JSON.parse(s) as FCColKey[]), 'commercial']); } catch { /* ignore */ }
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
  const [emissionTarget, setEmissionTarget] = useState<FactureClient | null>(null);
  const [emissionEnCours, setEmissionEnCours] = useState(false);
  const [logoFacture, setLogoFacture] = useState<FactureClient | null>(null);

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
  // Réforme facture électronique
  const [categorieOperation, setCategorieOperation] = useState<CategorieOperation | ''>('');
  const [tvaSurDebits, setTvaSurDebits] = useState(false);
  const [horsEInvoicing, setHorsEInvoicing] = useState(false);
  const [livraisonALaFacturation, setLivraisonALaFacturation] = useState(false);
  const [adresseLivraisonId, setAdresseLivraisonId] = useState('');
  const [typeDocument, setTypeDocument] = useState<'facture' | 'avoir'>('facture');
  const [factureOrigineId, setFactureOrigineId] = useState('');
  const [lignesFigees, setLignesFigees] = useState<FactureClient | null>(null);

  /** Une proforma a sa série PRO- ; une facture brouillon n'a pas de numéro avant l'émission. */
  function nextNumero(proforma: boolean) {
    if (!proforma) return '';
    return prochainNumero(facturesClient, serieDe('PRO'));
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
    setCategorieOperation('');
    setTvaSurDebits(false);
    setHorsEInvoicing(false);
    setLivraisonALaFacturation(false);
    setAdresseLivraisonId('');
    setTypeDocument('facture');
    setFactureOrigineId('');
    setLignesFigees(null);
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
    setCategorieOperation(f.categorieOperation || '');
    setTvaSurDebits(f.tvaSurDebits ?? false);
    setHorsEInvoicing(f.horsEInvoicing ?? false);
    setLivraisonALaFacturation(f.livraisonALaFacturation ?? false);
    const cl = clients.find(c => c.id === f.clientId);
    const adr = f.adresseLivraisonFigee
      ? cl?.adressesLivraison?.find(a => a.adresse === f.adresseLivraisonFigee!.adresse && a.ville === f.adresseLivraisonFigee!.ville)
      : undefined;
    setAdresseLivraisonId(adr?.id || '');
    setTypeDocument(f.typeDocument || 'facture');
    setFactureOrigineId(f.factureOrigineId || '');
    // Un avoir, ou une facture créée depuis une commande, garde SES lignes :
    // ne pas les relire sur le devis, qui a pu bouger.
    setLignesFigees(f.typeDocument === 'avoir' || f.commandeClientId ? f : null);
    setDialogOpen(true);
  }

  function save() {
    if (!clientId) { toast.error('Sélectionnez un client'); return; }
    const enCours = editingId ? facturesClient.find(f => f.id === editingId) : undefined;
    if (enCours?.emiseLe) { toast.error(`Facture ${enCours.numero} émise : elle ne se modifie plus. Émettre un avoir.`); return; }

    const linkedDevis = devisId ? devis.find(d => d.id === devisId) : null;
    let lignes: LigneDevis[] = linkedDevis ? linkedDevis.lignes : [];
    let fraisPortHT = linkedDevis?.fraisPortHT ?? 0;
    const fraisPortTVA = linkedDevis?.fraisPortTVA ?? 20;
    let total = linkedDevis
      ? calculerTotalDevis(lignes, fraisPortHT, fraisPortTVA)
      : { totalHT: 0, totalTVA: 0, totalTTC: 0 };
    if (lignesFigees) {
      lignes = lignesFigees.lignes;
      fraisPortHT = lignesFigees.fraisPortHT;
      total = { totalHT: lignesFigees.totalHT, totalTVA: lignesFigees.totalTVA, totalTTC: lignesFigees.totalTTC };
    }

    const linkedCC = lignesFigees?.commandeClientId
      ? commandesClient.find(cc => cc.id === lignesFigees.commandeClientId)
      : commandesClient.find(cc => cc.devisId === devisId && devisId);
    const cl = clients.find(c => c.id === clientId);
    const adr = cl?.adressesLivraison?.find(a => a.id === adresseLivraisonId);
    const conformite = {
      typeDocument,
      factureOrigineId: factureOrigineId || undefined,
      categorieOperation: categorieOperation || undefined,
      tvaSurDebits,
      horsEInvoicing,
      livraisonALaFacturation,
      adresseLivraisonFigee: adr && !livraisonALaFacturation
        ? { libelle: adr.libelle, adresse: adr.adresse, codePostal: adr.codePostal, ville: adr.ville }
        : undefined,
    };

    if (editingId) {
      updateFacturesClient(prev => prev.map(f => f.id === editingId ? {
        ...f, clientId, devisId: devisId || undefined, commandeClientId: linkedCC?.id,
        numero: estProforma ? numero : '', dateCreation, dateEcheance: dateEcheance || undefined,
        statut: estProforma ? statut : 'brouillon',
        lignes, totalHT: total.totalHT, totalTVA: total.totalTVA, totalTTC: total.totalTTC,
        fraisPortHT, referenceAffaire: referenceAffaire || undefined, notes: notes || undefined,
        estProforma, ...conformite,
      } : f));
      toast.success(estProforma ? 'Proforma modifiée' : 'Facture modifiée');
    } else {
      const newFacture: FactureClient = {
        id: generateId(), clientId, devisId: devisId || undefined, commandeClientId: linkedCC?.id,
        numero: estProforma ? numero : '', dateCreation, dateEcheance: dateEcheance || undefined,
        statut: estProforma ? statut : 'brouillon',
        lignes, totalHT: total.totalHT, totalTVA: total.totalTVA, totalTTC: total.totalTTC,
        fraisPortHT, referenceAffaire: referenceAffaire || undefined, notes: notes || undefined,
        estProforma, ...conformite,
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
    // La facture issue de la proforma est un BROUILLON sans numéro : il lui
    // sera attribué à l'émission, dans la suite continue tenue par la base.
    updateFacturesClient(prev => prev.map(f => f.id === convertTarget.id
      ? { ...f, estProforma: false, numero: '', statut: 'brouillon' as StatutFactureClient }
      : f));
    toast.success(`Proforma ${convertTarget.numero} convertie en facture brouillon — à émettre`);
    setConvertConfirmOpen(false);
    setConvertTarget(null);
  }

  /** Avoir brouillon qui reprend la facture émise (lignes et montants), à ajuster avant émission. */
  function creerAvoir(f: FactureClient) {
    const avoir: FactureClient = {
      ...f,
      id: generateId(),
      userId: undefined,
      numero: '',
      typeDocument: 'avoir',
      factureOrigineId: f.id,
      statut: 'brouillon',
      dateCreation: new Date().toISOString().split('T')[0],
      datePaiement: undefined,
      emiseLe: undefined,
      clientFige: undefined,
      emetteurFige: undefined,
      notes: `Avoir sur facture ${f.numero}`,
    };
    updateFacturesClient(prev => [...prev, avoir]);
    toast.success(`Avoir brouillon créé sur ${f.numero} — à vérifier puis émettre`);
  }

  async function emettre() {
    const f = emissionTarget;
    if (!f) return;
    const cl = clients.find(c => c.id === f.clientId);
    if (!cl) return;
    setEmissionEnCours(true);
    try {
      const { data, error } = await supabase.rpc('emettre_facture_client' as never, {
        p_id: f.id,
        p_client: clientFige(cl),
      } as never);
      if (error) throw error;
      const emise = dbToFactureClient(data);
      // Remplacer par la ligne relue : mêmes valeurs qu'en base, le diff
      // du store n'y trouve rien que le déclencheur refuserait.
      updateFacturesClient(prev => prev.map(x => x.id === emise.id ? emise : x));
      toast.success(`${emise.typeDocument === 'avoir' ? 'Avoir' : 'Facture'} ${emise.numero} émis(e) — désormais figé(e)`);
      setEmissionTarget(null);
    } catch (e) {
      toast.error("Émission refusée", { description: (e as { message?: string })?.message || String(e) });
    } finally {
      setEmissionEnCours(false);
    }
  }

  const controleEmission = useMemo(() => {
    if (!emissionTarget) return null;
    const cl = clients.find(c => c.id === emissionTarget.clientId);
    const origine = emissionTarget.factureOrigineId ? facturesClient.find(x => x.id === emissionTarget.factureOrigineId) : undefined;
    return controlerFacture(emissionTarget, cl, emetteurDeFacture(emissionTarget), origine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emissionTarget, clients, facturesClient, societes]);

  function confirmDelete() {
    if (!deleteTargetId) return;
    const cible = facturesClient.find(f => f.id === deleteTargetId);
    if (cible?.emiseLe) { toast.error(`Facture ${cible.numero} émise : elle ne se supprime pas. Émettre un avoir.`); setDeleteConfirmOpen(false); return; }
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
      // Périmètre commercial : un non-admin ne voit que ses propres factures.
      if (!isAdmin && f.userId && f.userId !== userId) return false;
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
          case 'commercial': if (nameOf(f.userId) !== v) return false; break;
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
      case 'commercial': return <FilterChoiceInput value={v} onChange={x => setColFilter(key, x)} options={[{ value: '', label: 'Tous' }, ...commercials.map(cm => ({ value: cm.name, label: cm.name }))]} />;
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
  const totalEnvoye = factures.filter(f => f.statut === 'envoyée').reduce((s, f) => s + signe(f) * f.totalTTC, 0);
  const totalPaye = factures.filter(f => f.statut === 'payée').reduce((s, f) => s + signe(f) * f.totalTTC, 0);
  const enRetard = factures.filter(f => f.statut === 'envoyée' && f.typeDocument !== 'avoir' && f.dateEcheance && new Date(f.dateEcheance) < new Date());

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
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
      <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {fcCols.ordered(FC_COLS, k => visCols.has(k)).map(col => {
                const isDragOver = fcCols.dragOverKey === col.key && fcCols.dragKey !== col.key;
                const filterable = col.key !== 'statut' && (col.key !== 'commercial' || isAdmin);
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
                  case 'numero': return <td style={ws} className={base}><div className="flex items-center gap-1.5"><span className={`font-mono text-xs font-semibold ${f.numero ? '' : 'italic text-muted-foreground'}`}>{libelleNumero(f)}</span>{f.emiseLe && <span title={`Émise le ${formatDate(f.emiseLe)} — figée`}><Lock className="w-3 h-3 text-muted-foreground" /></span>}{f.typeDocument === 'avoir' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400 font-bold tracking-wide">AVOIR</span>}{f.estProforma && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 font-bold tracking-wide">PROFORMA</span>}</div></td>;
                  case 'client': return <td style={ws} className={base}><div className="font-medium truncate">{client?.nom || '—'}</div>{client?.societe && <div className="text-xs text-muted-foreground truncate">{client.societe}</div>}</td>;
                  case 'ref': return <td style={ws} className={base}><div className="text-xs text-muted-foreground">{f.referenceAffaire || ''}</div><div className="flex items-center gap-1 flex-wrap mt-0.5">{dv && <button onClick={() => navigate(`/devis?search=${encodeURIComponent(dv.numero)}`)} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-success/10 text-success font-medium hover:bg-success/20"><FileText className="w-2.5 h-2.5" />{dv.numero}</button>}{cc && <button onClick={() => navigate(`/commandes-client?search=${encodeURIComponent(cc.numero)}`)} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium hover:bg-primary/20">{cc.numero}</button>}</div></td>;
                  case 'date': return <td style={ws} className={`${base} text-muted-foreground text-xs`}>{formatDate(f.dateCreation)}</td>;
                  case 'echeance': return <td style={ws} className={base}>{f.dateEcheance ? <span className={`text-xs font-medium ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>{formatDate(f.dateEcheance)}{isOverdue && <span className="block text-[10px]">Échu</span>}</span> : <span className="text-muted-foreground text-xs">—</span>}</td>;
                  case 'paiement': return <td style={ws} className={`${base} text-xs text-muted-foreground`}>{f.datePaiement ? formatDate(f.datePaiement) : '—'}</td>;
                  case 'total': return <td style={ws} className={`${base} font-semibold`}>{formatMontant(f.totalTTC)}</td>;
                  case 'statut': return <td style={ws} className={base}>{f.estProforma ? <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 font-medium">{STATUTS_FACTURE_CLIENT[f.statut].label}</span> : !f.emiseLe ? <span className={`text-xs px-2 py-1 rounded font-medium ${STATUTS_FACTURE_CLIENT.brouillon.color}`}>À émettre</span> : <select value={f.statut} onChange={e => updateStatut(f.id, e.target.value as StatutFactureClient)} className={`text-xs font-medium px-2 py-1 rounded cursor-pointer border-0 ${statutInfo.color}`}>{statutsEmise.map(s => <option key={s} value={s}>{STATUTS_FACTURE_CLIENT[s].label}</option>)}</select>}</td>;
                  case 'commercial': return <td style={ws} className={`${base} text-muted-foreground text-xs`} title={nameOf(f.userId)}>{nameOf(f.userId)}</td>;
                  default: return <td style={ws} className={base} />;
                }
              };
              return (
                <tr key={f.id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${f.estProforma ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}`}>
                  {fcCols.ordered(FC_COLS, k => visCols.has(k)).map(col => <Fragment key={col.key}>{renderFC(col.key)}</Fragment>)}
                  <td className="py-2 px-2 text-right">
                    <div className="flex items-center justify-end">
                      <RowActionsMenu actions={[
                        { icon: <ArrowRight className="w-4 h-4 text-amber-600" />, label: 'Convertir en facture', onClick: () => { setConvertTarget(f); setConvertConfirmOpen(true); }, hidden: !f.estProforma },
                        { icon: <Stamp className="w-4 h-4 text-primary" />, label: f.typeDocument === 'avoir' ? "Émettre l'avoir" : 'Émettre la facture', onClick: () => setEmissionTarget(f), hidden: f.estProforma || !!f.emiseLe },
                        { icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />, label: f.typeDocument === 'avoir' ? 'Marquer remboursé / imputé' : 'Marquer payée', onClick: () => openPaiement(f), hidden: f.estProforma || !f.emiseLe || f.statut === 'payée' },
                        { icon: <Undo2 className="w-4 h-4 text-rose-600" />, label: 'Créer un avoir', onClick: () => creerAvoir(f), hidden: !f.emiseLe || f.typeDocument === 'avoir' },
                        { icon: <Pencil className="w-4 h-4" />, label: 'Modifier', onClick: () => openEdit(f), hidden: !!f.emiseLe },
                        { icon: <Building2 className="w-4 h-4" />, label: 'Logo…', onClick: () => setLogoFacture(f), hidden: !!f.emiseLe },
                        { icon: <Trash2 className="w-4 h-4" />, label: 'Supprimer', onClick: () => { setDeleteTargetId(f.id); setDeleteConfirmOpen(true); }, danger: true, hidden: !!f.emiseLe },
                      ]} />
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
                : <><Receipt className="w-4 h-4" />{typeDocument === 'avoir' ? `Avoir brouillon${factureOrigineId ? ` sur ${facturesClient.find(x => x.id === factureOrigineId)?.numero || ''}` : ''}` : editingId ? 'Modifier la facture brouillon' : 'Nouvelle facture client'}</>
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
                {estProforma
                  ? <Input value={numero} onChange={e => setNumero(e.target.value)} />
                  : <div className="h-10 flex items-center px-3 rounded-md border border-dashed border-input text-xs text-muted-foreground">Attribué à l'émission</div>}
              </div>
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
                <Label>Date{!estProforma && <span className="text-[10px] text-muted-foreground font-normal"> (celle de l'émission)</span>}</Label>
                <Input type="date" value={dateCreation} onChange={e => setDateCreation(e.target.value)} disabled={!estProforma} />
              </div>
              <div>
                <Label>Échéance{!estProforma && ' *'}</Label>
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
            {!estProforma && (() => {
              const cl = clients.find(c => c.id === clientId);
              const livraisons = (cl?.adressesLivraison || []).filter(a => a.type === 'livraison');
              const lignesVues = lignesFigees?.lignes ?? devis.find(d => d.id === devisId)?.lignes ?? [];
              const suggestion = categorieSuggeree(lignesVues);
              return (
                <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mentions de la facture électronique</p>
                  <div>
                    <Label>Catégorie d'opération *</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(Object.keys(CATEGORIES_OPERATION) as CategorieOperation[]).map(k => (
                        <button key={k} type="button" onClick={() => setCategorieOperation(k)}
                          className={`px-2.5 py-1 rounded text-xs border transition-colors ${categorieOperation === k ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'}`}>
                          {CATEGORIES_OPERATION[k]}
                        </button>
                      ))}
                    </div>
                    {suggestion && !categorieOperation && (
                      <button type="button" onClick={() => setCategorieOperation(suggestion)} className="text-[11px] text-primary underline mt-1">
                        D'après les lignes : {CATEGORIES_OPERATION[suggestion].toLowerCase()} — retenir ?
                      </button>
                    )}
                  </div>
                  {categorieOperation && categorieOperation !== 'biens' && (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={tvaSurDebits} onChange={e => setTvaSurDebits(e.target.checked)} />
                      Option pour le paiement de la TVA d'après les débits
                    </label>
                  )}
                  {livraisons.length > 0 && (
                    <div>
                      <Label>Adresse de livraison</Label>
                      <div className="flex flex-col gap-1 mt-1">
                        {livraisons.map(a => (
                          <label key={a.id} className="flex items-start gap-2 text-xs">
                            <input type="radio" name="adr-liv" checked={!livraisonALaFacturation && adresseLivraisonId === a.id}
                              onChange={() => { setAdresseLivraisonId(a.id); setLivraisonALaFacturation(false); }} />
                            <span><strong>{a.libelle}</strong> — {a.adresse}, {a.codePostal} {a.ville}</span>
                          </label>
                        ))}
                        <label className="flex items-center gap-2 text-xs">
                          <input type="radio" name="adr-liv" checked={livraisonALaFacturation}
                            onChange={() => { setLivraisonALaFacturation(true); setAdresseLivraisonId(''); }} />
                          Livré à l'adresse de facturation
                        </label>
                      </div>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={horsEInvoicing} onChange={e => setHorsEInvoicing(e.target.checked)} />
                    Client sans SIREN (particulier) — relève de l'e-reporting
                  </label>
                </div>
              );
            })()}
            <div>
              <Label>Notes</Label>
              <textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={save} className={estProforma ? 'bg-amber-500 hover:bg-amber-600' : ''}>
              {editingId ? 'Enregistrer' : estProforma ? 'Créer la proforma' : 'Créer le brouillon'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Émission : contrôle de conformité, puis numéro définitif et gel */}
      <Dialog open={!!emissionTarget} onOpenChange={o => { if (!o && !emissionEnCours) setEmissionTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Stamp className="w-4 h-4" />{emissionTarget?.typeDocument === 'avoir' ? "Émettre l'avoir" : 'Émettre la facture'}</DialogTitle>
          </DialogHeader>
          {emissionTarget && controleEmission && (
            <div className="space-y-3 py-2 text-sm">
              <p className="text-muted-foreground">
                {clients.find(c => c.id === emissionTarget.clientId)?.societe || clients.find(c => c.id === emissionTarget.clientId)?.nom} — {formatMontant(emissionTarget.totalTTC)} TTC.
                Émise par <strong>{emetteurDeFacture(emissionTarget).raisonSociale}</strong>. Le numéro définitif est attribué maintenant, à la date du jour. <strong>Ensuite la {emissionTarget.typeDocument === 'avoir' ? "pièce" : 'facture'} ne se modifie ni ne se supprime plus</strong> : une correction passe par un avoir.
              </p>
              {controleEmission.bloquants.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5">
                  <p className="font-semibold text-destructive text-xs mb-1 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />À corriger avant d'émettre</p>
                  <ul className="list-disc pl-5 space-y-0.5 text-xs">{controleEmission.bloquants.map(b => <li key={b}>{b}</li>)}</ul>
                </div>
              )}
              {controleEmission.avertissements.length > 0 && (
                <div className="rounded-md border border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20 p-2.5">
                  <p className="font-semibold text-amber-700 dark:text-amber-400 text-xs mb-1">À vérifier</p>
                  <ul className="list-disc pl-5 space-y-0.5 text-xs">{controleEmission.avertissements.map(b => <li key={b}>{b}</li>)}</ul>
                </div>
              )}
              {controleEmission.bloquants.length === 0 && (
                <div className="rounded-md border border-border p-2.5">
                  <p className="font-semibold text-xs mb-1">Mentions de paiement portées</p>
                  <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-muted-foreground">{mentionsPaiement(emissionTarget).map(m => <li key={m}>{m}</li>)}</ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmissionTarget(null)} disabled={emissionEnCours}>Annuler</Button>
            {emissionTarget && controleEmission && controleEmission.bloquants.length > 0 ? (
              <Button variant="outline" onClick={() => { const t = emissionTarget; setEmissionTarget(null); openEdit(t); }}>
                <Pencil className="w-4 h-4 mr-2" />Compléter
              </Button>
            ) : (
              <Button onClick={emettre} disabled={emissionEnCours || !controleEmission}>
                <Stamp className="w-4 h-4 mr-2" />{emissionEnCours ? 'Émission…' : 'Émettre définitivement'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logo (marque) d'une facture brouillon ; figé à l'émission */}
      <SocieteDocumentDialog
        doc={logoFacture ? { ...logoFacture, numero: libelleNumero(logoFacture) } : null}
        onClose={() => setLogoFacture(null)}
        table="factures_client"
        type="FAC"
        onApply={({ marque }) => {
          const f = logoFacture;
          if (f) updateFacturesClient(prev => prev.map(x => x.id === f.id ? { ...x, marque } : x));
        }}
      />

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
              La proforma <strong>{convertTarget?.numero}</strong> deviendra une facture brouillon. Elle recevra son numéro FAC-… à l'émission.
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
