import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { parseExcel } from '@/lib/parseExcel';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  Building2, Package, FileText, Plus, Trash2, Pencil, X, Search, Download, Upload, Check,
  Mail, Globe, Phone, User, BarChart3, Filter, ArrowUpDown, ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight, Settings, Loader2, MoreHorizontal, LayoutList, Table2,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { useConcurrents, formatCreateur } from '@/lib/concurrents';
import { useCRM } from '@/lib/StoreContext';
import { formatMontant } from '@/lib/store';
import ConcurrentDialog from '@/components/ConcurrentDialog';
import type { Concurrent } from '@/lib/concurrents';
import { supabase } from '@/integrations/supabase/client';
import { useTableColumns } from '@/hooks/useTableColumns';
import ColResizeHandle from '@/components/ColResizeHandle';
import RowActionsMenu from '@/components/RowActionsMenu';
import PageHeaderSlot from '@/components/PageHeaderSlot';

// ── Export helpers ────────────────────────────────────────────────────────────

export function exportVeilleExcel(
  concurrents: Concurrent[],
  produits: ReturnType<typeof useConcurrents>['produits'],
  notes: ReturnType<typeof useConcurrents>['notes'],
) {
  const wb = XLSX.utils.book_new();
  const concMap = Object.fromEntries(concurrents.map(c => [c.id, c.nom]));

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(concurrents.map(c => ({
    'Nom': c.nom, 'Site web': c.siteWeb || '', 'Notes': c.notes || '',
    'Créé par': c.createdByEmail || '', 'Date': c.createdAt,
  }))), 'Concurrents');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(produits.map(p => ({
    'Concurrent': concMap[p.concurrentId] || '', 'Produit': p.nom,
    'Référence': p.reference || '', 'Catégorie': p.categorie || '',
    'Quantité': p.quantite != null ? p.quantite : '',
    'Prix HT': p.prixHT != null ? p.prixHT : '', 'Description': p.description || '',
    'Saisi par': p.createdByEmail || '', 'Date': p.createdAt,
  }))), 'Produits concurrents');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(notes.map(n => ({
    'Concurrent': concMap[n.concurrentId] || '', 'Date note': n.dateNote,
    'Titre': n.titre, 'Contenu': n.contenu || '',
    'Source': n.source || '', 'Saisi par': n.createdByEmail || '',
  }))), 'Notes');

  XLSX.writeFile(wb, `VeilleConcurrence_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function exportByEmail(
  concurrents: Concurrent[],
  produits: ReturnType<typeof useConcurrents>['produits'],
  notes: ReturnType<typeof useConcurrents>['notes'],
) {
  const wb = XLSX.utils.book_new();
  const concMap = Object.fromEntries(concurrents.map(c => [c.id, c.nom]));

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(concurrents.map(c => ({
    'Nom': c.nom, 'Site web': c.siteWeb || '', 'Créé par': c.createdByEmail || '',
  }))), 'Concurrents');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(produits.map(p => ({
    'Concurrent': concMap[p.concurrentId] || '', 'Produit': p.nom,
    'Catégorie': p.categorie || '', 'Quantité': p.quantite != null ? p.quantite : '',
    'Prix HT': p.prixHT != null ? p.prixHT : '',
    'Saisi par': p.createdByEmail || '',
  }))), 'Produits');

  const xlsxData = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const fileName = `VeilleConcurrence_${new Date().toISOString().split('T')[0]}.xlsx`;
  const boundary = `----=_Part_${Date.now()}`;
  const subject = `Veille Concurrence — Export ${new Date().toLocaleDateString('fr-FR')}`;

  const emlContent = [
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    `Subject: ${subject}`, 'X-Unsent: 1', '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8', '',
    `Bonjour,\n\nVeuillez trouver ci-joint l'export de la veille concurrence au ${new Date().toLocaleDateString('fr-FR')}.\n\nCordialement`,
    '',
    `--${boundary}`,
    `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="${fileName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${fileName}"`, '',
    xlsxData, '',
    `--${boundary}--`,
  ].join('\r\n');

  const blob = new Blob([emlContent], { type: 'message/rfc822' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `VeilleConcurrence_${new Date().toISOString().split('T')[0]}.eml`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success('Fichier email généré — ouvrez-le avec Outlook ou Thunderbird');
}

// ── Import tarif IA ──────────────────────────────────────────────────────────

interface ExtractedProduit {
  _id: string;
  nom: string;
  reference: string;
  categorie: string;
  prixHT: string;
  description: string;
  selected: boolean;
}

const IMPORT_PROMPT = `Extrais toutes les lignes produit/article/prestation de ce document avec leur prix.
Retourne un JSON array (uniquement, sans markdown) : [{"nom":"...","reference":"...","categorie":"...","prixHT":"...","description":"..."}]
Si un champ est absent, utilise une chaîne vide. prixHT doit être un nombre décimal (ex: "12.50").`;

async function callTarifAI(texte: string): Promise<ExtractedProduit[]> {
  const body = { model: '', messages: [{ role: 'user', content: `${IMPORT_PROMPT}\n\n${texte.slice(0, 12000)}` }], max_tokens: 2000, temperature: 0.1 };

  const groqKey = import.meta.env.VITE_GROQ_API_KEY;
  if (groqKey) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({ ...body, model: 'llama-3.1-70b-versatile' }),
      });
      const d = await r.json();
      const text = d.choices?.[0]?.message?.content || '';
      return JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || '[]');
    } catch { /* fallthrough */ }
  }

  const gemKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (gemKey) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${gemKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: `${IMPORT_PROMPT}\n\n${texte.slice(0, 12000)}` }] }] }),
      });
      const d = await r.json();
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || '[]');
    } catch { /* fallthrough */ }
  }

  const orKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (orKey) {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orKey}` },
      body: JSON.stringify({ ...body, model: 'mistralai/mistral-7b-instruct' }),
    });
    const d = await r.json();
    const text = d.choices?.[0]?.message?.content || '';
    return JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || '[]');
  }

  throw new Error('Aucune clé API configurée (VITE_GROQ_API_KEY, VITE_GEMINI_API_KEY ou VITE_OPENROUTER_API_KEY)');
}

async function extractTarifText(file: File): Promise<string> {
  if (file.name.match(/\.(xlsx?|csv|ods)$/i)) {
    const { texte } = await parseExcel(file);
    return texte;
  }
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => item.str).join(' '));
  }
  return pages.join('\n\n');
}

// ── Composant principal (sans wrapper de scroll) ──────────────────────────────
// Utilisé tel quel dans CRM.tsx ; wrappé dans un scroll container pour la page dédiée.

export function VeilleContent({ embedded = false }: { embedded?: boolean } = {}) {
  const {
    concurrents, produits, notes, loading,
    addConcurrent, updateConcurrent, deleteConcurrent,
    addProduit, updateProduit, deleteProduit,
    addNote, updateNote, deleteNote,
  } = useConcurrents();

  const { produits: produitsCatalogue, clients } = useCRM();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConcurrent, setEditingConcurrent] = useState<Concurrent | undefined>(undefined);

  // Nom d'affichage
  const [myEmail, setMyEmail] = useState<string>('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) setMyEmail(session.user.email);
    });
  }, []);

  const [searchConc, setSearchConc] = useState('');
  const [filterCreateur, setFilterCreateur] = useState('');
  const [filterConcNote, setFilterConcNote] = useState('');
  const [filterCreateurNote, setFilterCreateurNote] = useState('');
  // Onglet actif (contrôlé) — sert à afficher la bascule de vue uniquement sur Produits
  const [veilleTab, setVeilleTab] = useState('fiches');
  // ── Vue tableau Produits : tri + filtres inline par colonne + colonnes visibles ──
  type PCol = 'concurrent' | 'produit' | 'reference' | 'categorie' | 'quantite' | 'prixHT' | 'description' | 'clientSource' | 'informateur' | 'date';
  const [prodSort, setProdSort] = useState<{ col: PCol; dir: 'asc' | 'desc' } | null>(null);
  // Mode d'affichage produits (tableau / liste) — défaut liste sur mobile
  const [prodView, setProdViewState] = useState<'tableau' | 'liste'>(() => {
    try { const v = localStorage.getItem('veille_prod_view'); if (v === 'liste' || v === 'tableau') return v; } catch { /* ignore */ }
    return typeof window !== 'undefined' && window.innerWidth < 768 ? 'liste' : 'tableau';
  });
  function setProdView(v: 'tableau' | 'liste') {
    setProdViewState(v);
    try { localStorage.setItem('veille_prod_view', v); } catch { /* ignore */ }
  }
  const [prodColFilters, setProdColFilters] = useState<Partial<Record<PCol, string>>>({});
  const [prodOpenFilter, setProdOpenFilter] = useState<PCol | null>(null);
  const PROD_COLS: { key: PCol; label: string }[] = [
    { key: 'concurrent', label: 'Concurrent' },
    { key: 'produit', label: 'Produit' },
    { key: 'reference', label: 'Référence' },
    { key: 'categorie', label: 'Catégorie' },
    { key: 'quantite', label: 'Quantité' },
    { key: 'prixHT', label: 'Prix HT' },
    { key: 'description', label: 'Description' },
    { key: 'clientSource', label: 'Client source' },
    { key: 'informateur', label: 'Saisi par' },
    { key: 'date', label: 'Date' },
  ];
  const DEFAULT_PROD_VIS: PCol[] = ['concurrent', 'produit', 'reference', 'categorie', 'quantite', 'prixHT', 'description', 'clientSource', 'informateur', 'date'];
  // Largeur (resize) + ordre (drag) des colonnes, persistés (veille_prod_table_*)
  const prodCols = useTableColumns<PCol>('veille_prod_table', DEFAULT_PROD_VIS);
  const [prodVisCols, setProdVisCols] = useState<Set<PCol>>(() => {
    try {
      const s = localStorage.getItem('veille_prod_cols');
      if (s) {
        const set = new Set(JSON.parse(s) as PCol[]);
        set.add('quantite'); // nouvelle colonne : la rendre visible chez les utilisateurs existants
        return set;
      }
    } catch { /* ignore */ }
    return new Set(DEFAULT_PROD_VIS);
  });
  const toggleProdCol = (k: PCol) => setProdVisCols(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); try { localStorage.setItem('veille_prod_cols', JSON.stringify([...n])); } catch { /* ignore */ } return n; });
  const [prodGearOpen, setProdGearOpen] = useState(false);
  const prodGearRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!prodGearOpen) return;
    const h = (e: MouseEvent) => { if (prodGearRef.current && !prodGearRef.current.contains(e.target as Node)) setProdGearOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [prodGearOpen]);
  // Panneau admin de renommage global (catégories / informateurs)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pivotMode, setPivotMode] = useState<'categorie' | 'concurrent'>('categorie');
  const [addProdOpen, setAddProdOpen] = useState(false);
  const [editingProdId, setEditingProdId] = useState<string | null>(null);
  const [addProdForm, setAddProdForm] = useState({ concurrentId: '', nom: '', reference: '', categorie: '', quantite: '', prixHT: '', description: '', clientId: '', clientNom: '', informateur: '', dateRenseignement: '' });
  const [addProdSaving, setAddProdSaving] = useState(false);
  // Si un concurrent est créé depuis le dialog produit, l'auto-sélectionner.
  const prevConcIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (addProdOpen && !addProdForm.concurrentId) {
      const added = concurrents.find(c => !prevConcIdsRef.current.has(c.id));
      if (added) setAddProdForm(f => ({ ...f, concurrentId: added.id }));
    }
    prevConcIdsRef.current = new Set(concurrents.map(c => c.id));
  }, [concurrents, addProdOpen, addProdForm.concurrentId]);
  const [showAddNomSuggestions, setShowAddNomSuggestions] = useState(false);

  // Import tarif
  const [importOpen, setImportOpen] = useState(false);
  const [importConcId, setImportConcId] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedProduit[]>([]);
  const [importError, setImportError] = useState('');
  const [importSaving, setImportSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addNomSuggestions = useMemo(() => {
    const q = addProdForm.nom.trim().toLowerCase();
    // Produits concurrents déjà saisis (en premier) + catalogue produits ISOFLOOR
    const unique = Array.from(new Set([
      ...produits.map(p => p.nom),
      ...produitsCatalogue.map(p => p.description).filter(Boolean) as string[],
    ].filter(Boolean) as string[]));
    // Champ vide → on propose la liste complète (dès le focus) ; sinon on filtre.
    const list = q ? unique.filter(n => n.toLowerCase().includes(q)) : unique;
    return list.slice(0, 10);
  }, [addProdForm.nom, produits, produitsCatalogue]);

  function selectAddNomSuggestion(nom: string) {
    const match = produits.find(p => p.nom === nom);
    const cat = produitsCatalogue.find(p => p.description === nom); // catalogue ISOFLOOR
    setAddProdForm(f => ({
      ...f,
      nom,
      reference: f.reference || match?.reference || cat?.reference || '',
      categorie: f.categorie || match?.categorie || cat?.categorie || '',
    }));
    setShowAddNomSuggestions(false);
  }

  const createurs = useMemo(() => [...new Set([
    ...concurrents.map(c => c.createdByEmail),
    ...produits.map(p => p.createdByEmail),
  ].filter(Boolean) as string[])].sort(), [concurrents, produits]);

  const categories = useMemo(() =>
    [...new Set(produits.map(p => p.categorie).filter(Boolean) as string[])].sort()
  , [produits]);
  // Suggestions « Client source » : clients du CRM + valeurs déjà saisies sur les produits concurrents
  const clientNomsSuggestions = useMemo(() => {
    const fromCrm = clients.map(c => c.societe || c.nom).filter(Boolean) as string[];
    const fromProduits = produits.map(p => p.clientNom).filter(Boolean) as string[];
    return [...new Set([...fromCrm, ...fromProduits])].sort();
  }, [clients, produits]);

  const filteredConcurrents = useMemo(() => {
    let list = concurrents;
    if (searchConc) list = list.filter(c => c.nom.toLowerCase().includes(searchConc.toLowerCase()));
    if (filterCreateur) list = list.filter(c => c.createdByEmail === filterCreateur);
    return list;
  }, [concurrents, searchConc, filterCreateur]);

  // Valeur affichée d'une colonne pour un produit (filtre/tri textuels)
  const prodColValue = (p: typeof produits[number], col: PCol): string => {
    switch (col) {
      case 'concurrent': return concurrents.find(c => c.id === p.concurrentId)?.nom || '';
      case 'produit': return p.nom || '';
      case 'reference': return p.reference || '';
      case 'categorie': return p.categorie || '';
      case 'quantite': return p.quantite != null ? String(p.quantite) : '';
      case 'prixHT': return p.prixHT != null ? String(p.prixHT) : '';
      case 'description': return p.description || '';
      case 'clientSource': return p.clientNom || (clients.find(c => c.id === p.clientId)?.societe || clients.find(c => c.id === p.clientId)?.nom || '');
      case 'informateur': return p.informateur || formatCreateur(p.createdByEmail);
      case 'date': return p.dateRenseignement || p.createdAt || '';
    }
  };
  const filteredProduits = useMemo(() => {
    let list = produits.filter(p => {
      for (const [col, v] of Object.entries(prodColFilters)) {
        if (!v) continue;
        if (!prodColValue(p, col as PCol).toLowerCase().includes(v.toLowerCase())) return false;
      }
      return true;
    });
    if (prodSort) {
      const { col, dir } = prodSort;
      list = [...list].sort((a, b) => {
        let r: number;
        if (col === 'prixHT') r = (a.prixHT ?? Infinity) - (b.prixHT ?? Infinity);
        else if (col === 'quantite') r = (a.quantite ?? Infinity) - (b.quantite ?? Infinity);
        else r = prodColValue(a, col).localeCompare(prodColValue(b, col), 'fr', { numeric: true });
        return dir === 'asc' ? r : -r;
      });
    } else {
      list = [...list].sort((a, b) => (a.categorie || '').localeCompare(b.categorie || '') || a.nom.localeCompare(b.nom));
    }
    return list;
  }, [produits, prodColFilters, prodSort, concurrents, clients]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredNotes = useMemo(() => {
    let list = notes;
    if (filterConcNote) list = list.filter(n => n.concurrentId === filterConcNote);
    if (filterCreateurNote) list = list.filter(n => n.createdByEmail === filterCreateurNote);
    return list;
  }, [notes, filterConcNote, filterCreateurNote]);

  const pivotData = useMemo(() => {
    const concMap = Object.fromEntries(concurrents.map(c => [c.id, c.nom]));
    if (pivotMode === 'categorie') {
      const cats = [...new Set(produits.map(p => p.categorie).filter(Boolean) as string[])].sort();
      const concIds = [...new Set(produits.map(p => p.concurrentId))];
      return {
        rows: cats,
        cols: concIds.map(id => ({ id, label: concMap[id] || id })),
        getCell: (cat: string, concId: string) => produits.filter(p => p.concurrentId === concId && p.categorie === cat),
      };
    } else {
      const concIds = [...new Set(produits.map(p => p.concurrentId))];
      const cats = [...new Set(produits.map(p => p.categorie).filter(Boolean) as string[])].sort();
      return {
        rows: concIds.map(id => ({ id, label: concMap[id] || id })),
        cols: cats.map(c => ({ id: c, label: c })),
        getCell: (row: any, col: any) => {
          const cId = typeof row === 'string' ? row : row.id;
          const cCat = typeof col === 'string' ? col : col.id;
          return produits.filter(p => p.concurrentId === cId && p.categorie === cCat);
        },
      };
    }
  }, [concurrents, produits, pivotMode]);

  function openNew() { setEditingConcurrent(undefined); setDialogOpen(true); }
  function openEdit(c: Concurrent) { setEditingConcurrent(c); setDialogOpen(true); }

  async function handleDelete(c: Concurrent) {
    if (!confirm(`Supprimer "${c.nom}" et toutes ses données ?`)) return;
    const err = await deleteConcurrent(c.id);
    if (err) toast.error('Erreur lors de la suppression');
    else toast.success('Concurrent supprimé');
  }

  function openAddProd() {
    setEditingProdId(null);
    setAddProdForm({
      concurrentId: concurrents[0]?.id || '',
      nom: '', reference: '', categorie: '', quantite: '', prixHT: '', description: '',
      clientId: '', clientNom: '', informateur: formatCreateur(myEmail), dateRenseignement: new Date().toISOString().split('T')[0],
    });
    setAddProdOpen(true);
  }

  function openEditProd(p: ConcurrentProduit) {
    setEditingProdId(p.id);
    setAddProdForm({
      concurrentId: p.concurrentId,
      nom: p.nom,
      reference: p.reference || '',
      categorie: p.categorie || '',
      quantite: p.quantite != null ? String(p.quantite) : '',
      prixHT: p.prixHT != null ? String(p.prixHT) : '',
      description: p.description || '',
      clientId: p.clientId || '',
      clientNom: p.clientNom || '',
      informateur: p.informateur || '',
      dateRenseignement: p.dateRenseignement || '',
    });
    setAddProdOpen(true);
  }

  async function handleAddProd() {
    if (!addProdForm.nom.trim() || !addProdForm.concurrentId) return;
    setAddProdSaving(true);
    const prixHT = addProdForm.prixHT ? parseFloat(addProdForm.prixHT.replace(',', '.')) : undefined;
    const quantite = addProdForm.quantite ? parseFloat(addProdForm.quantite.replace(',', '.')) : undefined;
    if (editingProdId) {
      const existing = produits.find(p => p.id === editingProdId);
      if (existing) {
        await updateProduit({
          ...existing,
          concurrentId: addProdForm.concurrentId,
          nom: addProdForm.nom.trim(),
          reference: addProdForm.reference || undefined,
          categorie: addProdForm.categorie || undefined,
          quantite,
          prixHT,
          description: addProdForm.description || undefined,
          clientId: addProdForm.clientId || undefined,
          clientNom: addProdForm.clientNom || undefined,
          informateur: addProdForm.informateur || undefined,
          dateRenseignement: addProdForm.dateRenseignement || undefined,
        });
      }
      setAddProdSaving(false);
      setAddProdOpen(false);
      toast.success('Produit mis à jour');
      return;
    }
    await addProduit({
      concurrentId: addProdForm.concurrentId,
      nom: addProdForm.nom.trim(),
      reference: addProdForm.reference || undefined,
      categorie: addProdForm.categorie || undefined,
      quantite,
      prixHT,
      description: addProdForm.description || undefined,
      clientNom: addProdForm.clientNom || undefined,
      informateur: addProdForm.informateur || undefined,
      dateRenseignement: addProdForm.dateRenseignement || undefined,
    });
    setAddProdSaving(false);
    setAddProdOpen(false);
    toast.success('Produit ajouté');
  }

  const handleImportFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.match(/\.(pdf|xlsx?|csv|ods)$/i)) {
      setImportError('Format non supporté. Utilisez PDF, Excel ou CSV.');
      return;
    }
    setAnalysing(true);
    setImportError('');
    setExtracted([]);
    try {
      const text = await extractTarifText(file);
      const results = await callTarifAI(text);
      setExtracted(results.map((r, i) => ({ ...r, _id: String(i), selected: true })));
    } catch (e: any) {
      setImportError(e.message || 'Erreur lors de l\'analyse.');
    }
    setAnalysing(false);
  }, []);

  async function importerProduits() {
    const toImport = extracted.filter(p => p.selected);
    if (!importConcId || toImport.length === 0) return;
    setImportSaving(true);
    for (const p of toImport) {
      await addProduit({
        concurrentId: importConcId,
        nom: p.nom,
        reference: p.reference || undefined,
        categorie: p.categorie || undefined,
        prixHT: p.prixHT ? parseFloat(p.prixHT.replace(',', '.')) : undefined,
        description: p.description || undefined,
      });
    }
    setImportSaving(false);
    setImportOpen(false);
    setExtracted([]);
    toast.success(`${toImport.length} produit${toImport.length > 1 ? 's' : ''} importé${toImport.length > 1 ? 's' : ''}`);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  // Onglets + boutons d'action (placés dans le bandeau du haut en mode page)
  const headerControls = (
    <>
      <TabsList className="h-9 hidden sm:inline-flex">
        <TabsTrigger value="fiches" className="flex items-center gap-1">
          <Building2 className="w-3.5 h-3.5" /> Fiches
        </TabsTrigger>
        <TabsTrigger value="produits" className="flex items-center gap-1">
          <Package className="w-3.5 h-3.5" /> Produits
        </TabsTrigger>
        <TabsTrigger value="notes" className="flex items-center gap-1">
          <FileText className="w-3.5 h-3.5" /> Notes
        </TabsTrigger>
        <TabsTrigger value="analyse" className="flex items-center gap-1">
          <BarChart3 className="w-3.5 h-3.5" /> Analyse
        </TabsTrigger>
      </TabsList>
      <div className="flex gap-2 items-center ml-auto flex-wrap justify-end">
        {/* Bascule liste / tableau — uniquement sur l'onglet Produits */}
        {veilleTab === 'produits' && (
          <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
            <button onClick={() => setProdView('liste')} title="Vue liste" className={`flex items-center justify-center px-2.5 h-8 transition-colors ${prodView === 'liste' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
              <LayoutList className="w-4 h-4" />
            </button>
            <button onClick={() => setProdView('tableau')} title="Vue tableau" className={`flex items-center justify-center px-2.5 h-8 transition-colors border-l border-border ${prodView === 'tableau' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
              <Table2 className="w-4 h-4" />
            </button>
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <MoreHorizontal className="w-4 h-4" /> Action
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => exportVeilleExcel(concurrents, produits, notes)}>
              <Download className="w-4 h-4 mr-2 text-muted-foreground" /> Export Excel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportByEmail(concurrents, produits, notes)}>
              <Mail className="w-4 h-4 mr-2 text-muted-foreground" /> Envoi par email
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setImportConcId(concurrents[0]?.id || ''); setExtracted([]); setImportError(''); setImportOpen(true); }}>
              <Upload className="w-4 h-4 mr-2 text-muted-foreground" /> Importer tarif
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" onClick={openAddProd} title="Ajouter (produit ou concurrent)">
          <Plus className="w-4 h-4 mr-1" /> Ajout
        </Button>
      </div>
    </>
  );

  return (
    <div className={embedded ? 'space-y-3' : 'flex flex-col flex-1 min-h-0'}>
      <Tabs value={veilleTab} onValueChange={setVeilleTab} className={embedded ? 'space-y-4' : 'flex flex-col flex-1 min-h-0 gap-3'}>
        {embedded ? (
          /* Mode intégré : onglets + boutons inline (pas de bandeau de page) */
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap flex-none">{headerControls}</div>
        ) : (
          /* Mode page : onglets + boutons portés dans le bandeau du haut (à côté du titre) */
          <PageHeaderSlot>
            <div className="flex-1 flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">{headerControls}</div>
          </PageHeaderSlot>
        )}

        {/* Onglets pleine largeur sur mobile (le bandeau du haut est trop étroit) */}
        <TabsList className="sm:hidden grid grid-cols-4 w-full h-9 flex-none">
          <TabsTrigger value="fiches" className="flex items-center justify-center gap-1 text-xs"><Building2 className="w-3.5 h-3.5" /> Fiches</TabsTrigger>
          <TabsTrigger value="produits" className="flex items-center justify-center gap-1 text-xs"><Package className="w-3.5 h-3.5" /> Produits</TabsTrigger>
          <TabsTrigger value="notes" className="flex items-center justify-center gap-1 text-xs"><FileText className="w-3.5 h-3.5" /> Notes</TabsTrigger>
          <TabsTrigger value="analyse" className="flex items-center justify-center gap-1 text-xs"><BarChart3 className="w-3.5 h-3.5" /> Analyse</TabsTrigger>
        </TabsList>

        {/* ── Fiches Concurrents ── */}
        <TabsContent value="fiches" className={embedded ? 'space-y-3 pt-3' : 'flex-1 min-h-0 overflow-y-auto space-y-3 pt-1 mt-0'}>
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Rechercher..." value={searchConc} onChange={e => setSearchConc(e.target.value)} />
            </div>
            <Select value={filterCreateur || '_all'} onValueChange={v => setFilterCreateur(v === '_all' ? '' : v)}>
              <SelectTrigger className="w-52">
                <User className="w-4 h-4 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Tous les créateurs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Tous les créateurs</SelectItem>
                {createurs.map(e => <SelectItem key={e} value={e}>{formatCreateur(e)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {filteredConcurrents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Aucun concurrent enregistré</p>
              <Button className="mt-3" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Ajouter le premier concurrent</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredConcurrents.map(c => {
                const nbProduits = produits.filter(p => p.concurrentId === c.id).length;
                const nbNotes = notes.filter(n => n.concurrentId === c.id).length;
                const isOpen = expanded[c.id];
                const cProduits = produits.filter(p => p.concurrentId === c.id);
                const cNotes = notes.filter(n => n.concurrentId === c.id);
                return (
                  <div key={c.id} className="border rounded-lg bg-card">
                    <div className="flex items-center justify-between p-3 gap-2">
                      <button
                        className="flex items-center gap-2 flex-1 text-left min-w-0"
                        onClick={() => setExpanded(prev => ({ ...prev, [c.id]: !prev[c.id] }))}
                      >
                        {isOpen ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
                        <span className="font-semibold">{c.nom}</span>
                        <Badge variant="secondary" className="text-xs">{nbProduits} produit{nbProduits > 1 ? 's' : ''}</Badge>
                        <Badge variant="outline" className="text-xs">{nbNotes} note{nbNotes > 1 ? 's' : ''}</Badge>
                      </button>
                      <div className="flex items-center gap-3 shrink-0">
                        {c.siteWeb && <a href={c.siteWeb.startsWith('http') ? c.siteWeb : `https://${c.siteWeb}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-500 hover:text-blue-700"><Globe className="w-4 h-4" /></a>}
                        <span className="text-xs text-muted-foreground hidden sm:block">{formatCreateur(c.createdByEmail)}</span>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="px-4 pb-3 border-t pt-3 space-y-3">
                        {c.notes && <p className="text-sm text-muted-foreground">{c.notes}</p>}
                        {cProduits.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Produits</p>
                            <div className="flex flex-wrap gap-1">
                              {cProduits.map(p => (
                                <Badge key={p.id} variant="secondary" className="text-xs">
                                  {p.nom}{p.categorie && ` · ${p.categorie}`}{p.prixHT != null && ` · ${formatMontant(p.prixHT)} €`}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {cNotes.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Dernières notes</p>
                            <div className="space-y-1">
                              {cNotes.slice(0, 3).map(n => (
                                <div key={n.id} className="text-sm flex items-start gap-2">
                                  <span className="text-muted-foreground text-xs shrink-0">{n.dateNote}</span>
                                  <span className="font-medium">{n.titre}</span>
                                  {n.contenu && <span className="text-muted-foreground truncate">{n.contenu}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Produits Concurrents ── */}
        <TabsContent value="produits" className={embedded ? 'space-y-3 pt-3' : 'flex-1 min-h-0 flex flex-col gap-2 pt-1 mt-0'}>
          <div className="flex items-center justify-between gap-2 flex-wrap flex-none">
            {/* Barre filtres actifs (les filtres/tri sont dans les en-têtes de colonnes) */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {Object.entries(prodColFilters).filter(([, v]) => v).map(([col, v]) => (
                <span key={col} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                  {PROD_COLS.find(c => c.key === col)?.label} : {v}
                  <button onClick={() => setProdColFilters(f => { const n = { ...f }; delete n[col as PCol]; return n; })}><X className="w-3 h-3" /></button>
                </span>
              ))}
              {Object.values(prodColFilters).some(Boolean) && (
                <button onClick={() => setProdColFilters({})} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"><X className="w-3 h-3" /> Effacer</button>
              )}
            </div>
          </div>
          {filteredProduits.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Aucun produit concurrent trouvé</p>
            </div>
          ) : prodView === 'liste' ? (
            /* ── Vue liste (cartes) ── */
            <div className={embedded ? '' : 'flex-1 min-h-0 overflow-y-auto'}>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProduits.map(p => {
                  const conc = concurrents.find(c => c.id === p.concurrentId);
                  const sourceClient = clients.find(c => c.id === p.clientId);
                  return (
                    <div
                      key={p.id}
                      className="relative rounded-xl border border-border bg-card p-3.5 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                      onClick={() => openEditProd(p)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold leading-tight truncate">{p.nom}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{conc?.nom || '—'}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="font-semibold text-primary whitespace-nowrap">{p.prixHT != null ? `${formatMontant(p.prixHT)} €` : '—'}</span>
                          <div onClick={e => e.stopPropagation()}>
                            <RowActionsMenu actions={[
                              { icon: <Pencil className="w-3.5 h-3.5" />, label: 'Modifier', onClick: () => openEditProd(p) },
                              { icon: <Trash2 className="w-3.5 h-3.5" />, label: 'Supprimer', danger: true, onClick: async () => { if (!confirm(`Supprimer "${p.nom}" ?`)) return; await deleteProduit(p.id); toast.success('Produit supprimé'); } },
                            ]} />
                          </div>
                        </div>
                      </div>
                      {(p.categorie || p.quantite != null || p.reference) && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {p.categorie && <Badge variant="outline" className="text-[10px]">{p.categorie}</Badge>}
                          {p.quantite != null && <Badge variant="secondary" className="text-[10px]">Qté : {p.quantite}</Badge>}
                          {p.reference && <span className="text-[10px] font-mono text-muted-foreground">{p.reference}</span>}
                        </div>
                      )}
                      {p.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{p.description}</p>}
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-[11px] text-muted-foreground">
                        {(p.clientNom || sourceClient) && <span>📍 {p.clientNom || (sourceClient ? (sourceClient.societe || sourceClient.nom) : '')}</span>}
                        <span>👤 {p.informateur || formatCreateur(p.createdByEmail)}</span>
                        <span className="ml-auto">{p.dateRenseignement ? new Date(p.dateRenseignement + 'T00:00:00').toLocaleDateString('fr-FR') : p.createdAt}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className={embedded ? 'rounded-lg border overflow-hidden' : 'flex-1 min-h-0 rounded-lg border overflow-hidden flex flex-col'}>
              <datalist id="veille-categories-list">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
              <Table containerClassName={embedded ? undefined : 'flex-1 min-h-0'}>
                <TableHeader>
                  <TableRow>
                    {prodCols.ordered(PROD_COLS, k => prodVisCols.has(k)).map(c => {
                      const sorted = prodSort?.col === c.key;
                      const hasFilter = !!prodColFilters[c.key];
                      const isOpen = prodOpenFilter === c.key;
                      const SortIcon = sorted ? (prodSort!.dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
                      const suggestions = c.key === 'categorie' ? categories : c.key === 'clientSource' ? clientNomsSuggestions : c.key === 'informateur' ? createurs.map(formatCreateur) : [];
                      const isDragOver = prodCols.dragOverKey === c.key && prodCols.dragKey !== c.key;
                      return (
                        <TableHead key={c.key} {...prodCols.thProps(c.key)} style={prodCols.widthStyle(c.key)} className={`relative select-none cursor-grab active:cursor-grabbing sticky top-0 z-10 ${c.key === 'prixHT' ? 'text-right' : ''} ${prodCols.dragKey === c.key ? 'opacity-40' : ''} ${isDragOver ? 'bg-primary/10' : 'bg-muted'}`}>
                          {isDragOver && <span className="absolute top-0 left-0 h-full w-0.5 bg-primary z-20" />}
                          <div className={`flex items-center gap-0.5 ${c.key === 'prixHT' ? 'justify-end' : ''} ${prodCols.widthStyle(c.key) ? 'overflow-hidden' : ''}`}>
                            <button onClick={() => setProdSort(s => s?.col === c.key ? (s.dir === 'asc' ? { col: c.key, dir: 'desc' } : null) : { col: c.key, dir: 'asc' })} className="flex items-center gap-1 hover:text-foreground min-w-0">
                              <span className="truncate">{c.label}</span>
                              <SortIcon className={`w-3 h-3 shrink-0 ${sorted ? 'text-primary' : 'opacity-40'}`} />
                            </button>
                            {isOpen ? (
                              <span className="inline-flex items-center gap-0.5" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} draggable={false}>
                                <Input list={suggestions.length ? `vprod-sugg-${c.key}` : undefined} autoFocus value={prodColFilters[c.key] || ''} onChange={e => setProdColFilters(f => ({ ...f, [c.key]: e.target.value }))} placeholder="Filtrer…" className="h-6 text-xs w-28" onKeyDown={e => { if (e.key === 'Escape') { setProdColFilters(f => { const n = { ...f }; delete n[c.key]; return n; }); setProdOpenFilter(null); } }} />
                                {suggestions.length > 0 && <datalist id={`vprod-sugg-${c.key}`}>{suggestions.map(s => <option key={s} value={s} />)}</datalist>}
                                <button onClick={() => setProdOpenFilter(null)} className="p-0.5 text-muted-foreground/60 hover:text-foreground shrink-0"><X className="w-3 h-3" /></button>
                              </span>
                            ) : (
                              <button onClick={() => setProdOpenFilter(c.key)} title="Filtrer" className={`p-0.5 rounded hover:bg-muted/80 shrink-0 ${hasFilter ? 'text-primary' : 'text-muted-foreground/30 hover:text-muted-foreground/60'}`}><Filter className="w-3 h-3" /></button>
                            )}
                          </div>
                          <ColResizeHandle {...prodCols.resizeHandleProps(c.key)} />
                        </TableHead>
                      );
                    })}
                    <TableHead className="w-12 relative sticky top-0 z-10 bg-muted">
                      <div className="relative" ref={prodGearRef}>
                        <button onClick={() => setProdGearOpen(o => !o)} title="Colonnes affichées" className="p-1.5 rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground transition-colors">
                          <Settings className="w-4 h-4" />
                        </button>
                        {prodGearOpen && (
                          <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-xl p-3 min-w-44 text-left font-normal">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Colonnes affichées</p>
                            {PROD_COLS.map(c => (
                              <label key={c.key} className="flex items-center gap-2 py-1 cursor-pointer text-sm hover:text-foreground text-muted-foreground">
                                <input type="checkbox" checked={prodVisCols.has(c.key)} onChange={() => toggleProdCol(c.key)} className="rounded accent-primary w-3.5 h-3.5" />
                                {c.label}
                              </label>
                            ))}
                            <button onClick={() => prodCols.reset()} className="mt-2 pt-2 border-t border-border w-full text-left text-xs text-muted-foreground hover:text-foreground">↺ Réinitialiser ordre & largeurs</button>
                          </div>
                        )}
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProduits.map(p => {
                    const conc = concurrents.find(c => c.id === p.concurrentId);
                    const sourceClient = clients.find(c => c.id === p.clientId);
                    const cellFor = (col: PCol) => {
                      switch (col) {
                        case 'concurrent': return <TableCell key={col} style={prodCols.widthStyle(col)} className="font-medium">{conc?.nom || '—'}</TableCell>;
                        case 'produit': return <TableCell key={col} style={prodCols.widthStyle(col)}><div className="font-medium">{p.nom}</div></TableCell>;
                        case 'reference': return <TableCell key={col} style={prodCols.widthStyle(col)} className="font-mono text-xs">{p.reference || '—'}</TableCell>;
                        case 'categorie': return <TableCell key={col} style={prodCols.widthStyle(col)}>{p.categorie ? <Badge variant="outline" className="text-xs">{p.categorie}</Badge> : '—'}</TableCell>;
                        case 'quantite': return <TableCell key={col} style={prodCols.widthStyle(col)} className="text-right tabular-nums">{p.quantite != null ? p.quantite : '—'}</TableCell>;
                        case 'prixHT': return <TableCell key={col} style={prodCols.widthStyle(col)} className="text-right font-semibold">{p.prixHT != null ? `${formatMontant(p.prixHT)} €` : '—'}</TableCell>;
                        case 'description': return <TableCell key={col} style={prodCols.widthStyle(col)} className="text-sm text-muted-foreground max-w-40 truncate">{p.description || '—'}</TableCell>;
                        case 'clientSource': return <TableCell key={col} style={prodCols.widthStyle(col)} className="text-xs text-muted-foreground">{p.clientNom || (sourceClient ? (sourceClient.societe || sourceClient.nom) : '—')}</TableCell>;
                        case 'informateur': return <TableCell key={col} style={prodCols.widthStyle(col)} className="text-xs text-muted-foreground">{p.informateur || formatCreateur(p.createdByEmail)}</TableCell>;
                        case 'date': return <TableCell key={col} style={prodCols.widthStyle(col)} className="text-xs text-muted-foreground">{p.dateRenseignement ? new Date(p.dateRenseignement + 'T00:00:00').toLocaleDateString('fr-FR') : p.createdAt}</TableCell>;
                      }
                    };
                    return (
                      <TableRow key={p.id} className="group cursor-pointer hover:bg-muted/30" onClick={() => openEditProd(p)}>
                        {prodCols.ordered(PROD_COLS, k => prodVisCols.has(k)).map(c => cellFor(c.key))}
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Button size="icon" variant="ghost" className="h-9 w-9 sm:h-6 sm:w-6 text-destructive opacity-100 sm:opacity-0 group-hover:opacity-100"
                            onClick={async () => {
                              if (!confirm(`Supprimer "${p.nom}" ?`)) return;
                              await deleteProduit(p.id);
                              toast.success('Produit supprimé');
                            }}>
                            <Trash2 className="w-4 h-4 sm:w-3 sm:h-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Notes ── */}
        <TabsContent value="notes" className={embedded ? 'space-y-3 pt-3' : 'flex-1 min-h-0 overflow-y-auto space-y-3 pt-1 mt-0'}>
          <div className="flex gap-2 flex-wrap">
            <Select value={filterConcNote || '_all'} onValueChange={v => setFilterConcNote(v === '_all' ? '' : v)}>
              <SelectTrigger className="w-48">
                <Building2 className="w-4 h-4 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Tous les concurrents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Tous les concurrents</SelectItem>
                {concurrents.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCreateurNote || '_all'} onValueChange={v => setFilterCreateurNote(v === '_all' ? '' : v)}>
              <SelectTrigger className="w-52">
                <User className="w-4 h-4 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Tous les créateurs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Tous les créateurs</SelectItem>
                {createurs.map(e => <SelectItem key={e} value={e}>{formatCreateur(e)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {filteredNotes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Aucune note de veille trouvée</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredNotes.map(n => {
                const conc = concurrents.find(c => c.id === n.concurrentId);
                return (
                  <div key={n.id} className="border rounded-lg p-3 bg-card text-sm space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{n.titre}</span>
                        {conc && <Badge variant="secondary" className="text-xs">{conc.nom}</Badge>}
                        {n.source && <Badge variant="outline" className="text-xs">{n.source}</Badge>}
                        <span className="text-muted-foreground text-xs">{n.dateNote}</span>
                      </div>
                      <Button size="sm" variant="outline" className="text-xs h-6 shrink-0"
                        onClick={() => { setEditingConcurrent(conc); setDialogOpen(true); }}>
                        <Pencil className="w-3 h-3 mr-1" /> Modifier
                      </Button>
                    </div>
                    {n.contenu && <p className="text-muted-foreground whitespace-pre-wrap">{n.contenu}</p>}
                    <p className="text-xs text-muted-foreground">Par {formatCreateur(n.createdByEmail)} · {n.createdAt}</p>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Analyse Pivot ── */}
        <TabsContent value="analyse" className={embedded ? 'space-y-4 pt-3' : 'flex-1 min-h-0 overflow-y-auto space-y-4 pt-1 mt-0'}>
          <div className="flex gap-2">
            <Button size="sm" variant={pivotMode === 'categorie' ? 'default' : 'outline'} onClick={() => setPivotMode('categorie')}>
              Catégories × Concurrents
            </Button>
            <Button size="sm" variant={pivotMode === 'concurrent' ? 'default' : 'outline'} onClick={() => setPivotMode('concurrent')}>
              Concurrents × Catégories
            </Button>
          </div>

          {produits.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Ajoutez des produits concurrents pour afficher l'analyse</p>
            </div>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {pivotMode === 'categorie' ? 'Prix moyen par catégorie et concurrent' : 'Prix moyen par concurrent et catégorie'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  {pivotMode === 'categorie' ? (
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="px-3 py-2 text-left font-medium sticky left-0 bg-muted/40 min-w-36">Catégorie</th>
                          {pivotData.cols.map((col: any) => (
                            <th key={col.id} className="px-3 py-2 text-center font-medium min-w-28">{col.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(pivotData.rows as string[]).map(row => (
                          <tr key={row} className="border-b hover:bg-muted/20">
                            <td className="px-3 py-2 font-medium sticky left-0 bg-background">{row}</td>
                            {pivotData.cols.map((col: any) => {
                              const ps = pivotData.getCell(row, col.id);
                              const withPrice = ps.filter((p: any) => p.prixHT != null);
                              const avg = withPrice.length > 0 ? withPrice.reduce((s: number, p: any) => s + p.prixHT, 0) / withPrice.length : null;
                              return (
                                <td key={col.id} className="px-3 py-2 text-center">
                                  {ps.length === 0 ? <span className="text-muted-foreground">—</span> : (
                                    <div>
                                      {avg != null && <div className="font-semibold text-green-700">{formatMontant(avg)} €</div>}
                                      <div className="text-xs text-muted-foreground">{ps.length} produit{ps.length > 1 ? 's' : ''}</div>
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="px-3 py-2 text-left font-medium sticky left-0 bg-muted/40 min-w-36">Concurrent</th>
                          {(pivotData.cols as any[]).map(col => (
                            <th key={col.id} className="px-3 py-2 text-center font-medium min-w-28">{col.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(pivotData.rows as any[]).map(row => (
                          <tr key={row.id} className="border-b hover:bg-muted/20">
                            <td className="px-3 py-2 font-medium sticky left-0 bg-background">{row.label}</td>
                            {(pivotData.cols as any[]).map(col => {
                              const ps = pivotData.getCell(row, col);
                              const withPrice = ps.filter((p: any) => p.prixHT != null);
                              const avg = withPrice.length > 0 ? withPrice.reduce((s: number, p: any) => s + p.prixHT, 0) / withPrice.length : null;
                              return (
                                <td key={col.id} className="px-3 py-2 text-center">
                                  {ps.length === 0 ? <span className="text-muted-foreground">—</span> : (
                                    <div>
                                      {avg != null && <div className="font-semibold text-green-700">{formatMontant(avg)} €</div>}
                                      <div className="text-xs text-muted-foreground">{ps.length} produit{ps.length > 1 ? 's' : ''}</div>
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Récapitulatif par concurrent</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {concurrents.map(c => {
                    const cProd = produits.filter(p => p.concurrentId === c.id);
                    const cNotes = notes.filter(n => n.concurrentId === c.id);
                    const cats = [...new Set(cProd.map(p => p.categorie).filter(Boolean))];
                    const prixList = cProd.filter(p => p.prixHT != null).map(p => p.prixHT!);
                    const avgPrix = prixList.length > 0 ? prixList.reduce((a, b) => a + b, 0) / prixList.length : null;
                    return (
                      <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openEdit(c)}>
                        <CardContent className="pt-4 pb-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{c.nom}</span>
                            {c.siteWeb && <Globe className="w-3.5 h-3.5 text-muted-foreground" />}
                          </div>
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            <div>{cProd.length} produit{cProd.length > 1 ? 's' : ''} · {cNotes.length} note{cNotes.length > 1 ? 's' : ''}</div>
                            {avgPrix != null && <div>Prix moyen : <span className="font-semibold text-green-700">{formatMontant(avgPrix)} €</span></div>}
                          </div>
                          {cats.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {cats.slice(0, 3).map(cat => <Badge key={cat} variant="outline" className="text-xs h-4">{cat as string}</Badge>)}
                              {cats.length > 3 && <Badge variant="secondary" className="text-xs h-4">+{cats.length - 3}</Badge>}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog — Importer tarif */}
      <Dialog open={importOpen} onOpenChange={v => { if (!analysing) setImportOpen(v); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Importer un tarif concurrent</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4">
            <div className="space-y-1.5">
              <Label>Concurrent *</Label>
              <Select value={importConcId} onValueChange={setImportConcId}>
                <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                <SelectContent>{concurrents.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {extracted.length === 0 && !analysing && (
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
                onDragEnter={e => { e.preventDefault(); dragCounter.current++; setDragOver(true); }}
                onDragOver={e => e.preventDefault()}
                onDragLeave={() => { dragCounter.current--; if (dragCounter.current === 0) setDragOver(false); }}
                onDrop={e => { e.preventDefault(); dragCounter.current = 0; setDragOver(false); handleImportFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">Glissez votre tarif ici</p>
                <p className="text-sm text-muted-foreground mt-1">PDF, Excel (.xlsx, .xls), CSV — analyse IA automatique</p>
                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv,.ods" onChange={e => handleImportFiles(e.target.files)} />
              </div>
            )}

            {analysing && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Analyse du document en cours…</p>
              </div>
            )}

            {importError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3 text-sm text-destructive">
                {importError}
                <button className="ml-2 underline" onClick={() => setImportError('')}>Réessayer</button>
              </div>
            )}

            {extracted.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{extracted.filter(p => p.selected).length} / {extracted.length} produits sélectionnés</p>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setExtracted(e => e.map(p => ({ ...p, selected: true })))}>Tout</Button>
                    <Button variant="ghost" size="sm" onClick={() => setExtracted(e => e.map(p => ({ ...p, selected: false })))}>Aucun</Button>
                    <Button variant="ghost" size="sm" onClick={() => { setExtracted([]); setImportError(''); }}>
                      <X className="h-4 w-4 mr-1" />Recommencer
                    </Button>
                  </div>
                </div>
                <div className="border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b sticky top-0">
                      <tr>
                        <th className="w-10 px-3 py-2" />
                        <th className="text-left px-3 py-2 font-medium">Nom</th>
                        <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Référence</th>
                        <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Catégorie</th>
                        <th className="text-right px-3 py-2 font-medium">Prix HT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {extracted.map(p => (
                        <tr key={p._id} className={p.selected ? '' : 'opacity-40'}>
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={p.selected} onChange={e => setExtracted(ex => ex.map(x => x._id === p._id ? { ...x, selected: e.target.checked } : x))} className="rounded" />
                          </td>
                          <td className="px-3 py-2">
                            <Input value={p.nom} onChange={e => setExtracted(ex => ex.map(x => x._id === p._id ? { ...x, nom: e.target.value } : x))} className="h-7 text-xs" />
                          </td>
                          <td className="px-3 py-2 hidden sm:table-cell">
                            <Input value={p.reference} onChange={e => setExtracted(ex => ex.map(x => x._id === p._id ? { ...x, reference: e.target.value } : x))} className="h-7 text-xs" />
                          </td>
                          <td className="px-3 py-2 hidden md:table-cell">
                            <Input value={p.categorie} onChange={e => setExtracted(ex => ex.map(x => x._id === p._id ? { ...x, categorie: e.target.value } : x))} className="h-7 text-xs" />
                          </td>
                          <td className="px-3 py-2">
                            <Input value={p.prixHT} onChange={e => setExtracted(ex => ex.map(x => x._id === p._id ? { ...x, prixHT: e.target.value } : x))} className="h-7 text-xs text-right w-24 ml-auto" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importSaving}>Annuler</Button>
            {extracted.length > 0 && (
              <Button onClick={importerProduits} disabled={importSaving || !importConcId || extracted.filter(p => p.selected).length === 0}>
                {importSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                <Check className="h-4 w-4" />
                Importer {extracted.filter(p => p.selected).length} produit{extracted.filter(p => p.selected).length > 1 ? 's' : ''}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog — Ajouter / Modifier produit */}
      <Dialog open={addProdOpen} onOpenChange={o => { setAddProdOpen(o); if (!o) setEditingProdId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProdId ? 'Modifier le produit' : 'Ajouter un produit concurrent'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Concurrent *</Label>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary hover:text-primary" onClick={() => { setImportConcId(addProdForm.concurrentId || concurrents[0]?.id || ''); setExtracted([]); setImportError(''); setImportOpen(true); }} title="Importer un tarif (PDF/Excel)">
                    <Upload className="w-3.5 h-3.5" /> Importer tarif
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary hover:text-primary" onClick={openNew} title="Créer un nouveau concurrent">
                    <Plus className="w-3.5 h-3.5" /> Concurrent
                  </Button>
                </div>
              </div>
              <Select value={addProdForm.concurrentId} onValueChange={v => setAddProdForm(f => ({ ...f, concurrentId: v }))}>
                <SelectTrigger><SelectValue placeholder={concurrents.length === 0 ? 'Aucun concurrent — cliquez sur + Concurrent' : 'Choisir un concurrent…'} /></SelectTrigger>
                <SelectContent>{concurrents.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 relative">
              <Label>Nom *</Label>
              <Input
                value={addProdForm.nom}
                onChange={e => { setAddProdForm(f => ({ ...f, nom: e.target.value })); setShowAddNomSuggestions(true); }}
                onFocus={() => setShowAddNomSuggestions(true)}
                onBlur={() => setTimeout(() => setShowAddNomSuggestions(false), 150)}
                placeholder="Nom du produit…"
                autoFocus
                autoComplete="off"
              />
              {showAddNomSuggestions && addNomSuggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-md overflow-hidden">
                  {addNomSuggestions.map(nom => {
                    const match = produits.find(p => p.nom === nom);
                    return (
                      <button
                        key={nom}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between gap-2"
                        onMouseDown={() => selectAddNomSuggestion(nom)}
                      >
                        <span className="font-medium truncate">{nom}</span>
                        {match?.categorie && <span className="text-xs text-muted-foreground shrink-0">{match.categorie}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Référence</Label>
                <Input value={addProdForm.reference} onChange={e => setAddProdForm(f => ({ ...f, reference: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Catégorie</Label>
                <Input list="veille-categories-add" value={addProdForm.categorie} onChange={e => setAddProdForm(f => ({ ...f, categorie: e.target.value }))} placeholder="Choisir ou saisir…" />
                <datalist id="veille-categories-add">
                  {categories.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantité</Label>
                <Input type="number" step="any" value={addProdForm.quantite} onChange={e => setAddProdForm(f => ({ ...f, quantite: e.target.value }))} placeholder="Ex : 1, 25, 1000…" />
              </div>
              <div className="space-y-1.5">
                <Label>Prix HT (€)</Label>
                <Input type="number" step="0.01" value={addProdForm.prixHT} onChange={e => setAddProdForm(f => ({ ...f, prixHT: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={addProdForm.description} onChange={e => setAddProdForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Source du prix</p>
              <div className="space-y-1.5">
                <Label>Date de renseignement</Label>
                <Input type="date" value={addProdForm.dateRenseignement} onChange={e => setAddProdForm(f => ({ ...f, dateRenseignement: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Client source</Label>
                  <Input list="veille-clients-add" value={addProdForm.clientNom} onChange={e => setAddProdForm(f => ({ ...f, clientNom: e.target.value }))} placeholder="Nom du client" />
                  <datalist id="veille-clients-add">
                    {clientNomsSuggestions.map(n => <option key={n} value={n} />)}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label>Informateur</Label>
                  <Input value={addProdForm.informateur} onChange={e => setAddProdForm(f => ({ ...f, informateur: e.target.value }))} placeholder="Qui a renseigné ?" />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddProdOpen(false); setEditingProdId(null); }}>Annuler</Button>
            <Button onClick={handleAddProd} disabled={addProdSaving || !addProdForm.nom.trim() || !addProdForm.concurrentId}>
              {addProdSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editingProdId ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Panneau admin : renommage global catégories / informateurs ── */}
      <ConcurrentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        concurrent={editingConcurrent}
        produits={produits}
        notes={notes}
        produitsCatalogue={produitsCatalogue}
        clients={clients}
        onSaveConcurrent={addConcurrent}
        onUpdateConcurrent={updateConcurrent}
        onAddProduit={addProduit}
        onUpdateProduit={updateProduit}
        onDeleteProduit={deleteProduit}
        onAddNote={addNote}
        onUpdateNote={updateNote}
        onDeleteNote={deleteNote}
      />
    </div>
  );
}

// ── Page dédiée (avec wrapper scroll) ─────────────────────────────────────────

export default function VeilleConcurrence() {
  return (
    <div style={{ height: 'calc(100vh - 4rem)' }} className="flex flex-col -m-4 md:-m-6">
      <div className="flex-1 min-h-0 flex flex-col px-4 md:px-6 py-4">
        <VeilleContent />
      </div>
    </div>
  );
}
