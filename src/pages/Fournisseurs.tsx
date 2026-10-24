import { useState, useRef, useMemo, Fragment } from 'react';
import { useCRM } from '@/lib/StoreContext';
import { generateId, formatMontant, calculerDateEcheance, normalizeDelaiReglement, type Fournisseur } from '@/lib/store';
import { Plus, Search, Edit2, Trash2, Upload, Mail, FolderOpen, Filter, X, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { exportToExcel } from '@/lib/exportExcel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import DocumentsFournisseurDialog, { DocumentsFournisseurPanel } from '@/components/DocumentsFournisseurDialog';
import { useNombreDocumentsFournisseur } from '@/lib/gedFournisseur';
import TransportFournisseurPanel from '@/components/TransportFournisseurPanel';
import EmailToContactDialog, { type ExtractedContact } from '@/components/EmailToContactDialog';
import { useTableColumns } from '@/hooks/useTableColumns';
import ColResizeHandle from '@/components/ColResizeHandle';
import PageHeaderSlot from '@/components/PageHeaderSlot';
import TableGearMenu from '@/components/TableGearMenu';
import FilterSuggestInput from '@/components/FilterSuggestInput';
import FilterChoiceInput, { parseChoiceFilter } from '@/components/FilterChoiceInput';

// Colonnes du tableau (convention vues tableau, claude/ui.md) : chaque colonne
// se trie depuis son en-tête et se filtre par son icône. Le délai de règlement
// se compare sans casse — la base porte « 45j FDM » comme « 45J FDM ».
type FournColKey = 'societe' | 'contact' | 'email' | 'telephone' | 'ville' | 'delai' | 'encours';
const FOURN_COLS: { key: FournColKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'societe', label: 'Société', align: 'left' },
  { key: 'contact', label: 'Contact', align: 'left' },
  { key: 'email', label: 'Email', align: 'left' },
  { key: 'telephone', label: 'Téléphone', align: 'left' },
  { key: 'ville', label: 'Ville', align: 'left' },
  { key: 'delai', label: 'Délai règlement', align: 'left' },
  { key: 'encours', label: 'Encours / Échéance', align: 'right' },
];
const ENCOURS_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'du', label: 'Avec encours' },
  { value: 'echu', label: 'Échu' },
  { value: 'aucun', label: 'Sans encours' },
];
const cleDelai = (d?: string) => (d || '').trim().toUpperCase();
// Valeurs canoniques (normalizeDelaiReglement, store.ts) : ce que la fiche relit.
const DELAIS_FOURNISSEUR = [
  { value: 'Comptant', label: 'Comptant' },
  { value: '30J', label: '30j net' },
  { value: '30J FDM', label: '30j FDM' },
  { value: '45J', label: '45j net' },
  { value: '45J FDM', label: '45j FDM' },
  { value: '60J', label: '60j net' },
  { value: '60J FDM', label: '60j FDM' },
];

function texteColonne(f: Fournisseur, key: Exclude<FournColKey, 'encours' | 'delai'>): string {
  switch (key) {
    case 'societe': return f.societe || '';
    case 'contact': return f.nom || '';
    case 'email': return f.email || '';
    case 'telephone': return [f.telephone, f.telephoneMobile].filter(Boolean).join(' ');
    case 'ville': return f.ville || '';
  }
}

const emptyFournisseur: Omit<Fournisseur, 'id' | 'dateCreation'> = {
  nom: '', email: '', telephone: '', telephoneMobile: '', adresse: '', ville: '', codePostal: '', societe: '', notes: '', francoPort: 0, coutTransport: 0, delaiReglement: '45J FDM', estStockiste: false, delaiExpedition: 0,
};

const importFields: { key: string; label: string; aliases: string[]; type: 'text' | 'number'; default?: any }[] = [
  { key: 'societe', label: 'Société', aliases: ['société', 'societe', 'entreprise', 'raison sociale'], type: 'text' },
  { key: 'nom', label: 'Nom contact', aliases: ['nom', 'contact', 'nom contact'], type: 'text' },
  { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'mail', 'courriel'], type: 'text' },
  { key: 'telephone', label: 'Téléphone', aliases: ['téléphone', 'telephone', 'tel', 'tél'], type: 'text' },
  { key: 'adresse', label: 'Adresse', aliases: ['adresse', 'rue'], type: 'text' },
  { key: 'ville', label: 'Ville', aliases: ['ville', 'city'], type: 'text' },
  { key: 'codePostal', label: 'Code postal', aliases: ['code postal', 'codepostal', 'cp'], type: 'text' },
  { key: 'francoPort', label: 'Franco de port', aliases: ['franco de port', 'francoport', 'franco', 'franco port'], type: 'number' },
  { key: 'coutTransport', label: 'Coût transport', aliases: ['coût transport', 'couttransport', 'transport', 'frais transport'], type: 'number' },
  { key: 'delaiReglement', label: 'Délai règlement', aliases: ['délai règlement', 'delai reglement', 'délai de règlement', 'delai de reglement', 'paiement'], type: 'text' },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'commentaire', 'remarques'], type: 'text' },
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

export default function Fournisseurs() {
  const { fournisseurs, updateFournisseurs, commandesFournisseur } = useCRM();
  const [docsFournisseur, setDocsFournisseur] = useState<Fournisseur | null>(null);
  const [ongletFiche, setOngletFiche] = useState<'infos' | 'transport' | 'documents'>('infos');
  const { nombres: nombresDocs, recharger: rechargerNombresDocs } = useNombreDocumentsFournisseur();

  // Encours : utilise dateEcheance stockée si disponible, sinon recalcule depuis dateReception
  const encoursDuParFournisseur = useMemo(() => {
    const map: Record<string, { montant: number; echeances: { montant: number; date: Date }[] }> = {};
    commandesFournisseur.forEach(cf => {
      if (cf.statut === 'recue') {
        let dateEch: Date;
        if (cf.dateEcheance) {
          const [y, mo, da] = cf.dateEcheance.split('-').map(Number);
          dateEch = new Date(y, mo - 1, da);
        } else {
          const fourn = fournisseurs.find(f => f.id === cf.fournisseurId);
          const delai = fourn?.delaiReglement || '45j FDM';
          dateEch = calculerDateEcheance(cf.dateReception || cf.dateCreation, delai);
        }
        if (!map[cf.fournisseurId]) map[cf.fournisseurId] = { montant: 0, echeances: [] };
        map[cf.fournisseurId].montant += cf.totalTTC;
        map[cf.fournisseurId].echeances.push({ montant: cf.totalTTC, date: dateEch });
      }
    });
    return map;
  }, [commandesFournisseur, fournisseurs]);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Fournisseur | null>(null);
  const [form, setForm] = useState(emptyFournisseur);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importMode, setImportMode] = useState<'add' | 'update'>('add');
  const [importSelectedCols, setImportSelectedCols] = useState<Set<string>>(new Set());
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  const fCols = useTableColumns<FournColKey>('fournisseurs_table', FOURN_COLS.map(c => c.key));
  const [visCols, setVisCols] = useState<Set<FournColKey>>(() => {
    try { const s = localStorage.getItem('fournisseurs_visible'); if (s) return new Set(JSON.parse(s) as FournColKey[]); } catch { /* ignore */ }
    return new Set(FOURN_COLS.map(c => c.key));
  });
  function toggleVisCol(k: FournColKey) { setVisCols(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); try { localStorage.setItem('fournisseurs_visible', JSON.stringify([...n])); } catch { /* ignore */ } return n; }); }
  const [colFilters, setColFilters] = useState<Partial<Record<FournColKey, string>>>({});
  const [openFilterCols, setOpenFilterCols] = useState<Set<FournColKey>>(new Set());
  const [sortCol, setSortCol] = useState<FournColKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function setColFilter(k: FournColKey, v: string) {
    setColFilters(prev => { const n = { ...prev }; if (v) n[k] = v; else delete n[k]; return n; });
  }
  function toggleFilterCol(col: FournColKey) {
    setOpenFilterCols(prev => { const n = new Set(prev); if (n.has(col)) { n.delete(col); setColFilter(col, ''); } else n.add(col); return n; });
  }
  // Fermé sans valeur → la colonne se replie sur l'icône seule. Lu par une ref :
  // un choix suivi de la fermeture du menu arrive avant le nouveau rendu.
  const colFiltersRef = useRef(colFilters);
  colFiltersRef.current = colFilters;
  function closeFilterIfEmpty(col: FournColKey) {
    setTimeout(() => {
      if (colFiltersRef.current[col]) return;
      setOpenFilterCols(prev => { const n = new Set(prev); n.delete(col); return n; });
    }, 0);
  }
  function clearAllFilters() { setColFilters({}); setOpenFilterCols(new Set()); }
  function toggleSort(col: FournColKey) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  // Montant dû et part échue, lus une fois par fournisseur (filtre, tri, affichage)
  const etatEncours = useMemo(() => {
    const now = new Date();
    const map: Record<string, { montant: number; depasse: number; prochaine?: Date }> = {};
    for (const [id, e] of Object.entries(encoursDuParFournisseur)) {
      const futures = e.echeances.filter(x => x.date >= now).sort((a, b) => a.date.getTime() - b.date.getTime());
      map[id] = {
        montant: e.montant,
        depasse: e.echeances.filter(x => x.date < now).reduce((s, x) => s + x.montant, 0),
        prochaine: futures[0]?.date,
      };
    }
    return map;
  }, [encoursDuParFournisseur]);

  const suggestions = useMemo(() => {
    const distinct = (key: Exclude<FournColKey, 'encours' | 'delai'>) =>
      Array.from(new Set(fournisseurs.map(f => texteColonne(f, key).trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr'));
    return { societe: distinct('societe'), contact: distinct('contact'), email: distinct('email'), telephone: distinct('telephone'), ville: distinct('ville') };
  }, [fournisseurs]);
  const delaiOptions = useMemo(() => {
    const vus = new Map<string, string>();
    fournisseurs.forEach(f => { const k = cleDelai(f.delaiReglement); if (k && !vus.has(k)) vus.set(k, f.delaiReglement!.trim()); });
    return [{ value: '', label: 'Tous' }, ...[...vus.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([value, label]) => ({ value, label }))];
  }, [fournisseurs]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return fournisseurs.filter(f => {
      if (s && ![f.nom, f.email, f.societe, f.telephone, f.telephoneMobile, f.ville].some(v => v?.toLowerCase().includes(s))) return false;
      for (const [k, v] of Object.entries(colFilters) as [FournColKey, string][]) {
        if (!v) continue;
        if (k === 'delai') {
          const { mode, only, excluded } = parseChoiceFilter(v);
          const d = cleDelai(f.delaiReglement);
          if (mode === 'only' && d !== only) return false;
          if (mode === 'exclude' && excluded.includes(d)) return false;
        } else if (k === 'encours') {
          const e = etatEncours[f.id];
          if (v === 'du' && !(e?.montant > 0)) return false;
          if (v === 'echu' && !(e?.depasse > 0)) return false;
          if (v === 'aucun' && e?.montant > 0) return false;
        } else if (!texteColonne(f, k).toLowerCase().includes(v.toLowerCase())) return false;
      }
      return true;
    });
  }, [fournisseurs, search, colFilters, etatEncours]);

  // Tri : les cases vides restent en bas, quel que soit le sens
  const sortedFiltered = useMemo(() => {
    if (!sortCol) return filtered;
    const sens = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortCol === 'encours') return sens * ((etatEncours[a.id]?.montant || 0) - (etatEncours[b.id]?.montant || 0));
      const va = sortCol === 'delai' ? (a.delaiReglement || '').trim() : texteColonne(a, sortCol).trim();
      const vb = sortCol === 'delai' ? (b.delaiReglement || '').trim() : texteColonne(b, sortCol).trim();
      if (!va || !vb) return va ? -1 : vb ? 1 : 0;
      return sens * va.localeCompare(vb, 'fr', { sensitivity: 'base', numeric: true });
    });
  }, [filtered, sortCol, sortDir, etatEncours]);

  function chipText(k: FournColKey, v: string): string {
    if (k === 'encours') return ENCOURS_OPTIONS.find(o => o.value === v)?.label || v;
    if (k === 'delai') {
      const { mode, only, excluded } = parseChoiceFilter(v);
      const lib = (x: string) => delaiOptions.find(o => o.value === x)?.label || x;
      return mode === 'exclude' ? `Sauf ${excluded.map(lib).join(', ')}` : lib(only);
    }
    return v;
  }

  function renderFilter(k: FournColKey) {
    switch (k) {
      case 'delai':
        return <FilterChoiceInput value={colFilters.delai || ''} onChange={v => setColFilter('delai', v)} options={delaiOptions} excludable onClose={() => closeFilterIfEmpty('delai')} />;
      case 'encours':
        return <FilterChoiceInput value={colFilters.encours || ''} onChange={v => setColFilter('encours', v)} options={ENCOURS_OPTIONS} onClose={() => closeFilterIfEmpty('encours')} />;
      default:
        return <FilterSuggestInput value={colFilters[k] || ''} onChange={v => setColFilter(k, v)} suggestions={suggestions[k]} placeholder={`${FOURN_COLS.find(c => c.key === k)?.label}…`} onClose={() => closeFilterIfEmpty(k)} />;
    }
  }

  function exportFournisseurs() {
    exportToExcel(sortedFiltered.map(f => ({ Nom: f.nom, Société: f.societe, Email: f.email, Téléphone: f.telephone, Adresse: f.adresse, Ville: f.ville, 'Code postal': f.codePostal, 'Délai règlement': f.delaiReglement || '', 'Franco port': f.francoPort, 'Coût transport': f.coutTransport, Notes: f.notes || '' })), 'fournisseurs', 'Fournisseurs');
  }

  const excelColumns = useMemo(() => {
    if (!importPreview || importPreview.length === 0) return [];
    return Object.keys(importPreview[0]);
  }, [importPreview]);

  function openNew() { setEditing(null); setOngletFiche('infos'); setForm(emptyFournisseur); setDialogOpen(true); }

  function handleEmailExtracted(contact: ExtractedContact) {
    setEditing(null);
    setForm({
      nom: contact.nom,
      email: contact.email,
      telephone: contact.telephone,
      telephoneMobile: contact.telephoneMobile,
      adresse: contact.adresse,
      ville: contact.ville,
      codePostal: contact.codePostal,
      societe: contact.societe,
      notes: contact.notes,
      francoPort: 0,
      coutTransport: 0,
      delaiReglement: '45J FDM',
      estStockiste: false,
      delaiExpedition: 0,
    });
    setDialogOpen(true);
  }
  function openEdit(f: Fournisseur) {
    setEditing(f);
    setOngletFiche('infos');
    setForm({ nom: f.nom, email: f.email, telephone: f.telephone, telephoneMobile: f.telephoneMobile || '', adresse: f.adresse, ville: f.ville, codePostal: f.codePostal, societe: f.societe, notes: f.notes || '', francoPort: f.francoPort ?? 0, coutTransport: f.coutTransport ?? 0, paliersPortPoids: f.paliersPortPoids ?? [], grilleAffretement: f.grilleAffretement, delaiReglement: normalizeDelaiReglement(f.delaiReglement || '45J FDM'), estStockiste: f.estStockiste ?? false, delaiExpedition: f.delaiExpedition ?? 0 });
    setDialogOpen(true);
  }

  function save() {
    if (!form.nom.trim() || !form.societe.trim()) { toast.error('Nom et société requis'); return; }
    if (editing) {
      updateFournisseurs(prev => prev.map(f => f.id === editing.id ? { ...f, ...form } : f));
      toast.success('Fournisseur modifié');
    } else {
      updateFournisseurs(prev => [...prev, { ...form, id: generateId(), dateCreation: new Date().toISOString().split('T')[0] }]);
      toast.success('Fournisseur ajouté');
    }
    setDialogOpen(false);
  }

  function confirmRemove(id: string) {
    setDeleteTargetId(id);
    setDeleteConfirmOpen(true);
  }

  function executeDelete() {
    if (deleteTargetId) {
      updateFournisseurs(prev => prev.filter(f => f.id !== deleteTargetId));
      toast.success('Fournisseur supprimé');
    }
    setDeleteConfirmOpen(false);
    setDeleteTargetId(null);
  }

  function getMappedValue(row: any, fieldKey: string): string {
    const colName = importMapping[fieldKey];
    if (!colName) return '';
    const val = row[colName];
    if (val === undefined || val === null) return '';
    return String(val).trim();
  }
  function getMappedNum(row: any, fieldKey: string, def = 0): number {
    const val = getMappedValue(row, fieldKey);
    const n = parseFloat(val);
    return isNaN(n) ? def : n;
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet);
        if (json.length === 0) { toast.error('Fichier vide'); return; }
        setImportPreview(json);
        setImportMode('add');
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

  function importFournisseursAction() {
    if (!importPreview) return;
    const selectedFields = importFields.filter(f => importSelectedCols.has(f.key));

    if (importMode === 'update') {
      let updated = 0;
      updateFournisseurs(prev => prev.map(f => {
        const matchingRow = importPreview.find(row => {
          const societe = getMappedValue(row, 'societe');
          return societe.toLowerCase() === f.societe.trim().toLowerCase();
        });
        if (!matchingRow) return f;

        const updates: Record<string, any> = {};
        for (const field of selectedFields) {
          if (field.key === 'societe') continue; // clé de correspondance
          if (field.type === 'number') {
            updates[field.key] = getMappedNum(matchingRow, field.key, field.default ?? 0);
          } else {
            const val = getMappedValue(matchingRow, field.key);
            if (val || field.default) updates[field.key] = val || field.default || '';
          }
        }

        if (Object.keys(updates).length > 0) {
          updated++;
          return { ...f, ...updates };
        }
        return f;
      }));
      toast.success(`${updated} fournisseur(s) mis à jour`);
    } else {
      const mapped: Fournisseur[] = importPreview.map((row: any) => ({
        id: generateId(),
        nom: getMappedValue(row, 'nom'),
        email: getMappedValue(row, 'email'),
        telephone: getMappedValue(row, 'telephone'),
        adresse: getMappedValue(row, 'adresse'),
        ville: getMappedValue(row, 'ville'),
        codePostal: getMappedValue(row, 'codePostal'),
        societe: getMappedValue(row, 'societe'),
        notes: getMappedValue(row, 'notes'),
        francoPort: getMappedNum(row, 'francoPort'),
        coutTransport: getMappedNum(row, 'coutTransport'),
        delaiReglement: normalizeDelaiReglement(getMappedValue(row, 'delaiReglement') || '45J FDM'),
        encoursMax: getMappedNum(row, 'encoursMax'),
        dateCreation: new Date().toISOString().split('T')[0],
      })).filter(f => f.nom || f.societe);

      const existingSocietes = new Set(fournisseurs.map(f => f.societe.trim().toLowerCase()));
      const unique = mapped.filter(f => {
        const s = f.societe.trim().toLowerCase();
        if (!s) return true;
        if (existingSocietes.has(s)) return false;
        existingSocietes.add(s);
        return true;
      });
      const skipped = mapped.length - unique.length;

      updateFournisseurs(prev => [...prev, ...unique]);
      toast.success(`${unique.length} fournisseur(s) importé(s)${skipped > 0 ? `, ${skipped} doublon(s) ignoré(s)` : ''}`);
    }

    setImportDialogOpen(false);
    setImportPreview(null);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <input type="file" ref={fileInputRef} accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
      <PageHeaderSlot>
        <div className="relative w-40 sm:w-56 md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="ml-auto flex flex-wrap gap-2 items-center">
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Importer</span></Button>
          <Button size="sm" onClick={openNew} className="shrink-0"><Plus className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Nouveau fournisseur</span><span className="sm:hidden">Nouveau</span></Button>
        </div>
      </PageHeaderSlot>

      <div className="hidden md:flex md:flex-col flex-1 min-h-0 bg-card rounded-xl border border-border overflow-hidden">
        {Object.values(colFilters).some(v => v) && (
          <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Filtres actifs :</span>
            {(Object.entries(colFilters).filter(([, v]) => v) as [FournColKey, string][]).map(([k, v]) => (
              <span key={k} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                {FOURN_COLS.find(c => c.key === k)?.label} : {chipText(k, v)}
                <button onClick={() => setColFilter(k, '')}><X className="w-3 h-3" /></button>
              </span>
            ))}
            <button onClick={clearAllFilters} className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"><X className="w-3 h-3" /> Effacer</button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {fCols.ordered(FOURN_COLS, k => visCols.has(k)).map(({ key, label, align }) => {
                const hasFilter = !!colFilters[key];
                const isFilterOpen = openFilterCols.has(key);
                const SortIcon = sortCol === key ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
                const isDragOver = fCols.dragOverKey === key && fCols.dragKey !== key;
                return (
                  <th key={key} {...fCols.thProps(key)} style={fCols.widthStyle(key)} className={`relative px-4 py-2 font-medium text-muted-foreground select-none whitespace-nowrap cursor-grab active:cursor-grabbing sticky top-0 z-10 ${align === 'right' ? 'text-right' : 'text-left'} ${isDragOver ? 'bg-primary/10' : fCols.dragKey === key ? 'bg-muted opacity-40' : 'bg-muted'}`}>
                    {isDragOver && <span className="absolute top-0 left-0 h-full w-0.5 bg-primary z-20" />}
                    <div className={`flex items-center gap-0.5 ${align === 'right' ? 'justify-end' : ''} ${fCols.widthStyle(key) ? 'overflow-hidden' : ''}`}>
                      <button className="flex items-center gap-1 hover:text-foreground cursor-pointer min-w-0" onClick={() => toggleSort(key)} title={sortCol === key ? (sortDir === 'asc' ? 'Tri croissant' : 'Tri décroissant') : 'Trier'}>
                        {align === 'right' && <SortIcon className={`w-3.5 h-3.5 shrink-0 ${sortCol === key ? 'text-primary' : 'opacity-40'}`} />}
                        <span className="truncate">{label}</span>
                        {align !== 'right' && <SortIcon className={`w-3.5 h-3.5 shrink-0 ${sortCol === key ? 'text-primary' : 'opacity-40'}`} />}
                      </button>
                      {isFilterOpen ? (
                        <span className="font-normal inline-flex items-center gap-0.5 min-w-0" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} draggable={false}>
                          {renderFilter(key)}
                          <button onClick={() => toggleFilterCol(key)} title="Fermer le filtre" className="p-0.5 rounded hover:bg-muted/80 text-muted-foreground/60 shrink-0"><X className="w-3 h-3" /></button>
                        </span>
                      ) : (
                        <button onClick={() => toggleFilterCol(key)} title="Filtrer" className={`p-0.5 rounded hover:bg-muted/80 transition-colors shrink-0 ${hasFilter ? 'text-primary' : 'text-muted-foreground/25 hover:text-muted-foreground/60'}`}>
                          <Filter className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <ColResizeHandle {...fCols.resizeHandleProps(key)} />
                  </th>
                );
              })}
              <th className="px-2 py-2 text-right sticky top-0 z-10 bg-muted whitespace-nowrap">
                <TableGearMenu cols={FOURN_COLS} visible={visCols} onToggle={toggleVisCol} onExport={exportFournisseurs} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedFiltered.map(f => {
              const encours = etatEncours[f.id];
              const montantDu = encours?.montant || 0;
              const montantDepasse = encours?.depasse || 0;
              const prochaineDate = encours?.prochaine;
              const renderF = (key: FournColKey) => {
                const ws = fCols.widthStyle(key);
                const trunc = ws ? ' truncate' : '';
                switch (key) {
                  case 'societe': return <td style={ws} className={`px-4 py-3 font-medium${trunc}`}>{f.societe}</td>;
                  case 'contact': return <td style={ws} className={`px-4 py-3 text-muted-foreground${trunc}`}>{f.nom}</td>;
                  case 'email': return <td style={ws} className={`px-4 py-3 text-muted-foreground${trunc}`}>{f.email}</td>;
                  case 'telephone': return <td style={ws} className={`px-4 py-3 text-muted-foreground${trunc}`}>{f.telephone}</td>;
                  case 'ville': return <td style={ws} className={`px-4 py-3 text-muted-foreground${trunc}`}>{f.ville}</td>;
                  case 'delai': return <td style={ws} className={`px-4 py-3 text-muted-foreground text-sm${trunc}`}>{f.delaiReglement || '—'}</td>;
                  case 'encours': return <td style={ws} className="px-4 py-3 text-right">
                    {montantDu > 0 ? (
                      <div>
                        <span className="font-medium">{formatMontant(montantDu)}</span>
                        {prochaineDate && (
                          <div className="text-xs text-muted-foreground">
                            éch. {prochaineDate.toLocaleDateString('fr-FR')}
                          </div>
                        )}
                        {montantDepasse > 0 && (
                          <div className="text-xs text-destructive font-medium">
                            {formatMontant(montantDepasse)} échu
                          </div>
                        )}
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>;
                }
              };
              return (
                <tr key={f.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => openEdit(f)}>
                  {fCols.ordered(FOURN_COLS, k => visCols.has(k)).map(col => <Fragment key={col.key}>{renderF(col.key)}</Fragment>)}
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={e => { e.stopPropagation(); setDocsFournisseur(f); }} className="relative p-1.5 rounded-md hover:bg-muted" title="Documents">
                        <FolderOpen className="w-4 h-4" />
                        {(nombresDocs[f.id] ?? 0) > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold leading-[14px] text-center">{nombresDocs[f.id]}</span>
                        )}
                      </button>
                      <button onClick={() => openEdit(f)} className="p-1.5 rounded-md hover:bg-muted"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={e => { e.stopPropagation(); confirmRemove(f.id); }} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sortedFiltered.length === 0 && <p className="text-center py-8 text-muted-foreground">Aucun fournisseur</p>}
        </div>
      </div>

      <div className="md:hidden flex-1 min-h-0 overflow-y-auto space-y-3">
        {sortedFiltered.map(f => (
          <div key={f.id} className="bg-card rounded-xl border border-border p-4 cursor-pointer" onClick={() => openEdit(f)}>
            <div className="flex justify-between items-start">
              <div><p className="font-medium">{f.societe}</p><p className="text-sm text-muted-foreground">{f.nom}</p></div>
              <div className="flex gap-1">
                <button onClick={e => { e.stopPropagation(); setDocsFournisseur(f); }} className="relative p-1.5 rounded-md hover:bg-muted" title="Documents">
                        <FolderOpen className="w-4 h-4" />
                        {(nombresDocs[f.id] ?? 0) > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold leading-[14px] text-center">{nombresDocs[f.id]}</span>
                        )}
                      </button>
                <button onClick={() => openEdit(f)} className="p-1.5 rounded-md hover:bg-muted"><Edit2 className="w-4 h-4" /></button>
                <button onClick={e => { e.stopPropagation(); confirmRemove(f.id); }} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="mt-2 text-sm text-muted-foreground space-y-0.5">
              <p>{f.email}</p><p>{f.telephone}</p><p>{f.ville}</p>
            </div>
          </div>
        ))}
      </div>

      <DocumentsFournisseurDialog fournisseur={docsFournisseur} onChange={() => void rechargerNombresDocs()} onOpenChange={o => { if (!o) { setDocsFournisseur(null); void rechargerNombresDocs(); } }} />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer ce fournisseur ? Cette action ne peut pas être annulée.
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent mobileFullscreen className="sm:max-w-lg sm:max-h-[90vh] flex flex-col overflow-y-auto">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editing ? 'Modifier' : 'Nouveau fournisseur'}</DialogTitle>
          </DialogHeader>
          <div className="shrink-0 flex gap-1 border-b border-border">
            {([['infos', 'Informations'], ['transport', 'Transport'], ...(editing ? [['documents', 'Documents']] : [])] as [typeof ongletFiche, string][]).map(([cle, libelle]) => (
              <button key={cle} type="button" onClick={() => setOngletFiche(cle)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${ongletFiche === cle ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                {libelle}
                {cle === 'documents' && editing && (nombresDocs[editing.id] ?? 0) > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-[18px] text-center">{nombresDocs[editing.id]}</span>
                )}
              </button>
            ))}
          </div>
          {ongletFiche === 'transport' && (
            <div className="flex-1 overflow-y-auto min-h-0">
              <TransportFournisseurPanel
                valeur={{ francoPort: form.francoPort, coutTransport: form.coutTransport, paliersPortPoids: form.paliersPortPoids, grilleAffretement: form.grilleAffretement }}
                onChange={patch => setForm(prev => ({ ...prev, ...patch }))}
              />
            </div>
          )}
          {editing && ongletFiche === 'documents' && (
            <div className="flex-1 overflow-y-auto min-h-0 pt-3">
              <DocumentsFournisseurPanel fournisseurId={editing.id} onChange={() => void rechargerNombresDocs()} />
            </div>
          )}
          <div className={`flex-1 overflow-y-auto min-h-0 ${ongletFiche !== 'infos' ? 'hidden' : ''}`}>
            {!editing && (
              <Button variant="outline" className="w-full border-dashed text-muted-foreground hover:text-foreground mb-3" onClick={() => setEmailDialogOpen(true)}>
                <Mail className="w-4 h-4 mr-2" /> Remplir depuis un email
              </Button>
            )}
            <div className="grid gap-4 py-2">
              {[
                { key: 'societe', label: 'Société *' },
                { key: 'nom', label: 'Nom contact *' },
                { key: 'email', label: 'Email', type: 'email' },
                { key: 'telephone', label: 'Tél. fixe', type: 'tel' },
                { key: 'telephoneMobile', label: 'Tél. mobile', type: 'tel' },
                { key: 'adresse', label: 'Adresse' },
                { key: 'ville', label: 'Ville' },
                { key: 'codePostal', label: 'Code postal' },
              ].map(f => (
                <div key={f.key}>
                  <Label>{f.label}</Label>
                  <Input type={f.type || 'text'} value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                </div>
              ))}
              <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
                <p className="text-sm font-semibold text-foreground">Conditions de paiement</p>
                <div>
                  <Label className="text-xs">Délai de règlement</Label>
                  {/* Select du projet, jamais un <select> natif dans un dialogue Radix ;
                      valeurs sous la forme de normalizeDelaiReglement, sinon la fiche
                      relue n'en reconnaît aucune et affiche « Comptant ». */}
                  <Select
                    value={form.delaiReglement}
                    onValueChange={v => setForm(prev => ({ ...prev, delaiReglement: v }))}
                  >
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[
                        ...(DELAIS_FOURNISSEUR.some(d => d.value === form.delaiReglement) || !form.delaiReglement
                          ? [] : [{ value: form.delaiReglement, label: form.delaiReglement }]),
                        ...DELAIS_FOURNISSEUR,
                      ].map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
                <p className="text-sm font-semibold text-foreground">Stock disponible</p>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={(form as any).estStockiste ?? false}
                    onChange={e => setForm(prev => ({ ...prev, estStockiste: e.target.checked }))}
                    className="rounded w-4 h-4 accent-primary"
                  />
                  <span className="text-sm">Fournisseur stockiste</span>
                  <span className="text-xs text-muted-foreground">(produits disponibles sur stock)</span>
                </label>
                {(form as any).estStockiste && (
                  <div>
                    <Label className="text-xs">Délai d'expédition (jours)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={(form as any).delaiExpedition ?? 0}
                      onChange={e => setForm(prev => ({ ...prev, delaiExpedition: parseInt(e.target.value) || 0 }))}
                      placeholder="0 = immédiat"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className={`sticky bottom-0 bg-background border-t border-border pt-3 pb-1 mt-2 shrink-0 flex justify-end gap-2 ${ongletFiche === 'documents' ? 'hidden' : ''}`}>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={save}>{editing ? 'Modifier' : 'Ajouter'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <EmailToContactDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        type="fournisseur"
        onExtracted={handleEmailExtracted}
      />

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent mobileFullscreen className="sm:max-w-2xl sm:max-h-[90vh] flex flex-col overflow-y-auto">
          <DialogHeader><DialogTitle>Aperçu de l'import</DialogTitle></DialogHeader>
          {importPreview && (
            <>
              {/* Mode selection */}
              <div className="flex gap-2 mb-2">
                <Button
                  variant={importMode === 'add' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setImportMode('add')}
                >
                  Ajouter (nouveaux)
                </Button>
                <Button
                  variant={importMode === 'update' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setImportMode('update')}
                >
                  Mettre à jour (existants)
                </Button>
              </div>

              {importMode === 'update' && (
                <p className="text-xs text-muted-foreground">
                  Les fournisseurs seront mis à jour par correspondance sur la <strong>société</strong>. Sélectionnez les colonnes à mettre à jour :
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
                        onChange={() => {
                          setImportSelectedCols(prev => {
                            const next = new Set(prev);
                            next.has(f.key) ? next.delete(f.key) : next.add(f.key);
                            return next;
                          });
                        }}
                        disabled={importMode === 'update' && f.key === 'societe'}
                      />
                      <span className="text-xs w-28 shrink-0 truncate" title={f.label}>{f.label}</span>
                      <select
                        className="flex-1 text-xs rounded border border-input bg-background px-2 py-1"
                        value={importMapping[f.key] || ''}
                        onChange={e => {
                          setImportMapping(prev => {
                            const next = { ...prev };
                            if (e.target.value) {
                              next[f.key] = e.target.value;
                              setImportSelectedCols(p => new Set([...p, f.key]));
                            } else {
                              delete next[f.key];
                              setImportSelectedCols(p => { const n = new Set(p); n.delete(f.key); return n; });
                            }
                            return next;
                          });
                        }}
                      >
                        <option value="">— non mappé —</option>
                        {excelColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-sm text-muted-foreground">{importPreview.length} ligne(s) détectée(s)</p>
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {Object.keys(importPreview[0] || {}).map((k, i) => <th key={i} className="px-2 py-1 text-left">{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b">
                        {Object.values(row).map((v, j) => <td key={j} className="px-2 py-1 whitespace-nowrap">{String(v)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importPreview.length > 10 && <p className="text-xs text-muted-foreground">... et {importPreview.length - 10} autres lignes</p>}
            </>
          )}
          <div className="sticky bottom-0 bg-background border-t border-border pt-3 pb-1 mt-2 shrink-0 flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setImportDialogOpen(false); setImportPreview(null); }}>Annuler</Button>
            <Button onClick={importFournisseursAction}>
              {importMode === 'update' ? `Mettre à jour` : `Importer ${importPreview?.length || 0} fournisseur(s)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
