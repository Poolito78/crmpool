import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, Save, X, Building2, Package, FileText } from 'lucide-react';
import { toast } from 'sonner';
import type { Concurrent, ConcurrentProduit, ConcurrentNote } from '@/lib/concurrents';
import type { Produit, Client } from '@/lib/store';
import { formatMontant } from '@/lib/store';

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

const emptyForm = { nom: '', siteWeb: '', email: '', telephone: '', notes: '' };
const emptyProduit = { nom: '', reference: '', categorie: '', prixHT: '', description: '', clientId: '' };
const emptyNote = { titre: '', contenu: '', source: '', dateNote: new Date().toISOString().split('T')[0] };

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
        email: concurrent.email || '',
        telephone: concurrent.telephone || '',
        notes: concurrent.notes || '',
      } : emptyForm);
      setSavedId(null);
      setShowProduitForm(false);
      setShowNoteForm(false);
      setProduitForm(emptyProduit);
      setNoteForm({ ...emptyNote, dateNote: new Date().toISOString().split('T')[0] });
    }
  }, [open, concurrent]);

  async function handleSaveInfos() {
    if (!form.nom.trim()) { toast.error('Le nom du concurrent est requis'); return; }
    setSaving(true);
    if (isEdit && concurrent) {
      await onUpdateConcurrent({ ...concurrent, ...form, siteWeb: form.siteWeb || undefined, email: form.email || undefined, telephone: form.telephone || undefined, notes: form.notes || undefined });
      toast.success('Concurrent mis à jour');
    } else {
      const created = await onSaveConcurrent({ nom: form.nom, siteWeb: form.siteWeb || undefined, email: form.email || undefined, telephone: form.telephone || undefined, notes: form.notes || undefined });
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
              <div className="space-y-1">
                <Label>Site web</Label>
                <Input value={form.siteWeb} onChange={e => setForm(f => ({ ...f, siteWeb: e.target.value }))} placeholder="https://..." />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@..." />
              </div>
              <div className="space-y-1">
                <Label>Téléphone</Label>
                <Input value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} placeholder="01 23 45 67 89" />
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
            {!showProduitForm ? (
              <Button size="sm" variant="outline" onClick={() => { setEditingProduit(null); setProduitForm(emptyProduit); setShowProduitForm(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Ajouter un produit
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
                    {p.createdByEmail && <div className="text-muted-foreground text-xs">Par {p.createdByEmail} · {p.createdAt}</div>}
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
                      {n.createdByEmail && <div className="text-muted-foreground text-xs">Par {n.createdByEmail} · {n.createdAt}</div>}
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
