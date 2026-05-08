import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useCRM } from '@/lib/StoreContext';
import { generateId, formatMontant, calculerTotalDevis, formatDate, type Client, type AdresseLivraison, type Contact } from '@/lib/store';
import { Plus, Search, Edit2, Trash2, MapPin, ChevronDown, ChevronUp, Upload, Download, Filter, ArrowLeft, FileText, UserPlus, X, Mail, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { exportToExcel } from '@/lib/exportExcel';
import EmailToContactDialog, { type ExtractedContact } from '@/components/EmailToContactDialog';

const emptyClient: Omit<Client, 'id' | 'dateCreation'> = {
  nom: '', email: '', telephone: '', telephoneMobile: '', adresse: '', ville: '', codePostal: '', societe: '', notes: '', adressesLivraison: [], estRevendeur: false, remisesParCategorie: {}, contacts: []
};

// Dérive le nom/email/tel du client depuis le premier contact (contact principal)
function deriveFromContacts(form: Omit<Client, 'id' | 'dateCreation'>) {
  const primary = (form.contacts || [])[0];
  return {
    nom: primary ? [primary.prenom, primary.nom].filter(Boolean).join(' ') : (form.societe || form.nom),
    email: primary?.email || form.email || '',
    telephone: primary?.telephone || form.telephone || '',
  };
}

const emptyAdresse: Omit<AdresseLivraison, 'id'> = {
  libelle: '', adresse: '', ville: '', codePostal: '', contact: '', telephone: '', parDefaut: false, type: 'livraison'
};

const importFields: { key: string; label: string; aliases: string[]; type: 'text' }[] = [
  { key: 'nom', label: 'Nom', aliases: ['nom', 'name', 'contact', 'nom contact', 'nom client'], type: 'text' },
  { key: 'societe', label: 'Société', aliases: ['société', 'societe', 'entreprise', 'company', 'raison sociale'], type: 'text' },
  { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'mail', 'courriel'], type: 'text' },
  { key: 'telephone', label: 'Téléphone', aliases: ['téléphone', 'telephone', 'tel', 'tél', 'phone', 'portable', 'mobile'], type: 'text' },
  { key: 'adresse', label: 'Adresse', aliases: ['adresse', 'address', 'rue'], type: 'text' },
  { key: 'ville', label: 'Ville', aliases: ['ville', 'city'], type: 'text' },
  { key: 'codePostal', label: 'Code postal', aliases: ['code postal', 'codepostal', 'cp', 'zip', 'postal'], type: 'text' },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'commentaire', 'remarques', 'observation'], type: 'text' },
];

function autoDetectMapping(excelCols: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const field of importFields) {
    for (const alias of field.aliases) {
      const match = excelCols.find(col => col.trim().toLowerCase() === alias.toLowerCase());
      if (match && !Object.values(mapping).includes(match)) {
        mapping[field.key] = match;
        break;
      }
    }
  }
  return mapping;
}

export default function Clients() {
  const { clients, updateClients, produits, devis, commandesClient } = useCRM();

  // Calculate encours dû per client (commandes facturées non payées)
  const encoursDuParClient = useMemo(() => {
    const map: Record<string, { montant: number; echeances: { montant: number; date: string }[] }> = {};
    commandesClient.forEach(cc => {
      if (cc.statut === 'facture') {
        if (!map[cc.clientId]) map[cc.clientId] = { montant: 0, echeances: [] };
        map[cc.clientId].montant += cc.totalTTC;
        if (cc.dateEcheance) {
          map[cc.clientId].echeances.push({ montant: cc.totalTTC, date: cc.dateEcheance });
        }
      }
    });
    return map;
  }, [commandesClient]);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const returnDevisId = searchParams.get('returnDevis');
  
  // Extract unique categories from products
  const categories = useMemo(() => {
    const cats = new Set<string>();
    produits.forEach(p => { if (p.categorie) cats.add(p.categorie); });
    return Array.from(cats).sort();
  }, [produits]);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [filterVille, setFilterVille] = useState('');
  const [filterDepartement, setFilterDepartement] = useState('');
  const [filterSociete, setFilterSociete] = useState('');
  const [filterContact, setFilterContact] = useState('');
  const [filterRevendeur, setFilterRevendeur] = useState<'' | 'oui' | 'non'>('');
  const [filterHasAdresse, setFilterHasAdresse] = useState<'' | 'oui' | 'non'>('');
  const [showFilters, setShowFilters] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyClient);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [adresseForm, setAdresseForm] = useState(emptyAdresse);
  const [editingAdresse, setEditingAdresse] = useState<string | null>(null);
  const [showAdresseForm, setShowAdresseForm] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});
  const [importSelectedCols, setImportSelectedCols] = useState<Set<string>>(new Set());
  const [importMode, setImportMode] = useState<'add' | 'update'>('add');
  const [importMatchKey, setImportMatchKey] = useState<'nom' | 'societe'>('nom');
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [sortCol, setSortCol] = useState<'societe' | 'ville' | 'adresses' | 'devis' | 'encours' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const villes = useMemo(() => Array.from(new Set(clients.map(c => c.ville).filter(Boolean))).sort(), [clients]);
  const departements = useMemo(() => Array.from(new Set(clients.map(c => c.codePostal?.substring(0, 2)).filter(Boolean))).sort(), [clients]);
  const societes = useMemo(() => Array.from(new Set(clients.map(c => c.societe).filter(Boolean))).sort() as string[], [clients]);

  const activeFilterCount = (filterVille ? 1 : 0) + (filterDepartement ? 1 : 0) + (filterSociete ? 1 : 0) + (filterContact ? 1 : 0) + (filterRevendeur ? 1 : 0) + (filterHasAdresse ? 1 : 0);

  const filtered = useMemo(() => {
    return clients.filter(c => {
      if (search) {
        const s = search.toLowerCase();
        const inBase = [c.nom, c.email, c.societe, c.telephone, c.ville].some(v => v?.toLowerCase().includes(s));
        const inContacts = (c.contacts || []).some(ct => [ct.nom, ct.prenom, ct.email, ct.telephone, ct.fonction].some(v => v?.toLowerCase().includes(s)));
        if (!inBase && !inContacts) return false;
      }
      if (filterVille && c.ville !== filterVille) return false;
      if (filterDepartement && !c.codePostal?.startsWith(filterDepartement)) return false;
      if (filterSociete && c.societe !== filterSociete) return false;
      if (filterContact.trim()) {
        const fc = filterContact.trim().toLowerCase();
        const inContacts = (c.contacts || []).some(ct =>
          [ct.nom, ct.prenom, ct.email, ct.telephone, ct.telephoneMobile, ct.fonction].some(v => v?.toLowerCase().includes(fc))
        );
        const inLegacy = [c.nom, c.email, c.telephone].some(v => v?.toLowerCase().includes(fc));
        if (!inContacts && !inLegacy) return false;
      }
      if (filterRevendeur === 'oui' && !c.estRevendeur) return false;
      if (filterRevendeur === 'non' && c.estRevendeur) return false;
      if (filterHasAdresse === 'oui' && (!c.adressesLivraison || c.adressesLivraison.length === 0)) return false;
      if (filterHasAdresse === 'non' && c.adressesLivraison && c.adressesLivraison.length > 0) return false;
      return true;
    });
  }, [clients, search, filterVille, filterDepartement, filterSociete, filterRevendeur, filterHasAdresse]);

  const sortedFiltered = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortCol === 'societe') { va = (a.societe || a.nom).toLowerCase(); vb = (b.societe || b.nom).toLowerCase(); }
      else if (sortCol === 'ville') { va = (a.ville || '').toLowerCase(); vb = (b.ville || '').toLowerCase(); }
      else if (sortCol === 'adresses') { va = a.adressesLivraison?.length || 0; vb = b.adressesLivraison?.length || 0; }
      else if (sortCol === 'devis') { va = devis.filter(d => d.clientId === a.id).length; vb = devis.filter(d => d.clientId === b.id).length; }
      else if (sortCol === 'encours') { va = encoursDuParClient[a.id]?.montant || 0; vb = encoursDuParClient[b.id]?.montant || 0; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortCol, sortDir, devis, encoursDuParClient]);

  function openNew() {
    setEditingClient(null);
    setForm(emptyClient);
    setDialogOpen(true);
  }

  function handleEmailExtracted(contact: ExtractedContact) {
    setEditingClient(null);
    setForm({
      ...emptyClient,
      nom: contact.nom,
      email: contact.email,
      telephone: contact.telephone,
      telephoneMobile: contact.telephoneMobile,
      adresse: contact.adresse,
      ville: contact.ville,
      codePostal: contact.codePostal,
      societe: contact.societe,
      notes: contact.notes,
    });
    setDialogOpen(true);
  }

  function openEdit(c: Client) {
    setEditingClient(c);
    // Migration automatique : si pas de contacts[] mais des champs legacy (nom/email/tel), créer le contact principal
    let contacts = c.contacts && c.contacts.length > 0 ? c.contacts : [];
    if (contacts.length === 0 && (c.nom || c.email || c.telephone)) {
      contacts = [{ id: generateId(), nom: c.nom || '', prenom: '', email: c.email || '', telephone: c.telephone || '', telephoneMobile: c.telephoneMobile || '', fonction: '' }];
    }
    setForm({ nom: c.nom, email: c.email, telephone: c.telephone, telephoneMobile: c.telephoneMobile || '', adresse: c.adresse, ville: c.ville, codePostal: c.codePostal, societe: c.societe || '', notes: c.notes || '', adressesLivraison: c.adressesLivraison || [], estRevendeur: c.estRevendeur || false, remisesParCategorie: c.remisesParCategorie || {}, contacts });
    setDialogOpen(true);
  }

  function save() {
    if (!form.societe?.trim()) { toast.error('La société est requise'); return; }
    const derived = deriveFromContacts(form);
    const toSave = { ...form, ...derived };
    if (editingClient) {
      updateClients(prev => prev.map(c => c.id === editingClient.id ? { ...c, ...toSave } : c));
      toast.success('Client modifié');
    } else {
      updateClients(prev => [...prev, { ...toSave, id: generateId(), dateCreation: new Date().toISOString().split('T')[0] }]);
      toast.success('Client ajouté');
    }
    setDialogOpen(false);
  }

  // Auto-save client en temps réel
  const autoSaveClientRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!editingClient || !dialogOpen) return;
    clearTimeout(autoSaveClientRef.current);
    autoSaveClientRef.current = setTimeout(() => {
      if (form.societe?.trim()) {
        const derived = deriveFromContacts(form);
        updateClients(prev => prev.map(c => c.id === editingClient.id ? { ...c, ...form, ...derived } : c));
      }
    }, 500);
    return () => clearTimeout(autoSaveClientRef.current);
  }, [form, editingClient, dialogOpen]);

  function confirmRemove(id: string) {
    setDeleteTargetId(id);
    setDeleteConfirmOpen(true);
  }

  function executeDelete() {
    if (deleteTargetId) {
      updateClients(prev => prev.filter(c => c.id !== deleteTargetId));
      toast.success('Client supprimé');
    }
    setDeleteConfirmOpen(false);
    setDeleteTargetId(null);
  }

  function addOrUpdateAdresse() {
    if (!adresseForm.libelle.trim() || !adresseForm.adresse.trim()) {
      toast.error('Libellé et adresse requis');
      return;
    }
    let newAdresses = [...form.adressesLivraison];
    if (adresseForm.parDefaut) {
      newAdresses = newAdresses.map(a => ({ ...a, parDefaut: false }));
    }
    if (editingAdresse) {
      newAdresses = newAdresses.map(a => a.id === editingAdresse ? { ...adresseForm, id: editingAdresse } : a);
    } else {
      if (newAdresses.length === 0) adresseForm.parDefaut = true;
      newAdresses.push({ ...adresseForm, id: generateId() });
    }
    setForm(prev => ({ ...prev, adressesLivraison: newAdresses }));
    setAdresseForm(emptyAdresse);
    setEditingAdresse(null);
    setShowAdresseForm(false);
  }

  function removeAdresse(id: string) {
    const newAdresses = form.adressesLivraison.filter(a => a.id !== id);
    if (newAdresses.length > 0 && !newAdresses.some(a => a.parDefaut)) {
      newAdresses[0].parDefaut = true;
    }
    setForm(prev => ({ ...prev, adressesLivraison: newAdresses }));
  }

  function editAdresse(a: AdresseLivraison) {
    setAdresseForm({ libelle: a.libelle, adresse: a.adresse, ville: a.ville, codePostal: a.codePostal, contact: a.contact || '', telephone: a.telephone || '', parDefaut: a.parDefaut, type: a.type || 'livraison' });
    setEditingAdresse(a.id);
    setShowAdresseForm(true);
  }

  const excelColumns = useMemo(() => {
    if (!importPreview || importPreview.length === 0) return [];
    return Object.keys(importPreview[0]);
  }, [importPreview]);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet);
        if (json.length === 0) { toast.error('Fichier vide'); return; }
        setImportPreview(json);
        const cols = Object.keys(json[0] as object);
        const detected = autoDetectMapping(cols);
        setImportMapping(detected);
        setImportSelectedCols(new Set(Object.keys(detected)));
        setImportDialogOpen(true);
      } catch { toast.error('Erreur de lecture du fichier'); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function getMappedValue(row: any, fieldKey: string): string {
    const colName = importMapping[fieldKey];
    if (!colName) return '';
    const val = row[colName];
    if (val === undefined || val === null) return '';
    return String(val).trim();
  }

  function importClients() {
    if (!importPreview) return;
    const selectedFields = importFields.filter(f => importSelectedCols.has(f.key));

    if (importMode === 'update') {
      let updated = 0;
      updateClients(prev => prev.map(c => {
        const matchingRow = importPreview.find(row => {
          const val = getMappedValue(row, importMatchKey);
          const clientVal = importMatchKey === 'nom' ? c.nom : (c.societe || '');
          return val.toLowerCase() === clientVal.trim().toLowerCase();
        });
        if (!matchingRow) return c;

        const updates: Record<string, any> = {};
        for (const field of selectedFields) {
          if (field.key === importMatchKey) continue;
          const val = getMappedValue(matchingRow, field.key);
          if (val) updates[field.key] = val;
        }
        if (Object.keys(updates).length > 0) {
          updated++;
          return { ...c, ...updates };
        }
        return c;
      }));
      toast.success(`${updated} client(s) mis à jour`);
    } else {
      const mapped: Client[] = importPreview.map((row: any) => ({
        id: generateId(),
        nom: getMappedValue(row, 'nom'),
        societe: getMappedValue(row, 'societe'),
        email: getMappedValue(row, 'email'),
        telephone: getMappedValue(row, 'telephone'),
        adresse: getMappedValue(row, 'adresse'),
        ville: getMappedValue(row, 'ville'),
        codePostal: getMappedValue(row, 'codePostal'),
        notes: getMappedValue(row, 'notes'),
        adressesLivraison: [],
        dateCreation: new Date().toISOString().split('T')[0],
      })).filter(c => c.nom || c.societe);

      const existingKeys = new Set(clients.map(c => (importMatchKey === 'nom' ? c.nom : (c.societe || '')).trim().toLowerCase()));
      const unique = mapped.filter(c => {
        const key = (importMatchKey === 'nom' ? c.nom : (c.societe || '')).trim().toLowerCase();
        if (!key || existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });
      const skipped = mapped.length - unique.length;

      updateClients(prev => [...prev, ...unique]);
      toast.success(`${unique.length} client(s) importé(s)${skipped > 0 ? `, ${skipped} doublon(s) ignoré(s)` : ''}`);
    }

    setImportDialogOpen(false);
    setImportPreview(null);
  }

  return (
    <div className="space-y-4">
      {returnDevisId && (
        <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-lg px-4 py-3">
          <Button variant="outline" size="sm" onClick={() => navigate(`/devis?editDevis=${returnDevisId}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Retour au devis
          </Button>
          <span className="text-sm text-muted-foreground">Vous consultez la fiche client depuis l'édition d'un devis</span>
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="relative">
            <Filter className="w-4 h-4 mr-2" /> Filtres
            {activeFilterCount > 0 && (
              <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">{activeFilterCount}</Badge>
            )}
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4 mr-2" /> Importer</Button>
          <Button variant="outline" onClick={() => exportToExcel(clients.map(c => ({ Nom: c.nom, Société: c.societe || '', Email: c.email, Téléphone: c.telephone, Adresse: c.adresse, Ville: c.ville, 'Code postal': c.codePostal, Notes: c.notes || '', Revendeur: c.estRevendeur ? 'Oui' : 'Non' })), 'clients', 'Clients')}><Download className="w-4 h-4 mr-2" /> Exporter</Button>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Nouveau client</Button>
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-3 items-center bg-muted/30 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Département :</Label>
            <select className="text-sm rounded border border-input bg-background px-2 py-1.5" value={filterDepartement} onChange={e => setFilterDepartement(e.target.value)}>
              <option value="">Tous</option>
              {departements.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Ville :</Label>
            <select className="text-sm rounded border border-input bg-background px-2 py-1.5" value={filterVille} onChange={e => setFilterVille(e.target.value)}>
              <option value="">Toutes</option>
              {villes.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Société :</Label>
            <select className="text-sm rounded border border-input bg-background px-2 py-1.5" value={filterSociete} onChange={e => setFilterSociete(e.target.value)}>
              <option value="">Toutes</option>
              {societes.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Contact :</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={filterContact}
                onChange={e => setFilterContact(e.target.value)}
                placeholder="Nom, email, tél..."
                className="text-sm rounded border border-input bg-background pl-6 pr-6 py-1.5 w-44 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {filterContact && (
                <button onClick={() => setFilterContact('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-base leading-none">×</button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Revendeur :</Label>
            <select className="text-sm rounded border border-input bg-background px-2 py-1.5" value={filterRevendeur} onChange={e => setFilterRevendeur(e.target.value as '' | 'oui' | 'non')}>
              <option value="">Tous</option>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Adresses :</Label>
            <select className="text-sm rounded border border-input bg-background px-2 py-1.5" value={filterHasAdresse} onChange={e => setFilterHasAdresse(e.target.value as '' | 'oui' | 'non')}>
              <option value="">Tous</option>
              <option value="oui">Avec adresses</option>
              <option value="non">Sans adresses</option>
            </select>
          </div>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterVille(''); setFilterDepartement(''); setFilterSociete(''); setFilterContact(''); setFilterRevendeur(''); setFilterHasAdresse(''); }}>
              Réinitialiser
            </Button>
          )}
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {([
                { col: 'societe', label: 'Société', align: 'left' },
                { col: null, label: 'Contacts', align: 'left' },
                { col: 'ville', label: 'Ville', align: 'left' },
                { col: 'adresses', label: 'Adresses liv.', align: 'left' },
                { col: 'devis', label: 'Devis', align: 'left' },
                { col: 'encours', label: 'Encours dû', align: 'right' },
              ] as const).map(({ col, label, align }) => (
                <th key={label} className={`px-4 py-3 font-medium text-muted-foreground text-${align}${col ? ' cursor-pointer select-none hover:text-foreground' : ''}`}
                  onClick={col ? () => toggleSort(col) : undefined}>
                  <span className="inline-flex items-center gap-1">
                    {label}
                    {col && (
                      sortCol === col
                        ? (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-primary" /> : <ChevronDown className="w-3.5 h-3.5 text-primary" />)
                        : <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />
                    )}
                  </span>
                </th>
              ))}
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {sortedFiltered.map(c => {
              const contacts = c.contacts || [];
              const primary = contacts[0];
              return (
                <>
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => openEdit(c)}>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{c.societe || c.nom}</p>
                      {c.adresse && <p className="text-xs text-muted-foreground">{c.adresse}</p>}
                      {c.estRevendeur && <Badge variant="secondary" className="mt-0.5 text-[10px] px-1.5 py-0">Revendeur</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      {contacts.length > 0 ? (
                        <div className="space-y-0.5">
                          {contacts.slice(0, 2).map((ct, i) => (
                            <div key={ct.id} className="text-xs">
                              <span className="font-medium">{[ct.prenom, ct.nom].filter(Boolean).join(' ')}</span>
                              {ct.fonction && <span className="text-muted-foreground"> · {ct.fonction}</span>}
                              {i === 0 && ct.email && <span className="text-muted-foreground block">{ct.email}</span>}
                              {i === 0 && (ct.telephone || ct.telephoneMobile) && <span className="text-muted-foreground block">{ct.telephone || ct.telephoneMobile}</span>}
                            </div>
                          ))}
                          {contacts.length > 2 && <span className="text-xs text-muted-foreground">+{contacts.length - 2} autre{contacts.length - 2 > 1 ? 's' : ''}</span>}
                        </div>
                      ) : (c.nom || c.email || c.telephone) ? (
                        <div className="text-xs space-y-0.5">
                          {c.nom && <p className="font-medium">{c.nom}</p>}
                          {c.email && <p className="text-muted-foreground">{c.email}</p>}
                          {c.telephone && <p className="text-muted-foreground">{c.telephone}</p>}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {c.ville && <p>{c.ville}</p>}
                      {c.codePostal && <p className="text-muted-foreground/70">{c.codePostal}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {(c.adressesLivraison?.length || 0) > 0 ? (
                        <button onClick={e => { e.stopPropagation(); setExpandedClient(expandedClient === c.id ? null : c.id); }} className="flex items-center gap-1 text-primary hover:underline text-xs">
                          <MapPin className="w-3 h-3" />
                          {c.adressesLivraison.length} adresse{c.adressesLivraison.length > 1 ? 's' : ''}
                          {expandedClient === c.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const clientDevis = devis.filter(d => d.clientId === c.id);
                        if (clientDevis.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
                        return (
                          <button onClick={e => { e.stopPropagation(); navigate(`/devis?search=${encodeURIComponent(c.societe || c.nom)}`); }} className="flex items-center gap-1 text-primary hover:underline text-xs">
                            <FileText className="w-3 h-3" />{clientDevis.length} devis
                          </button>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(() => {
                        const encours = encoursDuParClient[c.id];
                        const montantDu = encours?.montant || 0;
                        const echeancesDepassees = encours?.echeances.filter(e => new Date(e.date) < new Date()) || [];
                        const montantDepasse = echeancesDepassees.reduce((s, e) => s + e.montant, 0);
                        if (montantDu === 0) return <span className="text-muted-foreground text-xs">—</span>;
                        return (
                          <div>
                            <span className="font-medium text-xs">{formatMontant(montantDu)}</span>
                            {montantDepasse > 0 && <div className="text-xs text-destructive font-medium">{formatMontant(montantDepasse)} échu</div>}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={e => { e.stopPropagation(); openEdit(c); }} className="p-1.5 rounded-md hover:bg-muted"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={e => { e.stopPropagation(); confirmRemove(c.id); }} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                  {expandedClient === c.id && (c.adressesLivraison?.length || 0) > 0 && (
                    <tr key={`${c.id}-addr`}>
                      <td colSpan={7} className="px-4 py-2 bg-muted/20">
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {c.adressesLivraison.map(a => (
                            <div key={a.id} className="bg-card rounded-lg border border-border p-3 text-xs space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{a.libelle}</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{a.type === 'facturation' ? 'Facturation' : 'Livraison'}</Badge>
                                {a.parDefaut && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Par défaut</Badge>}
                              </div>
                              <p className="text-muted-foreground">{a.adresse}</p>
                              <p className="text-muted-foreground">{a.codePostal} {a.ville}</p>
                              {a.contact && <p className="text-muted-foreground">Contact : {a.contact}</p>}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center py-8 text-muted-foreground">Aucun client trouvé</p>}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered.map(c => (
          <div key={c.id} className="bg-card rounded-xl border border-border p-4 cursor-pointer" onClick={() => openEdit(c)}>
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold">{c.societe || c.nom}</p>
                {c.ville && <p className="text-xs text-muted-foreground">{c.codePostal} {c.ville}</p>}
                {c.estRevendeur && <Badge variant="secondary" className="mt-0.5 text-[10px] px-1.5 py-0">Revendeur</Badge>}
              </div>
              <div className="flex gap-1">
                <button onClick={e => { e.stopPropagation(); openEdit(c); }} className="p-1.5 rounded-md hover:bg-muted"><Edit2 className="w-4 h-4" /></button>
                <button onClick={e => { e.stopPropagation(); confirmRemove(c.id); }} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            {(c.contacts || []).length > 0 ? (
              <div className="mt-2 space-y-1">
                {(c.contacts || []).slice(0, 2).map((ct, i) => (
                  <div key={ct.id} className="text-xs border-l-2 border-border pl-2 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground">{[ct.prenom, ct.nom].filter(Boolean).join(' ')}</span>
                      {ct.fonction && <span className="text-muted-foreground">· {ct.fonction}</span>}
                    </div>
                    {i === 0 && ct.email && <p className="text-muted-foreground">{ct.email}</p>}
                    {i === 0 && (ct.telephone || ct.telephoneMobile) && <p className="text-muted-foreground">{ct.telephone || ct.telephoneMobile}</p>}
                  </div>
                ))}
                {(c.contacts || []).length > 2 && <p className="text-xs text-muted-foreground pl-2">+{(c.contacts || []).length - 2} autre{(c.contacts || []).length > 3 ? 's' : ''}</p>}
              </div>
            ) : (c.nom || c.email || c.telephone) ? (
              <div className="mt-2 text-xs border-l-2 border-border pl-2 space-y-0.5">
                {c.nom && <p className="font-medium text-foreground">{c.nom}</p>}
                {c.email && <p className="text-muted-foreground">{c.email}</p>}
                {(c.telephone || c.telephoneMobile) && <p className="text-muted-foreground">{c.telephone || c.telephoneMobile}</p>}
              </div>
            ) : null}
            {(c.adressesLivraison?.length || 0) > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setExpandedClient(expandedClient === c.id ? null : c.id)}
                  className="flex items-center gap-1 text-primary text-xs"
                >
                  <MapPin className="w-3 h-3" />
                  {c.adressesLivraison.length} adresse{c.adressesLivraison.length > 1 ? 's' : ''}
                  {expandedClient === c.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {expandedClient === c.id && (
                  <div className="mt-2 space-y-2">
                    {c.adressesLivraison.map(a => (
                      <div key={a.id} className="bg-muted/30 rounded-lg p-3 text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{a.libelle}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{a.type === 'facturation' ? 'Facturation' : 'Livraison'}</Badge>
                          {a.parDefaut && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Par défaut</Badge>}
                        </div>
                        <p className="text-muted-foreground">{a.adresse}, {a.codePostal} {a.ville}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center py-8 text-muted-foreground">Aucun client trouvé</p>}
      </div>

      <EmailToContactDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        type="client"
        onExtracted={handleEmailExtracted}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer ce client ? Cette action ne peut pas être annulée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setShowAdresseForm(false); setEditingAdresse(null); } }}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClient ? 'Modifier le client' : 'Nouveau client'}</DialogTitle>
          </DialogHeader>
          {!editingClient && (
            <Button variant="outline" className="w-full border-dashed text-muted-foreground hover:text-foreground" onClick={() => setEmailDialogOpen(true)}>
              <Mail className="w-4 h-4 mr-2" /> Remplir depuis un email
            </Button>
          )}
          <div className="grid gap-4 py-2">
            {/* Société — identifiant principal */}
            <div>
              <Label>Société *</Label>
              <Input
                type="text"
                value={form.societe}
                onChange={e => setForm(prev => ({ ...prev, societe: e.target.value }))}
                placeholder="Nom de la société"
                autoFocus
              />
            </div>

            {/* Adresse de facturation */}
            <div className="border-t border-border pt-3 space-y-2">
              <Label className="text-sm font-semibold text-muted-foreground">Adresse de facturation</Label>
              <div>
                <Label className="text-xs">Adresse</Label>
                <Input type="text" value={form.adresse} onChange={e => setForm(prev => ({ ...prev, adresse: e.target.value }))} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Ville</Label>
                  <Input type="text" value={form.ville} onChange={e => setForm(prev => ({ ...prev, ville: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Code postal</Label>
                  <Input type="text" value={form.codePostal} onChange={e => setForm(prev => ({ ...prev, codePostal: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label>Notes</Label>
              <textarea
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                rows={3}
                value={form.notes}
                onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            {/* Catégorie Revendeur */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-3 mb-3">
                <Checkbox
                  id="estRevendeur"
                  checked={form.estRevendeur || false}
                  onCheckedChange={(checked) => {
                    const isRevendeur = checked === true;
                    setForm(prev => ({
                      ...prev,
                      estRevendeur: isRevendeur,
                      remisesParCategorie: isRevendeur && Object.keys(prev.remisesParCategorie || {}).length === 0
                        ? categories.reduce((acc, cat) => ({ ...acc, [cat]: 30 }), {} as Record<string, number>)
                        : prev.remisesParCategorie || {},
                    }));
                  }}
                />
                <Label htmlFor="estRevendeur" className="text-base font-semibold cursor-pointer">
                  Client revendeur
                </Label>
                {form.estRevendeur && (
                  <Badge variant="secondary" className="text-xs">Remise auto 30%</Badge>
                )}
              </div>
              {form.estRevendeur && (
                <div className="bg-muted/30 rounded-lg border border-border p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Remise par catégorie de produit (%) — modifiable individuellement :</p>
                  {categories.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {categories.map(cat => (
                        <div key={cat} className="flex items-center gap-2">
                          <Label className="text-xs min-w-[100px] truncate" title={cat}>{cat}</Label>
                          <Input
                            type="number"
                            step="1"
                            min="0"
                            max="100"
                            className="h-7 text-xs w-20"
                            value={form.remisesParCategorie?.[cat] ?? 30}
                            onChange={e => setForm(prev => ({
                              ...prev,
                              remisesParCategorie: {
                                ...prev.remisesParCategorie,
                                [cat]: parseFloat(e.target.value) || 0,
                              },
                            }))}
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Aucune catégorie de produit définie. Ajoutez des catégories aux produits pour configurer les remises.</p>
                  )}
                </div>
              )}
            </div>

            {/* Contacts */}
            <div className="border-t border-border pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold flex items-center gap-2"><UserPlus className="w-4 h-4" /> Contacts</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setForm(prev => ({ ...prev, contacts: [...(prev.contacts || []), { id: generateId(), nom: '', prenom: '', email: '', telephone: '', telephoneMobile: '', fonction: '' }] }))}>
                  <UserPlus className="w-3.5 h-3.5 mr-1" /> Ajouter
                </Button>
              </div>
              {(form.contacts || []).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">Aucun contact — cliquez sur Ajouter</p>
              )}
              {(form.contacts || []).map((ct, idx) => (
                <div key={ct.id} className="rounded-lg border border-border p-3 space-y-2 bg-muted/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {idx === 0 ? 'Contact principal' : `Contact ${idx + 1}`}
                    </span>
                    <button type="button" onClick={() => setForm(prev => ({ ...prev, contacts: (prev.contacts || []).filter(c => c.id !== ct.id) }))} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Prénom</Label>
                      <Input className="h-8 text-sm" value={ct.prenom || ''} onChange={e => setForm(prev => ({ ...prev, contacts: (prev.contacts || []).map(c => c.id === ct.id ? { ...c, prenom: e.target.value } : c) }))} placeholder="Prénom" />
                    </div>
                    <div>
                      <Label className="text-xs">Nom</Label>
                      <Input className="h-8 text-sm" value={ct.nom} onChange={e => setForm(prev => ({ ...prev, contacts: (prev.contacts || []).map(c => c.id === ct.id ? { ...c, nom: e.target.value } : c) }))} placeholder="Nom" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Fonction</Label>
                      <Input className="h-8 text-sm" value={ct.fonction || ''} onChange={e => setForm(prev => ({ ...prev, contacts: (prev.contacts || []).map(c => c.id === ct.id ? { ...c, fonction: e.target.value } : c) }))} placeholder="Ex: Directeur, Acheteur..." />
                    </div>
                    <div>
                      <Label className="text-xs">Email</Label>
                      <Input className="h-8 text-sm" type="email" value={ct.email || ''} onChange={e => setForm(prev => ({ ...prev, contacts: (prev.contacts || []).map(c => c.id === ct.id ? { ...c, email: e.target.value } : c) }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Tél. fixe</Label>
                      <Input className="h-8 text-sm" type="tel" value={ct.telephone || ''} onChange={e => setForm(prev => ({ ...prev, contacts: (prev.contacts || []).map(c => c.id === ct.id ? { ...c, telephone: e.target.value } : c) }))} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Tél. mobile</Label>
                      <Input className="h-8 text-sm" type="tel" value={ct.telephoneMobile || ''} onChange={e => setForm(prev => ({ ...prev, contacts: (prev.contacts || []).map(c => c.id === ct.id ? { ...c, telephoneMobile: e.target.value } : c) }))} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Adresses de livraison
                </Label>
                <Button type="button" variant="outline" size="sm" onClick={() => { setAdresseForm({ ...emptyAdresse, adresse: form.adresse, ville: form.ville, codePostal: form.codePostal }); setEditingAdresse(null); setShowAdresseForm(true); }}>
                  <Plus className="w-3 h-3 mr-1" /> Ajouter
                </Button>
              </div>

              {form.adressesLivraison.length > 0 && (
                <div className="space-y-2 mb-3">
                  {form.adressesLivraison.map(a => (
                    <div key={a.id} className="flex items-start justify-between bg-muted/30 rounded-lg p-3 text-sm">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{a.libelle}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{a.type === 'facturation' ? 'Facturation' : 'Livraison'}</Badge>
                          {a.parDefaut && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Par défaut</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{a.adresse}, {a.codePostal} {a.ville}</p>
                        {a.contact && <p className="text-xs text-muted-foreground">Contact: {a.contact} {a.telephone ? `· ${a.telephone}` : ''}</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button type="button" onClick={() => editAdresse(a)} className="p-1 rounded hover:bg-muted"><Edit2 className="w-3 h-3" /></button>
                        <button type="button" onClick={() => removeAdresse(a.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showAdresseForm && (
                <div className="bg-muted/20 rounded-lg border border-border p-3 space-y-3">
                  <p className="text-sm font-medium">{editingAdresse ? 'Modifier l\'adresse' : 'Nouvelle adresse'}</p>
                  {adresseForm.type === 'livraison' && (
                    <div className="flex items-center gap-2 mb-1">
                      <input
                        type="checkbox"
                        id="copieFacturation"
                        className="rounded"
                        onChange={e => {
                          if (e.target.checked) {
                            setAdresseForm(p => ({ ...p, adresse: form.adresse, ville: form.ville, codePostal: form.codePostal }));
                          }
                        }}
                      />
                      <label htmlFor="copieFacturation" className="text-xs text-muted-foreground">Identique à l'adresse de facturation</label>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <Label className="text-xs">Libellé *</Label>
                      <Input placeholder="Ex: Entrepôt, Chantier A..." value={adresseForm.libelle} onChange={e => setAdresseForm(p => ({ ...p, libelle: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Adresse *</Label>
                      <Input value={adresseForm.adresse} onChange={e => setAdresseForm(p => ({ ...p, adresse: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Ville</Label>
                      <Input value={adresseForm.ville} onChange={e => setAdresseForm(p => ({ ...p, ville: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Code postal</Label>
                      <Input value={adresseForm.codePostal} onChange={e => setAdresseForm(p => ({ ...p, codePostal: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Contact</Label>
                      <Input value={adresseForm.contact} onChange={e => setAdresseForm(p => ({ ...p, contact: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Téléphone</Label>
                      <Input value={adresseForm.telephone} onChange={e => setAdresseForm(p => ({ ...p, telephone: e.target.value }))} />
                    </div>
                    <div className="col-span-2 flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Type :</Label>
                        <select
                          className="text-xs rounded border border-input bg-background px-2 py-1"
                          value={adresseForm.type}
                          onChange={e => setAdresseForm(p => ({ ...p, type: e.target.value as 'livraison' | 'facturation' }))}
                        >
                          <option value="livraison">Livraison</option>
                          <option value="facturation">Facturation</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id="parDefaut" checked={adresseForm.parDefaut} onChange={e => setAdresseForm(p => ({ ...p, parDefaut: e.target.checked }))} className="rounded" />
                        <label htmlFor="parDefaut" className="text-xs">Adresse par défaut</label>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setShowAdresseForm(false); setEditingAdresse(null); }}>Annuler</Button>
                    <Button type="button" size="sm" onClick={addOrUpdateAdresse}>{editingAdresse ? 'Modifier' : 'Ajouter'}</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={save}>{editingClient ? 'Modifier' : 'Ajouter'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Aperçu de l'import clients</DialogTitle></DialogHeader>
          {importPreview && (
            <>
              {/* Mode selection */}
              <div className="flex gap-2 mb-2">
                <Button variant={importMode === 'add' ? 'default' : 'outline'} size="sm" onClick={() => setImportMode('add')}>
                  Ajouter (nouveaux)
                </Button>
                <Button variant={importMode === 'update' ? 'default' : 'outline'} size="sm" onClick={() => setImportMode('update')}>
                  Mettre à jour (existants)
                </Button>
              </div>

              {/* Match key selector */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-muted-foreground">Correspondance par :</span>
                <Button variant={importMatchKey === 'nom' ? 'default' : 'outline'} size="sm" onClick={() => setImportMatchKey('nom')}>Nom</Button>
                <Button variant={importMatchKey === 'societe' ? 'default' : 'outline'} size="sm" onClick={() => setImportMatchKey('societe')}>Société</Button>
              </div>

              {importMode === 'update' && (
                <p className="text-xs text-muted-foreground">
                  Les clients seront mis à jour par correspondance sur <strong>{importMatchKey === 'nom' ? 'le nom' : 'la société'}</strong>. Sélectionnez les colonnes à mettre à jour :
                </p>
              )}

              {/* Column mapping */}
              <div className="border border-border rounded-lg p-3 bg-muted/30 space-y-2">
                <p className="text-xs font-semibold">Correspondance des colonnes :</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {importFields.map(f => (
                    <div key={f.key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="rounded border-input shrink-0"
                        checked={importSelectedCols.has(f.key)}
                        onChange={e => {
                          const next = new Set(importSelectedCols);
                          e.target.checked ? next.add(f.key) : next.delete(f.key);
                          setImportSelectedCols(next);
                        }}
                      />
                      <Label className="text-xs w-24 shrink-0">{f.label}</Label>
                      <select
                        className="flex-1 text-xs rounded border border-input bg-background px-2 py-1"
                        value={importMapping[f.key] || ''}
                        onChange={e => setImportMapping(prev => ({ ...prev, [f.key]: e.target.value }))}
                      >
                        <option value="">— Non mappé —</option>
                        {excelColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="overflow-x-auto max-h-60">
                <table className="w-full text-xs border">
                  <thead>
                    <tr className="bg-muted/50">
                      {importFields.filter(f => importSelectedCols.has(f.key) && importMapping[f.key]).map(f => (
                        <th key={f.key} className="px-2 py-1 text-left border-b font-medium">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b">
                        {importFields.filter(f => importSelectedCols.has(f.key) && importMapping[f.key]).map(f => (
                          <td key={f.key} className="px-2 py-1">{getMappedValue(row, f.key)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importPreview.length > 10 && <p className="text-xs text-muted-foreground mt-1">... et {importPreview.length - 10} autres lignes</p>}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setImportDialogOpen(false); setImportPreview(null); }}>Annuler</Button>
                <Button onClick={importClients}>
                  {importMode === 'update' ? `Mettre à jour` : `Importer ${importPreview.length} client(s)`}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
