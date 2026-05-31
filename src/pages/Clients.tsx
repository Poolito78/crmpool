import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useCRM } from '@/lib/StoreContext';
import { generateId, formatMontant, calculerTotalDevis, formatDate, useCrmActions, RAISON_ARCHIVE, TYPE_CRM_ACTION, STATUT_CRM_ACTION, type Client, type AdresseLivraison, type Contact } from '@/lib/store';
import { Plus, Search, Edit2, Trash2, MapPin, ChevronDown, ChevronUp, Upload, Download, Filter, ArrowLeft, FileText, UserPlus, X, Mail, ChevronsUpDown, Bot, Loader2, CalendarClock, TrendingUp, ShoppingCart, CheckCircle2, XCircle, Clock, Building2 } from 'lucide-react';
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
import CRMActionDialog from '@/components/CRMActionDialog';
import { supabase } from '@/integrations/supabase/client';
import { Fragment } from 'react';
import { useTableColumns } from '@/hooks/useTableColumns';
import ColResizeHandle from '@/components/ColResizeHandle';
import PageHeaderSlot from '@/components/PageHeaderSlot';
import FilterSuggestInput from '@/components/FilterSuggestInput';
import FilterChoiceInput from '@/components/FilterChoiceInput';
import RowActionsMenu from '@/components/RowActionsMenu';

type ClientColKey = 'societe' | 'contacts' | 'ville' | 'adresses' | 'devis' | 'encours';
const CLIENT_COLS: { key: ClientColKey; label: string; align: 'left' | 'right'; sortable: boolean; filterCol: 'societe' | 'contacts' | 'ville' | 'adresses' | null }[] = [
  { key: 'societe',  label: 'Société',       align: 'left',  sortable: true,  filterCol: 'societe' },
  { key: 'contacts', label: 'Contacts',      align: 'left',  sortable: false, filterCol: 'contacts' },
  { key: 'ville',    label: 'Ville',         align: 'left',  sortable: true,  filterCol: 'ville' },
  { key: 'adresses', label: 'Adresses liv.', align: 'left',  sortable: true,  filterCol: 'adresses' },
  { key: 'devis',    label: 'Devis',         align: 'left',  sortable: true,  filterCol: null },
  { key: 'encours',  label: 'Encours dû',    align: 'right', sortable: true,  filterCol: null },
];

const DELAI_REGLEMENT_OPTIONS = [
  { value: 'Comptant', label: 'Comptant',  conditions: 'Paiement comptant à réception de facture.' },
  { value: '30J',      label: '30J',       conditions: 'Paiement à 30 jours net à compter de la date de facturation.' },
  { value: '30J FDM',  label: '30J FDM',   conditions: 'Paiement à 30 jours fin de mois à compter de la date de facturation.' },
  { value: '45J',      label: '45J',       conditions: 'Paiement à 45 jours net à compter de la date de facturation.' },
  { value: '45J FDM',  label: '45J FDM',   conditions: 'Paiement à 45 jours fin de mois à compter de la date de facturation.' },
] as const;

export { DELAI_REGLEMENT_OPTIONS };

// ─── Recherche entreprise (API officielle recherche-entreprises.api.gouv.fr) ───

interface EntrepriseResult {
  siren: string;
  nom_complet: string;
  sigle?: string;
  etat_administratif: 'A' | 'F';
  date_creation?: string;
  activite_principale?: string;
  libelle_activite_principale?: string;
  nature_juridique?: string;
  libelle_nature_juridique?: string;
  tranche_effectif_salarie?: string;
  siege: {
    siret?: string;
    adresse?: string;
    code_postal?: string;
    libelle_commune?: string;
    numero_voie?: string;
    type_voie?: string;
    libelle_voie?: string;
    complement_adresse?: string;
  };
  dirigeants?: { nom?: string; prenoms?: string; qualite?: string }[];
}

const EFFECTIF_LABELS: Record<string, string> = {
  '00': '0 salarié', '01': '1-2', '02': '3-5', '03': '6-9',
  '11': '10-19', '12': '20-49', '21': '50-99', '22': '100-199',
  '31': '200-249', '32': '250-499', '41': '500-999', '42': '1000+',
  '51': '2000+', '52': '5000+', '53': '10 000+',
};

function getSolvabilite(e: EntrepriseResult): { score: number; label: string; color: string } {
  if (e.etat_administratif !== 'A') return { score: 0, label: 'Fermée', color: '#ef4444' };
  let score = 2; // base : entreprise active
  const ageYears = e.date_creation
    ? (Date.now() - new Date(e.date_creation).getTime()) / (1000 * 3600 * 24 * 365)
    : 0;
  if (ageYears >= 10) score += 2;
  else if (ageYears >= 3) score += 1;
  const eff = e.tranche_effectif_salarie;
  if (eff && ['21','22','31','32','41','42','51','52','53'].includes(eff)) score += 2;
  else if (eff && ['11','12'].includes(eff)) score += 1;
  else if (eff && ['02','03'].includes(eff)) score += 0;
  const s = Math.min(score, 5);
  if (s >= 4) return { score: s, label: 'Solvabilité bonne', color: '#22c55e' };
  if (s >= 2) return { score: s, label: 'Solvabilité moyenne', color: '#f59e0b' };
  return { score: s, label: 'Solvabilité faible', color: '#ef4444' };
}

const emptyClient: Omit<Client, 'id' | 'dateCreation'> = {
  nom: '', email: '', telephone: '', telephoneMobile: '', adresse: '', ville: '', codePostal: '', societe: '', notes: '', adressesLivraison: [], estRevendeur: false, remisesParCategorie: {}, contacts: [], francoPort: 0, coutTransport: 0, delaiReglement: '45J FDM',
  siret: '', codeApe: '', libelleApe: '', formeJuridique: '', tvaIntra: '', rcs: '', trancheEffectif: '', dateCreationEntreprise: '', capitalSocial: '',
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
  const [openFilterCols, setOpenFilterCols] = useState<Set<'societe' | 'contacts' | 'ville' | 'adresses'>>(new Set());
  const cCols = useTableColumns<ClientColKey>('clients_table', CLIENT_COLS.map(c => c.key));
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
  const [iaText, setIaText] = useState('');
  const [iaImage, setIaImage] = useState<{ base64: string; mimeType: string; previewUrl: string } | null>(null);
  const [iaLoading, setIaLoading] = useState(false);
  const [iaOpen, setIaOpen] = useState(false);
  const [siretOpen, setSiretOpen] = useState(false);
  const [siretQuery, setSiretQuery] = useState('');
  const [siretResults, setSiretResults] = useState<EntrepriseResult[]>([]);
  const [siretLoading, setSiretLoading] = useState(false);
  const [sortCol, setSortCol] = useState<'societe' | 'ville' | 'adresses' | 'devis' | 'encours' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [clientDialogTab, setClientDialogTab] = useState<'infos' | 'crm' | 'comptabilite'>('infos');
  const { actions: crmActions, addAction: addCrmAction } = useCrmActions();
  const [crmActionDialogOpen, setCrmActionDialogOpen] = useState(false);

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  function toggleFilterCol(col: 'societe' | 'contacts' | 'ville' | 'adresses') {
    setOpenFilterCols(prev => {
      const n = new Set(prev);
      if (n.has(col)) {
        n.delete(col);
        // efface le(s) filtre(s) de la colonne quand on referme
        if (col === 'societe') setFilterSociete('');
        else if (col === 'contacts') { setFilterContact(''); setFilterRevendeur(''); }
        else if (col === 'ville') { setFilterVille(''); setFilterDepartement(''); }
        else if (col === 'adresses') setFilterHasAdresse('');
      } else n.add(col);
      return n;
    });
  }

  // Contrôle de filtre par colonne (affiché inline dans l'en-tête)
  function renderClientFilter(fc: 'societe' | 'contacts' | 'ville' | 'adresses') {
    switch (fc) {
      case 'societe':
        return <FilterSuggestInput value={filterSociete} onChange={setFilterSociete} suggestions={societes} placeholder="Société…" />;
      case 'contacts':
        return (
          <span className="inline-flex items-center gap-1">
            <input placeholder="Nom, email…" value={filterContact} onChange={e => setFilterContact(e.target.value)} className="h-6 text-xs w-24 rounded border border-input bg-background px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring" autoFocus />
            <select value={filterRevendeur} onChange={e => setFilterRevendeur(e.target.value as '' | 'oui' | 'non')} className="h-6 text-xs rounded border border-input bg-background px-1"><option value="">Tous</option><option value="oui">Rev.</option><option value="non">Non rev.</option></select>
          </span>
        );
      case 'ville':
        return (
          <span className="inline-flex items-center gap-1">
            <input placeholder="Ville…" value={filterVille} onChange={e => setFilterVille(e.target.value)} className="h-6 text-xs w-20 rounded border border-input bg-background px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring" autoFocus />
            <input placeholder="Dép." value={filterDepartement} onChange={e => setFilterDepartement(e.target.value)} className="h-6 text-xs w-10 rounded border border-input bg-background px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring" maxLength={3} />
          </span>
        );
      case 'adresses':
        return <FilterChoiceInput value={filterHasAdresse} onChange={v => setFilterHasAdresse(v as '' | 'oui' | 'non')} options={[{ value: '', label: 'Toutes' }, { value: 'oui', label: 'Avec' }, { value: 'non', label: 'Sans' }]} />;
    }
  }

  function clearAllFilters() {
    setFilterVille(''); setFilterDepartement(''); setFilterSociete('');
    setFilterContact(''); setFilterRevendeur(''); setFilterHasAdresse('');
    setOpenFilterCols(new Set());
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
      if (filterVille && !c.ville?.toLowerCase().includes(filterVille.toLowerCase())) return false;
      if (filterDepartement && !c.codePostal?.startsWith(filterDepartement)) return false;
      if (filterSociete && !(c.societe || c.nom)?.toLowerCase().includes(filterSociete.toLowerCase())) return false;
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
  }, [clients, search, filterVille, filterDepartement, filterSociete, filterContact, filterRevendeur, filterHasAdresse]);

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
    setClientDialogTab('infos');
    setSiretOpen(false);
    setSiretQuery('');
    setSiretResults([]);
    setDialogOpen(true);
  }

  async function searchEntreprise() {
    const q = siretQuery.trim();
    if (!q) return;
    setSiretLoading(true);
    setSiretResults([]);
    try {
      const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&per_page=6`);
      const data = await res.json();
      setSiretResults(data.results || []);
    } catch {
      toast.error('Impossible de contacter l\'API entreprises');
    } finally {
      setSiretLoading(false);
    }
  }

  function importEntreprise(e: EntrepriseResult) {
    const s = e.siege;
    const adresseParts = [s.numero_voie, s.type_voie, s.libelle_voie, s.complement_adresse].filter(Boolean).join(' ');
    const adresse = adresseParts || s.adresse || '';
    // Calcul TVA intra depuis SIREN (9 premiers chiffres du SIRET)
    const siret = s.siret || '';
    const siren = siret.replace(/\s/g, '').substring(0, 9);
    let tvaIntraCalc = '';
    if (/^\d{9}$/.test(siren)) {
      const key = (12 + 3 * (parseInt(siren, 10) % 97)) % 97;
      tvaIntraCalc = `FR${String(key).padStart(2, '0')}${siren}`;
    }
    setForm(prev => ({
      ...prev,
      societe: e.nom_complet,
      adresse: adresse.trim(),
      ville: s.libelle_commune || '',
      codePostal: s.code_postal || '',
      siret: siret,
      codeApe: e.activite_principale || '',
      libelleApe: e.libelle_activite_principale || '',
      formeJuridique: e.libelle_nature_juridique || '',
      trancheEffectif: e.tranche_effectif_salarie || '',
      dateCreationEntreprise: e.date_creation || '',
      tvaIntra: tvaIntraCalc,
    }));
    setSiretOpen(false);
    setSiretResults([]);
    setSiretQuery('');
    // Aller sur l'onglet comptabilité pour montrer les champs remplis
    setClientDialogTab('comptabilite');
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
    setForm({ nom: c.nom, email: c.email, telephone: c.telephone, telephoneMobile: c.telephoneMobile || '', adresse: c.adresse, ville: c.ville, codePostal: c.codePostal, societe: c.societe || '', notes: c.notes || '', adressesLivraison: c.adressesLivraison || [], estRevendeur: c.estRevendeur || false, remisesParCategorie: c.remisesParCategorie || {}, contacts, francoPort: c.francoPort || 0, coutTransport: c.coutTransport || 0, delaiReglement: c.delaiReglement || '45J FDM', siret: c.siret || '', codeApe: c.codeApe || '', libelleApe: c.libelleApe || '', formeJuridique: c.formeJuridique || '', tvaIntra: c.tvaIntra || '', rcs: c.rcs || '', trancheEffectif: c.trancheEffectif || '', dateCreationEntreprise: c.dateCreationEntreprise || '', capitalSocial: c.capitalSocial || '' });
    setSiretOpen(false);
    setSiretResults([]);
    setSiretQuery('');
    setDialogOpen(true);
  }

  async function extractClientFromIA() {
    if (!iaText.trim() && !iaImage) return;
    setIaLoading(true);
    try {
      const body = iaImage
        ? { imageBase64: iaImage.base64, imageMimeType: iaImage.mimeType }
        : { text: iaText };
      const { data, error } = await supabase.functions.invoke('extract-client', { body });
      if (error) throw error;
      const r = data as any;
      // Adresses supplémentaires détectées par l'IA
      const newAdresses: AdresseLivraison[] = Array.isArray(r.adresses) && r.adresses.length > 0
        ? r.adresses.map((a: any) => ({
            id: generateId(),
            libelle: a.libelle || (a.type === 'facturation' ? 'Facturation' : 'Livraison'),
            adresse: a.adresse || '',
            ville: a.ville || '',
            codePostal: a.codePostal || '',
            contact: a.contact || '',
            telephone: a.telephone || '',
            parDefaut: false,
            type: (a.type === 'facturation' ? 'facturation' : 'livraison') as 'facturation' | 'livraison',
          }))
        : [];
      setForm(prev => ({
        ...prev,
        societe:          r.societe         || prev.societe,
        nom:              r.nom             || prev.nom,
        email:            r.email           || prev.email,
        telephone:        r.telephone       || prev.telephone,
        telephoneMobile:  r.telephoneMobile || prev.telephoneMobile,
        adresse:          r.adresse         || prev.adresse,
        ville:            r.ville           || prev.ville,
        codePostal:       r.codePostal      || prev.codePostal,
        notes:            r.notes           ? (prev.notes ? prev.notes + '\n' + r.notes : r.notes) : prev.notes,
        adressesLivraison: newAdresses.length > 0
          ? [...(prev.adressesLivraison || []), ...newAdresses]
          : prev.adressesLivraison,
      }));
      setIaOpen(false);
      setIaText('');
      setIaImage(null);
      const adresseMsg = newAdresses.length > 0 ? ` + ${newAdresses.length} adresse${newAdresses.length > 1 ? 's' : ''} détectée${newAdresses.length > 1 ? 's' : ''}` : '';
      toast.success('Coordonnées extraites par IA' + adresseMsg);
    } catch (e: any) {
      toast.error('Erreur IA : ' + (e.message ?? 'indisponible'));
    } finally {
      setIaLoading(false);
    }
  }

  function handleIaPaste(e: React.ClipboardEvent) {
    // Détecter image dans le presse-papier
    const items = Array.from(e.clipboardData.items);
    const imgItem = items.find(it => it.type.startsWith('image/'));
    if (imgItem) {
      e.preventDefault();
      const file = imgItem.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const dataUrl = ev.target?.result as string;
        const base64 = dataUrl.split(',')[1];
        setIaImage({ base64, mimeType: file.type, previewUrl: dataUrl });
        setIaText('');
      };
      reader.readAsDataURL(file);
      return;
    }
    // Sinon texte normal
    const text = e.clipboardData.getData('text/plain');
    if (text?.trim()) setIaText(text.trim());
  }

  function save(silent = false): boolean {
    if (!form.societe?.trim()) { if (!silent) toast.error('La société est requise'); return false; }
    const derived = deriveFromContacts(form);
    const toSave = { ...form, ...derived };
    if (editingClient) {
      updateClients(prev => prev.map(c => c.id === editingClient.id ? { ...c, ...toSave } : c));
      if (!silent) toast.success('Client modifié');
    } else {
      updateClients(prev => [...prev, { ...toSave, id: generateId(), dateCreation: new Date().toISOString().split('T')[0] }]);
      if (!silent) toast.success('Client ajouté');
    }
    if (!silent) setDialogOpen(false);
    return true;
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
      <PageHeaderSlot>
        <div className="relative w-32 sm:w-48 md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="ml-auto flex flex-wrap gap-2 items-center">
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters}>
              <X className="w-4 h-4 mr-1" /> Effacer
            </Button>
          )}
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Importer</span></Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(clients.map(c => ({ Nom: c.nom, Société: c.societe || '', Email: c.email, Téléphone: c.telephone, Adresse: c.adresse, Ville: c.ville, 'Code postal': c.codePostal, Notes: c.notes || '', Revendeur: c.estRevendeur ? 'Oui' : 'Non' })), 'clients', 'Clients')}><Download className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Exporter</span></Button>
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Nouveau client</span><span className="sm:hidden">Nouveau</span></Button>
        </div>
      </PageHeaderSlot>


      {/* Desktop table */}
      <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
        {activeFilterCount > 0 && (
          <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Filtres actifs :</span>
            {([
              filterSociete && ['Société', filterSociete, () => setFilterSociete('')],
              filterContact && ['Contact', filterContact, () => setFilterContact('')],
              filterRevendeur && ['Revendeur', filterRevendeur === 'oui' ? 'Oui' : 'Non', () => setFilterRevendeur('')],
              filterVille && ['Ville', filterVille, () => setFilterVille('')],
              filterDepartement && ['Dép.', filterDepartement, () => setFilterDepartement('')],
              filterHasAdresse && ['Adresses', filterHasAdresse === 'oui' ? 'Avec' : 'Sans', () => setFilterHasAdresse('')],
            ].filter(Boolean) as [string, string, () => void][]).map(([lab, val, clear]) => (
              <span key={lab} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                {lab} : {val}
                <button onClick={clear}><X className="w-3 h-3" /></button>
              </span>
            ))}
            <button onClick={clearAllFilters} className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"><X className="w-3 h-3" /> Effacer</button>
          </div>
        )}
        <div className="overflow-auto max-h-[calc(100vh-9rem)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {cCols.ordered(CLIENT_COLS).map(({ key, label, align, sortable, filterCol }) => {
                const col = sortable ? key : null;
                const hasFilter = filterCol === 'societe' ? !!filterSociete
                  : filterCol === 'contacts' ? !!(filterContact || filterRevendeur)
                  : filterCol === 'ville' ? !!(filterVille || filterDepartement)
                  : filterCol === 'adresses' ? !!filterHasAdresse : false;
                const isFilterOpen = filterCol ? openFilterCols.has(filterCol) : false;
                const SortIcon = sortCol === col
                  ? (sortDir === 'asc' ? ChevronUp : ChevronDown)
                  : ChevronsUpDown;
                const isDragOver = cCols.dragOverKey === key && cCols.dragKey !== key;
                return (
                  <th key={key} {...cCols.thProps(key)} style={cCols.widthStyle(key)} className={`relative px-4 py-2 font-medium text-muted-foreground select-none whitespace-nowrap cursor-grab active:cursor-grabbing sticky top-0 z-10 ${isDragOver ? 'bg-primary/10' : cCols.dragKey === key ? 'bg-muted opacity-40' : 'bg-muted'}`}>
                    {isDragOver && <span className="absolute top-0 left-0 h-full w-0.5 bg-primary z-20" />}
                    <div className={`flex items-center gap-0.5 ${align === 'right' ? 'justify-end' : ''} ${cCols.widthStyle(key) ? 'overflow-hidden' : ''}`}>
                      {col ? (
                        <button className="flex items-center gap-1 hover:text-foreground cursor-pointer min-w-0" onClick={() => toggleSort(col)}>
                          {align === 'right' && <SortIcon className={`w-3.5 h-3.5 shrink-0 ${sortCol === col ? 'text-primary' : 'opacity-40'}`} />}
                          <span className="truncate">{label}</span>
                          {align !== 'right' && <SortIcon className={`w-3.5 h-3.5 shrink-0 ${sortCol === col ? 'text-primary' : 'opacity-40'}`} />}
                        </button>
                      ) : (
                        <span className="truncate">{label}</span>
                      )}
                      {filterCol && (
                        isFilterOpen ? (
                          <span className="font-normal inline-flex items-center gap-0.5 min-w-0" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} draggable={false}>
                            {renderClientFilter(filterCol)}
                            <button onClick={() => toggleFilterCol(filterCol)} title="Fermer le filtre" className="p-0.5 rounded hover:bg-muted/80 text-muted-foreground/60 shrink-0"><X className="w-3 h-3" /></button>
                          </span>
                        ) : (
                          <button
                            onClick={() => toggleFilterCol(filterCol)}
                            title="Filtrer"
                            className={`p-0.5 rounded hover:bg-muted/80 transition-colors shrink-0 ${hasFilter ? 'text-primary' : 'text-muted-foreground/25 hover:text-muted-foreground/60'}`}
                          >
                            <Filter className="w-3 h-3" />
                          </button>
                        )
                      )}
                    </div>
                    <ColResizeHandle {...cCols.resizeHandleProps(key)} />
                  </th>
                );
              })}
              <th className="px-4 py-2 sticky top-0 z-10 bg-muted"></th>
            </tr>
          </thead>
          <tbody>
            {sortedFiltered.map(c => {
              const contacts = c.contacts || [];
              const renderC = (key: ClientColKey) => {
                const ws = cCols.widthStyle(key);
                const trunc = ws ? ' truncate' : '';
                switch (key) {
                  case 'societe': return <td style={ws} className={`px-4 py-3${trunc}`}><p className="font-semibold truncate">{c.societe || c.nom}</p>{c.adresse && <p className="text-xs text-muted-foreground truncate">{c.adresse}</p>}{c.estRevendeur && <Badge variant="secondary" className="mt-0.5 text-[10px] px-1.5 py-0">Revendeur</Badge>}</td>;
                  case 'contacts': return <td style={ws} className="px-4 py-3">{contacts.length > 0 ? (
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
                    <div className="text-xs space-y-0.5">{c.nom && <p className="font-medium">{c.nom}</p>}{c.email && <p className="text-muted-foreground">{c.email}</p>}{c.telephone && <p className="text-muted-foreground">{c.telephone}</p>}</div>
                  ) : <span className="text-xs text-muted-foreground">—</span>}</td>;
                  case 'ville': return <td style={ws} className="px-4 py-3 text-muted-foreground text-xs">{c.ville && <p className="truncate">{c.ville}</p>}{c.codePostal && <p className="text-muted-foreground/70">{c.codePostal}</p>}</td>;
                  case 'adresses': return <td style={ws} className="px-4 py-3">{(c.adressesLivraison?.length || 0) > 0 ? (
                    <button onClick={e => { e.stopPropagation(); setExpandedClient(expandedClient === c.id ? null : c.id); }} className="flex items-center gap-1 text-primary hover:underline text-xs">
                      <MapPin className="w-3 h-3" />{c.adressesLivraison.length} adresse{c.adressesLivraison.length > 1 ? 's' : ''}{expandedClient === c.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  ) : <span className="text-xs text-muted-foreground">—</span>}</td>;
                  case 'devis': return <td style={ws} className="px-4 py-3">{(() => {
                    const clientDevis = devis.filter(d => d.clientId === c.id);
                    if (clientDevis.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
                    return <button onClick={e => { e.stopPropagation(); navigate(`/devis?search=${encodeURIComponent(c.societe || c.nom)}`); }} className="flex items-center gap-1 text-primary hover:underline text-xs"><FileText className="w-3 h-3" />{clientDevis.length} devis</button>;
                  })()}</td>;
                  case 'encours': return <td style={ws} className="px-4 py-3 text-right">{(() => {
                    const encours = encoursDuParClient[c.id];
                    const montantDu = encours?.montant || 0;
                    const montantDepasse = (encours?.echeances.filter(e => new Date(e.date) < new Date()) || []).reduce((s, e) => s + e.montant, 0);
                    if (montantDu === 0) return <span className="text-muted-foreground text-xs">—</span>;
                    return <div><span className="font-medium text-xs">{formatMontant(montantDu)}</span>{montantDepasse > 0 && <div className="text-xs text-destructive font-medium">{formatMontant(montantDepasse)} échu</div>}</div>;
                  })()}</td>;
                  default: return <td style={ws} className="px-4 py-3" />;
                }
              };
              return (
                <Fragment key={c.id}>
                  <tr className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => openEdit(c)}>
                    {cCols.ordered(CLIENT_COLS).map(col => <Fragment key={col.key}>{renderC(col.key)}</Fragment>)}
                    <td className="px-2 py-2">
                      <div className="flex justify-end" onClick={e => e.stopPropagation()}>
                        <RowActionsMenu actions={[
                          { icon: <Edit2 className="w-4 h-4" />, label: 'Modifier', onClick: () => openEdit(c) },
                          { icon: <Trash2 className="w-4 h-4" />, label: 'Supprimer', onClick: () => confirmRemove(c.id), danger: true },
                        ]} />
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
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
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
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open && !editingClient) {
          // Fermeture via X / Échap / fond — auto-save si une société est saisie
          const ok = save(true);
          if (ok) toast.info('Nouveau client sauvegardé automatiquement', { duration: 3000 });
        }
        setDialogOpen(open);
        if (!open) { setShowAdresseForm(false); setEditingAdresse(null); }
      }}>
        <DialogContent mobileFullscreen className="sm:w-[90vw] sm:max-w-[90vw] sm:max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClient ? 'Modifier le client' : 'Nouveau client'}</DialogTitle>
          </DialogHeader>

          {/* Onglets */}
          <div className="flex gap-1 border-b border-border -mt-2 mb-2">
            <button type="button" onClick={() => setClientDialogTab('infos')} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${clientDialogTab === 'infos' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Infos</button>
            <button type="button" onClick={() => setClientDialogTab('comptabilite')} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${clientDialogTab === 'comptabilite' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Comptabilité</button>
            {editingClient && <button type="button" onClick={() => setClientDialogTab('crm')} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${clientDialogTab === 'crm' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>CRM</button>}
          </div>

          {/* ── Onglet CRM ──────────────────────────────────────────────────── */}
          {editingClient && clientDialogTab === 'crm' && (() => {
            const clientDevis = devis.filter(d => d.clientId === editingClient.id);
            const acceptes = clientDevis.filter(d => d.statut === 'accepté');
            const archives = clientDevis.filter(d => d.statut === 'archivé');
            const enCours = clientDevis.filter(d => ['brouillon', 'envoyé'].includes(d.statut));
            const total = acceptes.length + archives.length;
            const tauxTransfo = total > 0 ? Math.round(acceptes.length / total * 100) : null;
            const clientActions = crmActions.filter(a => a.clientId === editingClient.id).sort((a, b) => (b.datePlanifiee || b.createdAt) > (a.datePlanifiee || a.createdAt) ? 1 : -1);

            // Agrégation raisons d'archivage
            const raisonsCount: Record<string, number> = {};
            archives.forEach(d => { if (d.archiveRaison) raisonsCount[d.archiveRaison] = (raisonsCount[d.archiveRaison] || 0) + 1; });

            // Produits dans les devis acceptés vs archivés
            const produitsAcceptes: Record<string, number> = {};
            const produitsArchives: Record<string, number> = {};
            acceptes.forEach(d => d.lignes.filter(l => l.produitId && (!l.type || l.type === 'ligne')).forEach(l => { produitsAcceptes[l.produitId!] = (produitsAcceptes[l.produitId!] || 0) + 1; }));
            archives.forEach(d => d.lignes.filter(l => l.produitId && (!l.type || l.type === 'ligne')).forEach(l => { produitsArchives[l.produitId!] = (produitsArchives[l.produitId!] || 0) + 1; }));

            return (
              <div className="space-y-5 py-2">
                {/* Actions CRM */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm">Actions CRM</h3>
                    <Button size="sm" variant="outline" onClick={() => setCrmActionDialogOpen(true)}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Nouvelle action
                    </Button>
                  </div>
                  {clientActions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune action CRM pour ce client.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {clientActions.map(action => (
                        <div key={action.id} className="flex items-start gap-2 p-2.5 rounded-lg border border-border bg-card">
                          <span className="text-base">{TYPE_CRM_ACTION[action.type]?.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-medium">{action.titre}</p>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUT_CRM_ACTION[action.statut]?.color}`}>{STATUT_CRM_ACTION[action.statut]?.label}</span>
                            </div>
                            {action.datePlanifiee && <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarClock className="w-3 h-3" />{formatDate(action.datePlanifiee)}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Historique devis */}
                <div>
                  <h3 className="font-semibold text-sm mb-2">Historique devis</h3>
                  <div className="flex gap-3 mb-3 flex-wrap">
                    <div className="flex items-center gap-1.5 text-sm"><CheckCircle2 className="w-4 h-4 text-success" /><span>{acceptes.length} accepté(s)</span></div>
                    <div className="flex items-center gap-1.5 text-sm"><Clock className="w-4 h-4 text-info" /><span>{enCours.length} en cours</span></div>
                    <div className="flex items-center gap-1.5 text-sm"><XCircle className="w-4 h-4 text-destructive" /><span>{archives.length} archivé(s)</span></div>
                    {tauxTransfo !== null && (
                      <div className="flex items-center gap-1.5 text-sm font-semibold"><TrendingUp className="w-4 h-4 text-primary" /><span className="text-primary">{tauxTransfo}% de transformation</span></div>
                    )}
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {clientDevis.filter(d => d.statut !== 'système').sort((a, b) => b.dateCreation.localeCompare(a.dateCreation)).map(d => {
                      const tot = calculerTotalDevis(d.lignes, d.fraisPortHT || 0, d.fraisPortTVA ?? 20);
                      const statutColor = d.statut === 'accepté' ? 'text-success' : d.statut === 'archivé' ? 'text-muted-foreground' : d.statut === 'envoyé' ? 'text-info' : 'text-muted-foreground';
                      return (
                        <div key={d.id} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                          <span className="font-mono">{d.numero}</span>
                          <span className="text-muted-foreground">{formatDate(d.dateCreation)}</span>
                          <span className={`font-medium ${statutColor}`}>{d.statut}</span>
                          {d.statut === 'archivé' && d.archiveRaison && <span className="text-muted-foreground">· {RAISON_ARCHIVE[d.archiveRaison]?.label}</span>}
                          <span className="font-semibold">{formatMontant(tot.totalHT)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Raisons de refus */}
                {Object.keys(raisonsCount).length > 0 && (
                  <div>
                    <h3 className="font-semibold text-sm mb-2">Raisons d'archivage</h3>
                    <div className="flex flex-wrap gap-2">
                      {(Object.entries(raisonsCount) as [import('@/lib/store').RaisonArchive, number][]).map(([raison, count]) => (
                        <span key={raison} className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${RAISON_ARCHIVE[raison]?.color || 'bg-muted text-muted-foreground'}`}>
                          {RAISON_ARCHIVE[raison]?.label} <span className="font-bold">×{count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Produits devisés vs commandés */}
                {(Object.keys(produitsAcceptes).length > 0 || Object.keys(produitsArchives).length > 0) && (
                  <div>
                    <h3 className="font-semibold text-sm mb-2">Produits devisés</h3>
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {[...new Set([...Object.keys(produitsAcceptes), ...Object.keys(produitsArchives)])].map(produitId => {
                        const prod = produits.find(p => p.id === produitId);
                        if (!prod) return null;
                        const gains = produitsAcceptes[produitId] || 0;
                        const pertes = produitsArchives[produitId] || 0;
                        return (
                          <div key={produitId} className="flex items-center gap-2 text-xs py-1">
                            <span className="flex-1 truncate font-medium">{prod.description}</span>
                            {gains > 0 && <span className="text-success flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" />{gains}</span>}
                            {pertes > 0 && <span className="text-destructive flex items-center gap-0.5"><XCircle className="w-3 h-3" />{pertes}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Onglet Comptabilité ─────────────────────────────────────────── */}
          {clientDialogTab === 'comptabilite' && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">N° SIRET</Label>
                  <Input className="h-8 text-sm font-mono" value={form.siret || ''} onChange={e => setForm(prev => ({ ...prev, siret: e.target.value }))} placeholder="00000000000000" maxLength={14} />
                </div>
                <div>
                  <Label className="text-xs">TVA intracommunautaire</Label>
                  <div className="flex gap-1">
                    <Input className="h-8 text-sm font-mono" value={form.tvaIntra || ''} onChange={e => setForm(prev => ({ ...prev, tvaIntra: e.target.value }))} placeholder="FR00000000000" />
                    {form.siret && (() => {
                      const siren = (form.siret || '').replace(/\s/g, '').substring(0, 9);
                      if (!/^\d{9}$/.test(siren)) return null;
                      const key = (12 + 3 * (parseInt(siren, 10) % 97)) % 97;
                      const calc = `FR${String(key).padStart(2, '0')}${siren}`;
                      if (calc === form.tvaIntra) return null;
                      return (
                        <button type="button" title="Calculer depuis SIRET" className="h-8 px-2 rounded border border-dashed border-primary/40 text-xs text-primary hover:bg-primary/10" onClick={() => setForm(prev => ({ ...prev, tvaIntra: calc }))}>
                          Calc.
                        </button>
                      );
                    })()}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Code APE / NAF</Label>
                  <Input className="h-8 text-sm font-mono" value={form.codeApe || ''} onChange={e => setForm(prev => ({ ...prev, codeApe: e.target.value }))} placeholder="43.33Z" />
                </div>
                <div>
                  <Label className="text-xs">Libellé activité</Label>
                  <Input className="h-8 text-sm" value={form.libelleApe || ''} onChange={e => setForm(prev => ({ ...prev, libelleApe: e.target.value }))} placeholder="Travaux de revêtement…" />
                </div>
                <div>
                  <Label className="text-xs">Forme juridique</Label>
                  <Input className="h-8 text-sm" value={form.formeJuridique || ''} onChange={e => setForm(prev => ({ ...prev, formeJuridique: e.target.value }))} placeholder="SAS, SARL, EURL…" />
                </div>
                <div>
                  <Label className="text-xs">Capital social</Label>
                  <Input className="h-8 text-sm" value={form.capitalSocial || ''} onChange={e => setForm(prev => ({ ...prev, capitalSocial: e.target.value }))} placeholder="10 000 €" />
                </div>
                <div>
                  <Label className="text-xs">RCS</Label>
                  <Input className="h-8 text-sm" value={form.rcs || ''} onChange={e => setForm(prev => ({ ...prev, rcs: e.target.value }))} placeholder="RCS Paris B 000 000 000" />
                </div>
                <div>
                  <Label className="text-xs">Effectif</Label>
                  <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm" value={form.trancheEffectif || ''} onChange={e => setForm(prev => ({ ...prev, trancheEffectif: e.target.value }))}>
                    <option value="">— Inconnu —</option>
                    {Object.entries(EFFECTIF_LABELS).map(([k, v]) => <option key={k} value={k}>{v} salarié{k === '00' ? '' : 's'}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Date création entreprise</Label>
                  <Input className="h-8 text-sm" type="date" value={form.dateCreationEntreprise || ''} onChange={e => setForm(prev => ({ ...prev, dateCreationEntreprise: e.target.value }))} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground italic">Ces informations peuvent être pré-remplies via la recherche entreprise (onglet Infos).</p>
            </div>
          )}

          {/* ── Onglet Infos (form) ─────────────────────────────────────────── */}
          <div className={clientDialogTab !== 'infos' ? 'hidden' : ''}>

          {/* Zone IA — extraction automatique des coordonnées */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => { setIaOpen(o => !o); setIaText(''); }}
              >
                <Bot className="w-3.5 h-3.5 mr-1.5" /> Claude IA — remplir depuis texte / email
              </Button>
              {!editingClient && (
                <Button variant="outline" size="sm" className="border-dashed text-muted-foreground hover:text-foreground" onClick={() => setEmailDialogOpen(true)}>
                  <Mail className="w-3.5 h-3.5 mr-1.5" /> Email
                </Button>
              )}
            </div>
            {iaOpen && (
              <div
                className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-3 space-y-2"
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  // Fichier image déposé
                  const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = ev => {
                      const dataUrl = ev.target?.result as string;
                      setIaImage({ base64: dataUrl.split(',')[1], mimeType: file.type, previewUrl: dataUrl });
                      setIaText('');
                    };
                    reader.readAsDataURL(file);
                    return;
                  }
                  const text = e.dataTransfer.getData('text/plain');
                  if (text?.trim()) { setIaText(text.trim()); setIaImage(null); }
                }}
              >
                <p className="text-xs text-muted-foreground">Collez texte, email, signature — ou capture d'écran (Ctrl+V)</p>

                {iaImage ? (
                  <div className="relative">
                    <img src={iaImage.previewUrl} alt="capture" className="w-full max-h-48 object-contain rounded border border-border bg-white" />
                    <button
                      type="button"
                      onClick={() => setIaImage(null)}
                      className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 hover:bg-destructive/10 text-destructive"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <textarea
                    autoFocus
                    className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                    rows={4}
                    value={iaText}
                    onChange={e => setIaText(e.target.value)}
                    onPaste={handleIaPaste}
                    placeholder="Ex: CS ROUTE — Hugo Dias Da Silva&#10;91 Rue de la Madeleine, 22200 Grâces&#10;direction.csroute@gmail.com · 06 12 34 56 78"
                  />
                )}

                <Button
                  size="sm"
                  className="w-full"
                  disabled={(!iaText.trim() && !iaImage) || iaLoading}
                  onClick={extractClientFromIA}
                >
                  {iaLoading ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Extraction…</> : <><Bot className="w-3.5 h-3.5 mr-1.5" /> Extraire les coordonnées</>}
                </Button>
              </div>
            )}
          </div>

          {/* Zone recherche entreprise — API recherche-entreprises.api.gouv.fr */}
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full border-dashed text-muted-foreground hover:text-foreground"
              onClick={() => { setSiretOpen(o => !o); setSiretResults([]); setSiretQuery(''); }}
            >
              <Building2 className="w-3.5 h-3.5 mr-1.5" /> Rechercher une société (SIRET / raison sociale)
            </Button>
            {siretOpen && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    className="h-8 text-sm flex-1"
                    placeholder="Nom, SIRET, SIREN…"
                    value={siretQuery}
                    onChange={e => setSiretQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') searchEntreprise(); }}
                  />
                  <Button size="sm" className="h-8 px-3" disabled={!siretQuery.trim() || siretLoading} onClick={searchEntreprise}>
                    {siretLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                {siretResults.length > 0 && (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                    {siretResults.map(e => {
                      const solv = getSolvabilite(e);
                      const adresseAffichee = [e.siege.numero_voie, e.siege.type_voie, e.siege.libelle_voie].filter(Boolean).join(' ') || e.siege.adresse || '';
                      const ageAns = e.date_creation
                        ? Math.floor((Date.now() - new Date(e.date_creation).getTime()) / (1000 * 3600 * 24 * 365))
                        : null;
                      return (
                        <button
                          key={e.siren}
                          type="button"
                          onClick={() => importEntreprise(e)}
                          className="w-full text-left rounded-lg border border-border bg-background hover:bg-accent/50 px-3 py-2 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm leading-tight truncate">{e.nom_complet}{e.sigle ? ` (${e.sigle})` : ''}</p>
                              {adresseAffichee && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                  {adresseAffichee}{e.siege.code_postal ? `, ${e.siege.code_postal}` : ''}{e.siege.libelle_commune ? ` ${e.siege.libelle_commune}` : ''}
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                                {e.siege.siret && <span className="text-[10px] text-muted-foreground font-mono">SIRET {e.siege.siret}</span>}
                                {e.activite_principale && <span className="text-[10px] text-muted-foreground">APE {e.activite_principale}</span>}
                                {ageAns !== null && <span className="text-[10px] text-muted-foreground">{ageAns} an{ageAns > 1 ? 's' : ''}</span>}
                                {e.tranche_effectif_salarie && EFFECTIF_LABELS[e.tranche_effectif_salarie] && (
                                  <span className="text-[10px] text-muted-foreground">{EFFECTIF_LABELS[e.tranche_effectif_salarie]} sal.</span>
                                )}
                              </div>
                            </div>
                            <div className="flex-shrink-0 flex flex-col items-end gap-1">
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: solv.color + '22', color: solv.color }}>
                                {'★'.repeat(solv.score) + '☆'.repeat(5 - solv.score)}
                              </span>
                              <span className="text-[9px]" style={{ color: solv.color }}>{solv.label}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {!siretLoading && siretResults.length === 0 && siretQuery && (
                  <p className="text-xs text-muted-foreground text-center py-2">Aucun résultat — modifiez votre recherche</p>
                )}
                <p className="text-[10px] text-muted-foreground text-center">Source : données.gouv.fr — indicateur de solvabilité basé sur l'ancienneté et l'effectif</p>
              </div>
            )}
          </div>

          <div className="grid gap-3 py-2">
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
                <Input type="text" value={form.adresse} onChange={e => setForm(prev => ({ ...prev, adresse: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Ville</Label>
                  <Input type="text" value={form.ville} onChange={e => setForm(prev => ({ ...prev, ville: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Code postal</Label>
                  <Input type="text" value={form.codePostal} onChange={e => setForm(prev => ({ ...prev, codePostal: e.target.value }))} className="h-8 text-sm" />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs">Notes</Label>
              <textarea
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                rows={2}
                value={form.notes}
                onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            {/* Conditions de règlement */}
            <div className="border-t border-border pt-3">
              <Label className="text-sm font-semibold text-muted-foreground">Conditions de règlement</Label>
              <div className="mt-2">
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-9"
                  value={form.delaiReglement || '45J FDM'}
                  onChange={e => setForm(prev => ({ ...prev, delaiReglement: e.target.value }))}
                >
                  {DELAI_REGLEMENT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground italic">
                  {DELAI_REGLEMENT_OPTIONS.find(o => o.value === (form.delaiReglement || '45J FDM'))?.conditions}
                </p>
              </div>
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
                  <div className="grid grid-cols-2 gap-2">
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
          </div>{/* end infos tab wrapper */}
          <div className="sticky bottom-0 bg-background flex justify-end gap-2 pt-3 pb-1 border-t border-border mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            {(clientDialogTab === 'infos' || clientDialogTab === 'comptabilite') && <Button onClick={save}>{editingClient ? 'Modifier' : 'Ajouter'}</Button>}
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

      {/* CRM Action Dialog (from client CRM tab) */}
      <CRMActionDialog
        open={crmActionDialogOpen}
        onOpenChange={setCrmActionDialogOpen}
        action={null}
        clients={clients}
        produits={produits.map(p => ({ id: p.id, reference: p.reference, description: p.description }))}
        defaultClientId={editingClient?.id}
        onSave={async (a) => { const err = await addCrmAction(a); return err ?? null; }}
      />
    </div>
  );
}
