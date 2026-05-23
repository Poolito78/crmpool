import { useState, useMemo, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Building2, Package, FileText, Plus, Trash2, Pencil, Save, X, Search, Download,
  Mail, Globe, Phone, User, BarChart3, Filter, ArrowUpDown, ChevronDown, ChevronRight, Settings,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { useConcurrents, formatCreateur, setCreatorName } from '@/lib/concurrents';
import { useCRM } from '@/lib/StoreContext';
import { formatMontant } from '@/lib/store';
import ConcurrentDialog from '@/components/ConcurrentDialog';
import type { Concurrent } from '@/lib/concurrents';
import { supabase } from '@/integrations/supabase/client';

// ── Export helpers ────────────────────────────────────────────────────────────

export function exportVeilleExcel(
  concurrents: Concurrent[],
  produits: ReturnType<typeof useConcurrents>['produits'],
  notes: ReturnType<typeof useConcurrents>['notes'],
) {
  const wb = XLSX.utils.book_new();
  const concMap = Object.fromEntries(concurrents.map(c => [c.id, c.nom]));

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(concurrents.map(c => ({
    'Nom': c.nom, 'Site web': c.siteWeb || '', 'Email': c.email || '',
    'Téléphone': c.telephone || '', 'Notes': c.notes || '',
    'Créé par': c.createdByEmail || '', 'Date': c.createdAt,
  }))), 'Concurrents');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(produits.map(p => ({
    'Concurrent': concMap[p.concurrentId] || '', 'Produit': p.nom,
    'Référence': p.reference || '', 'Catégorie': p.categorie || '',
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
    'Catégorie': p.categorie || '', 'Prix HT': p.prixHT != null ? p.prixHT : '',
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

// ── Composant principal (sans wrapper de scroll) ──────────────────────────────
// Utilisé tel quel dans CRM.tsx ; wrappé dans un scroll container pour la page dédiée.

export function VeilleContent() {
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
  const [nameEditOpen, setNameEditOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) setMyEmail(session.user.email);
    });
  }, []);

  function saveDisplayName() {
    if (!myEmail || !nameInput.trim()) return;
    setCreatorName(myEmail, nameInput.trim());
    setNameEditOpen(false);
    toast.success(`Nom d'affichage mis à jour : ${nameInput.trim()}`);
  }

  const [searchConc, setSearchConc] = useState('');
  const [filterCreateur, setFilterCreateur] = useState('');
  const [filterConcProduit, setFilterConcProduit] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterConcNote, setFilterConcNote] = useState('');
  const [filterCreateurNote, setFilterCreateurNote] = useState('');
  const [sortProduit, setSortProduit] = useState<'nom' | 'categorie' | 'prix'>('categorie');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pivotMode, setPivotMode] = useState<'categorie' | 'concurrent'>('categorie');
  const [editingProduitId, setEditingProduitId] = useState<string | null>(null);
  const [editingProduitForm, setEditingProduitForm] = useState({ nom: '', reference: '', categorie: '', prixHT: '', description: '', clientId: '' });

  const createurs = useMemo(() => [...new Set([
    ...concurrents.map(c => c.createdByEmail),
    ...produits.map(p => p.createdByEmail),
  ].filter(Boolean) as string[])].sort(), [concurrents, produits]);

  const categories = useMemo(() =>
    [...new Set(produits.map(p => p.categorie).filter(Boolean) as string[])].sort()
  , [produits]);

  const filteredConcurrents = useMemo(() => {
    let list = concurrents;
    if (searchConc) list = list.filter(c => c.nom.toLowerCase().includes(searchConc.toLowerCase()) || c.email?.toLowerCase().includes(searchConc.toLowerCase()));
    if (filterCreateur) list = list.filter(c => c.createdByEmail === filterCreateur);
    return list;
  }, [concurrents, searchConc, filterCreateur]);

  const filteredProduits = useMemo(() => {
    let list = produits;
    if (filterConcProduit) list = list.filter(p => p.concurrentId === filterConcProduit);
    if (filterCategorie) list = list.filter(p => p.categorie === filterCategorie);
    return [...list].sort((a, b) => {
      if (sortProduit === 'prix') return (a.prixHT ?? Infinity) - (b.prixHT ?? Infinity);
      if (sortProduit === 'categorie') return (a.categorie || '').localeCompare(b.categorie || '');
      return a.nom.localeCompare(b.nom);
    });
  }, [produits, filterConcProduit, filterCategorie, sortProduit]);

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

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Barre d'actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {concurrents.length} concurrent{concurrents.length > 1 ? 's' : ''} · {produits.length} produit{produits.length > 1 ? 's' : ''} · {notes.length} note{notes.length > 1 ? 's' : ''}
        </p>
        <div className="flex gap-2 flex-wrap items-center">
          {myEmail && (
            nameEditOpen ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveDisplayName(); if (e.key === 'Escape') setNameEditOpen(false); }}
                  placeholder="Votre nom affiché..."
                  className="h-8 text-sm w-36"
                  autoFocus
                />
                <Button size="sm" className="h-8" onClick={saveDisplayName}>OK</Button>
                <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setNameEditOpen(false)}>✕</Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5 h-8"
                title="Modifier mon nom d'affichage"
                onClick={() => { setNameInput(formatCreateur(myEmail)); setNameEditOpen(true); }}>
                <Settings className="w-3.5 h-3.5" />
                <span className="text-xs">{formatCreateur(myEmail)}</span>
              </Button>
            )
          )}
          <Button variant="outline" size="sm" onClick={() => exportVeilleExcel(concurrents, produits, notes)}>
            <Download className="w-4 h-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportByEmail(concurrents, produits, notes)}>
            <Mail className="w-4 h-4 mr-1" /> Par email
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> Nouveau concurrent
          </Button>
        </div>
      </div>

      {/* Sous-onglets */}
      <Tabs defaultValue="fiches">
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
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

        {/* ── Fiches Concurrents ── */}
        <TabsContent value="fiches" className="space-y-3 pt-3">
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
                        {c.email && <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()} className="text-muted-foreground hover:text-foreground"><Mail className="w-4 h-4" /></a>}
                        {c.telephone && <a href={`tel:${c.telephone}`} onClick={e => e.stopPropagation()} className="text-muted-foreground hover:text-foreground"><Phone className="w-4 h-4" /></a>}
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
        <TabsContent value="produits" className="space-y-3 pt-3">
          <div className="flex gap-2 flex-wrap">
            <Select value={filterConcProduit || '_all'} onValueChange={v => setFilterConcProduit(v === '_all' ? '' : v)}>
              <SelectTrigger className="min-w-fit w-auto">
                <Building2 className="w-4 h-4 mr-1 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Tous les concurrents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Tous les concurrents</SelectItem>
                {concurrents.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCategorie || '_all'} onValueChange={v => setFilterCategorie(v === '_all' ? '' : v)}>
              <SelectTrigger className="min-w-fit w-auto">
                <Filter className="w-4 h-4 mr-1 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Toutes les catégories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Toutes les catégories</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortProduit} onValueChange={v => setSortProduit(v as any)}>
              <SelectTrigger className="min-w-fit w-auto">
                <ArrowUpDown className="w-4 h-4 mr-1 text-muted-foreground shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="categorie">Trier par catégorie</SelectItem>
                <SelectItem value="nom">Trier par nom</SelectItem>
                <SelectItem value="prix">Trier par prix</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {filteredProduits.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Aucun produit concurrent trouvé</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <datalist id="veille-categories-list">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concurrent</TableHead>
                    <TableHead>Produit</TableHead>
                    <TableHead>Référence</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead className="text-right">Prix HT</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Client source</TableHead>
                    <TableHead>Saisi par</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProduits.map(p => {
                    const conc = concurrents.find(c => c.id === p.concurrentId);
                    const sourceClient = clients.find(c => c.id === p.clientId);
                    const isEditing = editingProduitId === p.id;

                    function startEdit() {
                      setEditingProduitId(p.id);
                      setEditingProduitForm({ nom: p.nom, reference: p.reference || '', categorie: p.categorie || '', prixHT: p.prixHT != null ? String(p.prixHT) : '', description: p.description || '', clientId: p.clientId || '' });
                    }

                    async function saveEdit() {
                      if (!editingProduitForm.nom.trim()) return;
                      const prixHT = editingProduitForm.prixHT ? parseFloat(editingProduitForm.prixHT.replace(',', '.')) : undefined;
                      await updateProduit({ ...p, nom: editingProduitForm.nom, reference: editingProduitForm.reference || undefined, categorie: editingProduitForm.categorie || undefined, prixHT, description: editingProduitForm.description || undefined, clientId: editingProduitForm.clientId || undefined });
                      setEditingProduitId(null);
                      toast.success('Produit mis à jour');
                    }

                    if (isEditing) {
                      return (
                        <TableRow key={p.id} className="bg-muted/20">
                          <TableCell className="font-medium text-sm">{conc?.nom || '—'}</TableCell>
                          <TableCell>
                            <Input value={editingProduitForm.nom} onChange={e => setEditingProduitForm(f => ({ ...f, nom: e.target.value }))} className="h-7 text-sm w-28" autoFocus onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingProduitId(null); }} />
                          </TableCell>
                          <TableCell>
                            <Input value={editingProduitForm.reference} onChange={e => setEditingProduitForm(f => ({ ...f, reference: e.target.value }))} className="h-7 text-sm w-20 font-mono" placeholder="REF" onKeyDown={e => { if (e.key === 'Escape') setEditingProduitId(null); }} />
                          </TableCell>
                          <TableCell>
                            <Input list="veille-categories-list" value={editingProduitForm.categorie} onChange={e => setEditingProduitForm(f => ({ ...f, categorie: e.target.value }))} className="h-7 text-sm w-36" placeholder="Catégorie" onKeyDown={e => { if (e.key === 'Escape') setEditingProduitId(null); }} />
                          </TableCell>
                          <TableCell>
                            <Input type="number" value={editingProduitForm.prixHT} onChange={e => setEditingProduitForm(f => ({ ...f, prixHT: e.target.value }))} className="h-7 text-sm w-20 text-right" placeholder="0.00" step="0.01" onKeyDown={e => { if (e.key === 'Escape') setEditingProduitId(null); }} />
                          </TableCell>
                          <TableCell>
                            <Input value={editingProduitForm.description} onChange={e => setEditingProduitForm(f => ({ ...f, description: e.target.value }))} className="h-7 text-sm w-40" placeholder="Description..." onKeyDown={e => { if (e.key === 'Escape') setEditingProduitId(null); }} />
                          </TableCell>
                          <TableCell>
                            <select
                              className="h-7 rounded-md border border-input bg-background px-2 text-sm w-36"
                              value={editingProduitForm.clientId}
                              onChange={e => setEditingProduitForm(f => ({ ...f, clientId: e.target.value }))}
                            >
                              <option value="">— Aucun —</option>
                              {clients.map(c => <option key={c.id} value={c.id}>{c.societe || c.nom}</option>)}
                            </select>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatCreateur(p.createdByEmail)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.createdAt}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-primary" title="Enregistrer" onClick={saveEdit}>
                                <Save className="w-3 h-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" title="Annuler" onClick={() => setEditingProduitId(null)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }
                    return (
                      <TableRow key={p.id} className="group cursor-pointer hover:bg-muted/30" onClick={startEdit}>
                        <TableCell className="font-medium">{conc?.nom || '—'}</TableCell>
                        <TableCell>{p.nom}</TableCell>
                        <TableCell className="font-mono text-xs">{p.reference || '—'}</TableCell>
                        <TableCell>{p.categorie ? <Badge variant="outline" className="text-xs">{p.categorie}</Badge> : '—'}</TableCell>
                        <TableCell className="text-right font-semibold">{p.prixHT != null ? `${formatMontant(p.prixHT)} €` : '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-40 truncate">{p.description || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{sourceClient ? (sourceClient.societe || sourceClient.nom) : '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatCreateur(p.createdByEmail)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.createdAt}</TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100"
                            onClick={async () => {
                              if (!confirm(`Supprimer "${p.nom}" ?`)) return;
                              await deleteProduit(p.id);
                              toast.success('Produit supprimé');
                            }}>
                            <Trash2 className="w-3 h-3" />
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
        <TabsContent value="notes" className="space-y-3 pt-3">
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
        <TabsContent value="analyse" className="space-y-4 pt-3">
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
      <div className="flex-none px-4 md:px-6 py-4 border-b bg-background flex items-center gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" /> Veille Concurrence
          </h1>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
        <VeilleContent />
      </div>
    </div>
  );
}
