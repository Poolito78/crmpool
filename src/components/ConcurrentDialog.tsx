import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, Save, X, Building2, Package, FileText, Upload, Loader2, CheckSquare, Square, FileSpreadsheet, FileText as FilePdf } from 'lucide-react';
import { toast } from 'sonner';
import type { Concurrent, ConcurrentProduit, ConcurrentNote } from '@/lib/concurrents';
import { formatCreateur } from '@/lib/concurrents';
import type { Produit, Client } from '@/lib/store';
import { formatMontant } from '@/lib/store';
import { parseExcel } from '@/lib/parseExcel';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface Props {
  open: boolean;
  onClose: () => void;
  concurrent?: Concurrent;
  produits: ConcurrentProduit[];
  notes: ConcurrentNote[];
  produitsCatalogue: Produit[];
  clients?: Client[];
  onSaveConcurrent: (c: Omit<Concurrent, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'createdByEmail'>) => Promise<Concurrent | null>;
  onUpdateConcurrent: (c: Concurrent) => Promise<any>;
  onAddProduit: (p: Omit<ConcurrentProduit, 'id' | 'createdAt' | 'createdBy' | 'createdByEmail'>) => Promise<ConcurrentProduit | null>;
  onUpdateProduit: (p: ConcurrentProduit) => Promise<any>;
  onDeleteProduit: (id: string) => Promise<any>;
  onAddNote: (n: Omit<ConcurrentNote, 'id' | 'createdAt' | 'createdBy' | 'createdByEmail'>) => Promise<ConcurrentNote | null>;
  onUpdateNote: (n: ConcurrentNote) => Promise<any>;
  onDeleteNote: (id: string) => Promise<any>;
}

interface ExtractedProduit {
  _id: string;
  nom: string;
  reference: string;
  categorie: string;
  prixHT: string;
  description: string;
  selected: boolean;
}

const emptyForm = { nom: '', siteWeb: '', notes: '' };
const emptyProduit = { nom: '', reference: '', categorie: '', prixHT: '', description: '', clientId: '' };
const emptyNote = { titre: '', contenu: '', source: '', dateNote: new Date().toISOString().split('T')[0] };

const PROMPT_TARIF = `Tu es un assistant spécialisé dans l'extraction de données tarifaires depuis des documents commerciaux (tarifs, catalogues, listes de prix, devis concurrents).

Extrais toutes les lignes produit/article avec leurs prix. Réponds UNIQUEMENT avec un tableau JSON valide, sans texte autour :

[
  {
    "nom": "désignation complète du produit",
    "reference": "référence/code article ou null",
    "categorie": "famille ou catégorie produit ou null",
    "prixHT": nombre décimal ou null,
    "description": "conditionnement, unité, remarques ou null"
  }
]

Si aucun produit avec prix n'est trouvé, retourne [].
Les prix doivent être des nombres (pas de chaîne). Ignore les totaux, les frais de port et les remises générales.`;

async function extraireTextePDF(buffer: ArrayBuffer): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => item.str).join(' '));
  }
  return pages.join('\n');
}

function tronquer(t: string, max = 6000) {
  return t.length <= max ? t : t.slice(0, max) + '\n[... tronqué ...]';
}

async function callAI(texte: string): Promise<ExtractedProduit[]> {
  const groqKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  const openrouterKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined;

  function parseResponse(text: string): ExtractedProduit[] | null {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return null;
    try {
      const arr = JSON.parse(match[0]);
      if (!Array.isArray(arr)) return null;
      return arr
        .filter((p: any) => p.nom)
        .map((p: any) => ({
          _id: crypto.randomUUID(),
          nom: String(p.nom || ''),
          reference: String(p.reference || ''),
          categorie: String(p.categorie || ''),
          prixHT: p.prixHT != null ? String(p.prixHT) : '',
          description: String(p.description || ''),
          selected: true,
        }));
    } catch { return null; }
  }

  const messages = [
    { role: 'system', content: PROMPT_TARIF },
    { role: 'user', content: `Document :\n${texte}` },
  ];

  // 1. Groq
  if (groqKey) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({ model: 'llama-3.1-8b-instant', temperature: 0, max_tokens: 2048, messages }),
      });
      if (r.ok) {
        const data = await r.json();
        const result = parseResponse(data.choices?.[0]?.message?.content ?? '');
        if (result) return result;
      }
    } catch { /* fallthrough */ }
  }

  // 2. Gemini
  if (geminiKey) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: PROMPT_TARIF }] },
            contents: [{ role: 'user', parts: [{ text: `Document :\n${texte}` }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 2048 },
          }),
        }
      );
      if (r.ok) {
        const data = await r.json();
        const result = parseResponse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
        if (result) return result;
      }
    } catch { /* fallthrough */ }
  }

  // 3. OpenRouter
  if (openrouterKey) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openrouterKey}` },
        body: JSON.stringify({ model: 'meta-llama/llama-4-scout:free', temperature: 0, max_tokens: 2048, messages }),
      });
      if (r.ok) {
        const data = await r.json();
        const result = parseResponse(data.choices?.[0]?.message?.content ?? '');
        if (result) return result;
      }
    } catch { /* fallthrough */ }
  }

  throw new Error('Aucun fournisseur IA disponible. Vérifiez vos clés API (VITE_GROQ_API_KEY, VITE_GEMINI_API_KEY).');
}

export default function ConcurrentDialog({
  open, onClose, concurrent,
  produits, notes, produitsCatalogue, clients = [],
  onSaveConcurrent, onUpdateConcurrent,
  onAddProduit, onUpdateProduit, onDeleteProduit,
  onAddNote, onUpdateNote, onDeleteNote,
}: Props) {
  const isEdit = !!concurrent;

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const [produitForm, setProduitForm] = useState(emptyProduit);
  const [editingProduit, setEditingProduit] = useState<ConcurrentProduit | null>(null);
  const [showProduitForm, setShowProduitForm] = useState(false);

  const [noteForm, setNoteForm] = useState(emptyNote);
  const [editingNote, setEditingNote] = useState<ConcurrentNote | null>(null);
  const [showNoteForm, setShowNoteForm] = useState(false);

  // ── Drag-and-drop analyse tarif ──────────────────────────────────────────
  const [isDragOver, setIsDragOver] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedProduit[]>([]);
  const [importing, setImporting] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = [...new Set([
    ...produitsCatalogue.map(p => p.categorie),
    ...produits.map(p => p.categorie),
  ].filter(Boolean))].sort() as string[];

  const concurrentId = concurrent?.id ?? savedId;
  const localProduits = produits.filter(p => p.concurrentId === concurrentId);
  const localNotes = notes.filter(n => n.concurrentId === concurrentId);

  useEffect(() => {
    if (open) {
      setForm(concurrent ? {
        nom: concurrent.nom,
        siteWeb: concurrent.siteWeb || '',
        notes: concurrent.notes || '',
      } : emptyForm);
      setSavedId(null);
      setShowProduitForm(false);
      setShowNoteForm(false);
      setProduitForm(emptyProduit);
      setNoteForm({ ...emptyNote, dateNote: new Date().toISOString().split('T')[0] });
      setExtracted([]);
    }
  }, [open, concurrent]);

  async function handleSaveInfos() {
    if (!form.nom.trim()) { toast.error('Le nom du concurrent est requis'); return; }
    setSaving(true);
    if (isEdit && concurrent) {
      await onUpdateConcurrent({ ...concurrent, nom: form.nom, siteWeb: form.siteWeb || undefined, notes: form.notes || undefined });
      toast.success('Concurrent mis à jour');
    } else {
      const created = await onSaveConcurrent({ nom: form.nom, siteWeb: form.siteWeb || undefined, notes: form.notes || undefined });
      if (created) { setSavedId(created.id); toast.success('Concurrent créé'); }
    }
    setSaving(false);
  }

  async function handleSaveProduit() {
    if (!produitForm.nom.trim()) { toast.error('Le nom du produit est requis'); return; }
    if (!concurrentId) { toast.error('Enregistrez d\'abord les infos du concurrent'); return; }
    const prixHT = produitForm.prixHT ? parseFloat(produitForm.prixHT.replace(',', '.')) : undefined;
    if (editingProduit) {
      await onUpdateProduit({ ...editingProduit, nom: produitForm.nom, reference: produitForm.reference || undefined, categorie: produitForm.categorie || undefined, prixHT, description: produitForm.description || undefined, clientId: produitForm.clientId || undefined });
    } else {
      await onAddProduit({ concurrentId: concurrentId!, nom: produitForm.nom, reference: produitForm.reference || undefined, categorie: produitForm.categorie || undefined, prixHT, description: produitForm.description || undefined, clientId: produitForm.clientId || undefined });
    }
    setProduitForm(emptyProduit);
    setEditingProduit(null);
    setShowProduitForm(false);
  }

  function startEditProduit(p: ConcurrentProduit) {
    setEditingProduit(p);
    setProduitForm({ nom: p.nom, reference: p.reference || '', categorie: p.categorie || '', prixHT: p.prixHT != null ? String(p.prixHT) : '', description: p.description || '', clientId: p.clientId || '' });
    setShowProduitForm(true);
  }

  async function handleSaveNote() {
    if (!noteForm.titre.trim()) { toast.error('Le titre de la note est requis'); return; }
    if (!concurrentId) { toast.error('Enregistrez d\'abord les infos du concurrent'); return; }
    if (editingNote) {
      await onUpdateNote({ ...editingNote, titre: noteForm.titre, contenu: noteForm.contenu || undefined, source: noteForm.source || undefined, dateNote: noteForm.dateNote });
    } else {
      await onAddNote({ concurrentId: concurrentId!, titre: noteForm.titre, contenu: noteForm.contenu || undefined, source: noteForm.source || undefined, dateNote: noteForm.dateNote });
    }
    setNoteForm({ titre: '', contenu: '', source: '', dateNote: new Date().toISOString().split('T')[0] });
    setEditingNote(null);
    setShowNoteForm(false);
  }

  function startEditNote(n: ConcurrentNote) {
    setEditingNote(n);
    setNoteForm({ titre: n.titre, contenu: n.contenu || '', source: n.source || '', dateNote: n.dateNote });
    setShowNoteForm(true);
  }

  // ── Document analysis ─────────────────────────────────────────────────────

  async function analyserFichier(file: File) {
    if (!concurrentId) {
      toast.error('Enregistrez d\'abord les infos du concurrent avant d\'importer un tarif');
      return;
    }
    const isExcel = /\.(xlsx|xls|csv|ods)$/i.test(file.name);
    const isPdf = /\.pdf$/i.test(file.name);
    if (!isExcel && !isPdf) {
      toast.error('Format non supporté — utilisez un PDF ou un fichier Excel (.xlsx, .xls, .csv)');
      return;
    }

    setAnalyzing(true);
    setExtracted([]);
    try {
      let texte = '';
      if (isExcel) {
        const result = await parseExcel(file);
        texte = tronquer(result.texte);
      } else {
        const buffer = await file.arrayBuffer();
        texte = tronquer(await extraireTextePDF(buffer));
      }
      const results = await callAI(texte);
      if (results.length === 0) {
        toast.info('Aucun produit avec prix détecté dans ce document');
      } else {
        setExtracted(results);
        toast.success(`${results.length} produit${results.length > 1 ? 's' : ''} détecté${results.length > 1 ? 's' : ''} — vérifiez et confirmez`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de l\'analyse');
    } finally {
      setAnalyzing(false);
    }
  }

  async function importerProduits() {
    const selected = extracted.filter(p => p.selected && p.nom.trim());
    if (selected.length === 0) { toast.error('Aucun produit sélectionné'); return; }
    if (!concurrentId) return;
    setImporting(true);
    let ok = 0;
    for (const p of selected) {
      const prix = p.prixHT ? parseFloat(p.prixHT.replace(',', '.')) : undefined;
      const res = await onAddProduit({
        concurrentId,
        nom: p.nom,
        reference: p.reference || undefined,
        categorie: p.categorie || undefined,
        prixHT: isNaN(prix!) ? undefined : prix,
        description: p.description || undefined,
        clientId: undefined,
      });
      if (res) ok++;
    }
    setImporting(false);
    setExtracted([]);
    toast.success(`${ok} produit${ok > 1 ? 's' : ''} importé${ok > 1 ? 's' : ''}`);
  }

  function toggleSelect(id: string) {
    setExtracted(prev => prev.map(p => p._id === id ? { ...p, selected: !p.selected } : p));
  }

  function updateExtracted(id: string, field: keyof ExtractedProduit, value: string) {
    setExtracted(prev => prev.map(p => p._id === id ? { ...p, [field]: value } : p));
  }

  // ── Drag handlers (only on the drop zone div) ─────────────────────────────
  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    setIsDragOver(true);
  }, []);
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragOver(false); }
  }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0; setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) analyserFichier(file);
  }, [concurrentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCount = extracted.filter(p => p.selected).length;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            {isEdit ? `Concurrent — ${concurrent!.nom}` : 'Nouveau concurrent'}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="infos">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="infos" className="flex items-center gap-1">
              <Building2 className="w-4 h-4" /> Infos
            </TabsTrigger>
            <TabsTrigger value="produits" className="flex items-center gap-1">
              <Package className="w-4 h-4" /> Produits
              {localProduits.length > 0 && <Badge variant="secondary" className="ml-1 h-4 text-xs px-1">{localProduits.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex items-center gap-1">
              <FileText className="w-4 h-4" /> Notes
              {localNotes.length > 0 && <Badge variant="secondary" className="ml-1 h-4 text-xs px-1">{localNotes.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* ── Onglet Infos ── */}
          <TabsContent value="infos" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Nom du concurrent *</Label>
                <Input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Ex: SyntaSeal" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Site web</Label>
                <Input value={form.siteWeb} onChange={e => setForm(f => ({ ...f, siteWeb: e.target.value }))} placeholder="https://..." />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes générales</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Positionnement, forces, faiblesses..." />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSaveInfos} disabled={saving}>
                <Save className="w-4 h-4 mr-1" /> {saving ? 'Enregistrement...' : (isEdit ? 'Mettre à jour' : 'Créer le concurrent')}
              </Button>
            </div>
          </TabsContent>

          {/* ── Onglet Produits ── */}
          <TabsContent value="produits" className="space-y-3 pt-3">

            {/* Zone d'import de tarif */}
            {extracted.length === 0 && !analyzing && (
              <div
                onDragEnter={onDragEnter}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 cursor-pointer transition-colors select-none
                  ${isDragOver
                    ? 'border-primary bg-primary/5 scale-[1.01]'
                    : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
                  }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.xlsx,.xls,.csv,.ods"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) analyserFichier(f); e.target.value = ''; }}
                />
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FilePdf className="w-5 h-5 text-rose-400" />
                  <Upload className="w-5 h-5" />
                  <FileSpreadsheet className="w-5 h-5 text-green-500" />
                </div>
                <p className="text-sm font-medium text-center">
                  {isDragOver ? 'Déposez le fichier ici' : 'Déposer ou cliquer pour importer un tarif'}
                </p>
                <p className="text-xs text-muted-foreground text-center">
                  PDF · Excel (.xlsx / .xls / .csv) — analyse IA automatique des prix
                </p>
                {!concurrentId && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 text-center mt-1">
                    ⚠ Enregistrez d'abord les infos du concurrent (onglet Infos)
                  </p>
                )}
              </div>
            )}

            {/* Loader analyse */}
            {analyzing && (
              <div className="flex items-center justify-center gap-3 p-6 rounded-xl border bg-muted/20">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm font-medium">Analyse du tarif en cours…</span>
              </div>
            )}

            {/* Résultats extraction */}
            {extracted.length > 0 && (
              <div className="border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-primary/5 border-b">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{selectedCount}/{extracted.length} produit{extracted.length > 1 ? 's' : ''} détecté{extracted.length > 1 ? 's' : ''}</span>
                    <button className="text-xs text-primary underline" onClick={() => setExtracted(p => p.map(x => ({ ...x, selected: true })))}>Tout</button>
                    <button className="text-xs text-muted-foreground underline" onClick={() => setExtracted(p => p.map(x => ({ ...x, selected: false })))}>Aucun</button>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={importerProduits} disabled={importing || selectedCount === 0}>
                      {importing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                      Importer {selectedCount > 0 ? selectedCount : ''}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setExtracted([])}>
                      <X className="w-3 h-3 mr-1" /> Annuler
                    </Button>
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto divide-y">
                  {extracted.map(p => (
                    <div key={p._id} className={`flex items-start gap-2 px-3 py-2 text-xs transition-colors ${p.selected ? 'bg-background' : 'bg-muted/30 opacity-60'}`}>
                      <button className="mt-0.5 shrink-0" onClick={() => toggleSelect(p._id)}>
                        {p.selected
                          ? <CheckSquare className="w-4 h-4 text-primary" />
                          : <Square className="w-4 h-4 text-muted-foreground" />
                        }
                      </button>
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1.5 flex-1 min-w-0">
                        <input
                          className="rounded border border-input bg-background px-1.5 py-0.5 text-xs min-w-0"
                          value={p.nom}
                          onChange={e => updateExtracted(p._id, 'nom', e.target.value)}
                          placeholder="Nom produit"
                        />
                        <input
                          className="rounded border border-input bg-background px-1.5 py-0.5 text-xs w-24"
                          value={p.reference}
                          onChange={e => updateExtracted(p._id, 'reference', e.target.value)}
                          placeholder="Réf."
                        />
                        <input
                          className="rounded border border-input bg-background px-1.5 py-0.5 text-xs w-24"
                          value={p.categorie}
                          list="cat-list-extracted"
                          onChange={e => updateExtracted(p._id, 'categorie', e.target.value)}
                          placeholder="Catégorie"
                        />
                        <input
                          className="rounded border border-input bg-background px-1.5 py-0.5 text-xs w-20 font-semibold text-green-700"
                          value={p.prixHT}
                          onChange={e => updateExtracted(p._id, 'prixHT', e.target.value)}
                          placeholder="Prix HT €"
                          type="number"
                          step="0.01"
                        />
                        <datalist id="cat-list-extracted">
                          {categories.map(c => <option key={c} value={c} />)}
                        </datalist>
                        {p.description && (
                          <p className="col-span-4 text-muted-foreground truncate pl-0.5">{p.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Formulaire ajout manuel */}
            {!showProduitForm ? (
              <Button size="sm" variant="outline" onClick={() => { setEditingProduit(null); setProduitForm(emptyProduit); setShowProduitForm(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Ajouter manuellement
              </Button>
            ) : (
              <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Nom du produit *</Label>
                    <Input value={produitForm.nom} onChange={e => setProduitForm(f => ({ ...f, nom: e.target.value }))} placeholder="Ex: IsoFloor Pro" />
                  </div>
                  <div className="space-y-1">
                    <Label>Référence</Label>
                    <Input value={produitForm.reference} onChange={e => setProduitForm(f => ({ ...f, reference: e.target.value }))} placeholder="REF-001" />
                  </div>
                  <div className="space-y-1">
                    <Label>Catégorie</Label>
                    <div className="relative">
                      <Input
                        list="categories-list"
                        value={produitForm.categorie}
                        onChange={e => setProduitForm(f => ({ ...f, categorie: e.target.value }))}
                        placeholder="Catégorie produit"
                      />
                      <datalist id="categories-list">
                        {categories.map(c => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Prix HT (€)</Label>
                    <Input value={produitForm.prixHT} onChange={e => setProduitForm(f => ({ ...f, prixHT: e.target.value }))} placeholder="0.00" type="number" step="0.01" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>Description / commentaire</Label>
                    <Input value={produitForm.description} onChange={e => setProduitForm(f => ({ ...f, description: e.target.value }))} placeholder="Caractéristiques, différences clés..." />
                  </div>
                  {clients.length > 0 && (
                    <div className="col-span-2 space-y-1">
                      <Label>Client source (qui a fourni l'info)</Label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={produitForm.clientId}
                        onChange={e => setProduitForm(f => ({ ...f, clientId: e.target.value }))}
                      >
                        <option value="">— Aucun client —</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.societe || c.nom}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveProduit}><Save className="w-3 h-3 mr-1" /> Enregistrer</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowProduitForm(false); setEditingProduit(null); }}><X className="w-3 h-3 mr-1" /> Annuler</Button>
                </div>
              </div>
            )}

            {/* Liste des produits existants */}
            <div className="space-y-2">
              {localProduits.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Aucun produit concurrent enregistré</p>}
              {localProduits.map(p => (
                <div key={p.id} className="flex items-start justify-between p-2 border rounded-lg bg-background text-sm">
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{p.nom}</span>
                      {p.reference && <span className="text-muted-foreground font-mono text-xs">{p.reference}</span>}
                      {p.categorie && <Badge variant="outline" className="text-xs h-4">{p.categorie}</Badge>}
                      {p.prixHT != null && <span className="text-green-700 font-semibold">{formatMontant(p.prixHT)} €</span>}
                    </div>
                    {p.description && <div className="text-muted-foreground text-xs">{p.description}</div>}
                    {p.createdByEmail && <div className="text-muted-foreground text-xs">Par {formatCreateur(p.createdByEmail)} · {p.createdAt}</div>}
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEditProduit(p)}><Pencil className="w-3 h-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => onDeleteProduit(p.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── Onglet Notes ── */}
          <TabsContent value="notes" className="space-y-3 pt-3">
            {!showNoteForm ? (
              <Button size="sm" variant="outline" onClick={() => { setEditingNote(null); setNoteForm({ titre: '', contenu: '', source: '', dateNote: new Date().toISOString().split('T')[0] }); setShowNoteForm(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Ajouter une note
              </Button>
            ) : (
              <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Titre *</Label>
                    <Input value={noteForm.titre} onChange={e => setNoteForm(f => ({ ...f, titre: e.target.value }))} placeholder="Ex: Visite salon Batimat" />
                  </div>
                  <div className="space-y-1">
                    <Label>Date</Label>
                    <Input type="date" value={noteForm.dateNote} onChange={e => setNoteForm(f => ({ ...f, dateNote: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Source</Label>
                    <Input value={noteForm.source} onChange={e => setNoteForm(f => ({ ...f, source: e.target.value }))} placeholder="Salon, client, LinkedIn..." />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>Observation / contenu</Label>
                    <Textarea value={noteForm.contenu} onChange={e => setNoteForm(f => ({ ...f, contenu: e.target.value }))} rows={3} placeholder="Détails de l'observation..." />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveNote}><Save className="w-3 h-3 mr-1" /> Enregistrer</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowNoteForm(false); setEditingNote(null); }}><X className="w-3 h-3 mr-1" /> Annuler</Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {localNotes.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Aucune note enregistrée</p>}
              {localNotes.map(n => (
                <div key={n.id} className="p-3 border rounded-lg bg-background text-sm">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{n.titre}</span>
                        {n.source && <Badge variant="outline" className="text-xs h-4">{n.source}</Badge>}
                        <span className="text-muted-foreground text-xs">{n.dateNote}</span>
                      </div>
                      {n.contenu && <div className="text-muted-foreground whitespace-pre-wrap">{n.contenu}</div>}
                      {n.createdByEmail && <div className="text-muted-foreground text-xs">Par {formatCreateur(n.createdByEmail)} · {n.createdAt}</div>}
                    </div>
                    <div className="flex gap-1 shrink-0 ml-2">
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEditNote(n)}><Pencil className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => onDeleteNote(n.id)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
