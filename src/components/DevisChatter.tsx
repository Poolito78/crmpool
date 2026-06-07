import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { fetchHistorique, type HistoriqueEntry } from '@/lib/historique';
import {
  MessageSquare, Paperclip, Send, Trash2, Download, FileText,
  FileImage, FileSpreadsheet, File, Clock, Pencil, Mail,
  Plus, ArrowRightLeft, PackageCheck, Loader2, StickyNote, Eye, Lock, LockOpen, History,
  Link2, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import DevisPreview from '@/components/DevisPreview';
import type { Client, Produit, Devis as DevisType } from '@/lib/store';

/* ── Types ── */
export interface PieceJointe {
  id: string;
  devisId: string;
  type: 'note' | 'fichier';
  contenu?: string;
  fichierNom?: string;
  fichierUrl?: string;
  fichierTaille?: number;
  fichierMime?: string;
  confidentiel?: boolean;
  date: string;
}

type EntreeTimeline =
  | { kind: 'pj';   data: PieceJointe }
  | { kind: 'hist'; data: HistoriqueEntry };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devisId: string;
  devisNumero: string;
  initialMode?: 'note' | 'fichier' | null;
  clients?: Client[];
  produits?: Produit[];
  onRestore?: (snapshot: DevisType) => void;
  /** Rendu intégré (sans la fenêtre Dialog), pour un onglet. */
  embedded?: boolean;
}

/* ── Liens externes (dossier PC, OneDrive, Google Drive, WhatsApp…) ──
   Stockés comme type 'fichier' avec ce mime marqueur pour éviter une migration DB. */
const LINK_MIME = 'application/x-link';
function isLink(pj: PieceJointe) { return pj.fichierMime === LINK_MIME; }

/* ── Helpers ── */
function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'à l\'instant';
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d}j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTaille(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1048576).toFixed(1)} Mo`;
}

function IconFichier({ mime }: { mime?: string }) {
  if (!mime) return <File className="w-5 h-5 text-muted-foreground" />;
  if (mime === LINK_MIME) return <Link2 className="w-5 h-5 text-violet-500" />;
  if (mime.startsWith('image/')) return <FileImage className="w-5 h-5 text-blue-500" />;
  if (mime.includes('pdf')) return <FileText className="w-5 h-5 text-red-500" />;
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv'))
    return <FileSpreadsheet className="w-5 h-5 text-green-600" />;
  return <File className="w-5 h-5 text-muted-foreground" />;
}

const actionLabel: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  creation:     { label: 'Devis créé',             icon: Plus,           color: 'text-emerald-600' },
  modification: { label: 'Modifié',                 icon: Pencil,         color: 'text-blue-600' },
  suppression:  { label: 'Supprimé',                icon: Trash2,         color: 'text-destructive' },
  envoi_email:  { label: 'Email envoyé',            icon: Mail,           color: 'text-violet-600' },
  statut:       { label: 'Statut modifié',          icon: ArrowRightLeft, color: 'text-amber-600' },
  reception:    { label: 'Réceptionné',             icon: PackageCheck,   color: 'text-emerald-600' },
  prise_stock:  { label: 'Prise sur stock',         icon: Clock,          color: 'text-teal-600' },
};

/* ── Composant principal ── */
export default function DevisChatter({ open, onOpenChange, devisId, devisNumero, initialMode, clients = [], produits = [], onRestore, embedded = false }: Props) {
  const [pjs, setPjs] = useState<PieceJointe[]>([]);
  const [hist, setHist] = useState<HistoriqueEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState('');
  const [pastedImages, setPastedImages] = useState<{ file: File; preview: string }[]>([]);
  const [mode, setMode] = useState<'note' | 'fichier' | 'lien' | null>(null);
  const [linkForm, setLinkForm] = useState({ label: '', url: '', confidentiel: false });
  const [tab, setTab] = useState<'documents' | 'historique'>('documents');
  const [isDragOver, setIsDragOver] = useState(false);
  const [snapshotDevis, setSnapshotDevis] = useState<DevisType | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileConfRef = useRef<HTMLInputElement>(null);
  const userId = useRef<string | null>(null);
  const dragCounter = useRef(0);

  /* ── Chargement données ── */
  const load = useCallback(async () => {
    if (!devisId) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userId.current = user?.id ?? null;

      const [{ data: pjData }, histData] = await Promise.all([
        supabase.from('devis_pieces_jointes')
          .select('*')
          .eq('devis_id', devisId)
          .order('date', { ascending: false }),
        fetchHistorique({ entiteType: 'devis', entiteId: devisId, limit: 100 }),
      ]);

      setPjs((pjData ?? []).map(r => ({
        id: r.id,
        devisId: r.devis_id,
        type: r.type as 'note' | 'fichier',
        contenu: r.contenu ?? undefined,
        fichierNom: r.fichier_nom ?? undefined,
        fichierUrl: r.fichier_url ?? undefined,
        fichierTaille: r.fichier_taille ?? undefined,
        fichierMime: r.fichier_mime ?? undefined,
        confidentiel: r.confidentiel ?? false,
        date: r.date,
      })));
      setHist(histData);
    } finally {
      setLoading(false);
    }
  }, [devisId]);

  useEffect(() => {
    if (open) {
      load();
      // Pré-sélectionner le mode si demandé depuis l'extérieur
      if (initialMode) {
        setMode(initialMode);
        if (initialMode === 'fichier') {
          setTimeout(() => fileRef.current?.click(), 100);
        }
      } else {
        setMode(null);
      }
    }
  }, [open, load, initialMode]);

  /* ── Timeline documents (notes + fichiers publics uniquement) ── */
  const timelineDocs: EntreeTimeline[] = [
    ...pjs.filter(p => !p.confidentiel).map(p => ({ kind: 'pj' as const, data: p, date: p.date })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const confidentiels = pjs.filter(p => p.confidentiel && p.type === 'fichier');
  const nbDocs = pjs.length;
  const nbHist = hist.length;

  /* ── Ajouter note ── */
  async function handleAddNote() {
    if (!note.trim() && pastedImages.length === 0) return;
    const uid = userId.current;
    if (!uid) return;
    setUploading(true);
    try {
      if (note.trim()) {
        const { error } = await supabase.from('devis_pieces_jointes').insert({
          user_id: uid, devis_id: devisId, type: 'note', contenu: note.trim(),
        });
        if (error) { toast.error('Erreur ajout note'); return; }
      }
      for (const { file } of pastedImages) {
        await uploadImageRaw(file);
      }
      toast.success(pastedImages.length > 0 ? 'Note et image(s) enregistrées' : 'Note enregistrée');
      pastedImages.forEach(p => URL.revokeObjectURL(p.preview));
      setPastedImages([]);
      setNote('');
      setMode(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Erreur');
    } finally {
      setUploading(false);
    }
  }

  /* ── Upload image collée (sans side-effects) ── */
  async function uploadImageRaw(file: File): Promise<void> {
    const uid = userId.current;
    if (!uid) return;
    const path = `${uid}/${devisId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: upErr } = await supabase.storage.from('devis-pj').upload(path, file, { upsert: false });
    if (upErr) throw new Error(upErr.message);
    const { data: signedData } = await supabase.storage.from('devis-pj').createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    const url = signedData?.signedUrl ?? path;
    const { error: dbErr } = await supabase.from('devis_pieces_jointes').insert({
      user_id: uid, devis_id: devisId, type: 'fichier',
      fichier_nom: file.name, fichier_url: url, fichier_taille: file.size, fichier_mime: file.type,
    });
    if (dbErr) throw new Error(dbErr.message);
  }

  /* ── Coller une image depuis le presse-papiers dans la note ── */
  function handleNotePaste(e: React.ClipboardEvent) {
    const imageItems = Array.from(e.clipboardData.items).filter(item => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    e.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;
      const ext = file.type.split('/')[1] || 'png';
      const named = new File([file], `image_${Date.now()}.${ext}`, { type: file.type });
      const preview = URL.createObjectURL(named);
      setPastedImages(prev => [...prev, { file: named, preview }]);
    }
  }

  /* ── Ajouter un lien (dossier PC / OneDrive / Google Drive / WhatsApp…) ── */
  async function handleAddLink() {
    const uid = userId.current;
    if (!uid || !linkForm.url.trim()) return;
    setUploading(true);
    try {
      const { error } = await supabase.from('devis_pieces_jointes').insert({
        user_id: uid,
        devis_id: devisId,
        type: 'fichier',
        fichier_nom: linkForm.label.trim() || linkForm.url.trim(),
        fichier_url: linkForm.url.trim(),
        fichier_mime: LINK_MIME,
        confidentiel: linkForm.confidentiel,
      });
      if (error) { toast.error('Erreur ajout lien'); return; }
      toast.success('Lien ajouté');
      setLinkForm({ label: '', url: '', confidentiel: false });
      setMode(null);
      load();
    } finally {
      setUploading(false);
    }
  }

  /* ── Toggle confidentiel ── */
  async function handleToggleConfidentiel(pj: PieceJointe) {
    await supabase.from('devis_pieces_jointes')
      .update({ confidentiel: !pj.confidentiel })
      .eq('id', pj.id);
    setPjs(prev => prev.map(p => p.id === pj.id ? { ...p, confidentiel: !p.confidentiel } : p));
  }

  /* ── Upload fichier ── */
  async function handleUpload(file: File, confidentiel = false) {
    const uid = userId.current;
    if (!uid) return;
    setUploading(true);
    try {

      const path = `${uid}/${devisId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

      const { error: upErr } = await supabase.storage
        .from('devis-pj')
        .upload(path, file, { upsert: false });

      if (upErr) throw new Error(upErr.message);

      // URL signée valable 10 ans (bucket privé)
      const { data: signedData } = await supabase.storage
        .from('devis-pj')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      const url = signedData?.signedUrl ?? path;

      const { error: dbErr } = await supabase.from('devis_pieces_jointes').insert({
        user_id: uid,
        devis_id: devisId,
        type: 'fichier',
        fichier_nom: file.name,
        fichier_url: url,
        fichier_taille: file.size,
        fichier_mime: file.type,
        confidentiel,
      });
      if (dbErr) throw new Error(dbErr.message);

      toast.success(`${file.name} joint avec succès`);
      setMode(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Erreur upload');
    } finally {
      setUploading(false);
    }
  }

  /* ── Supprimer pièce jointe ── */
  async function handleDelete(pj: PieceJointe) {
    if (pj.type === 'fichier' && pj.fichierUrl) {
      const pathMatch = pj.fichierUrl.match(/\/devis-pj\/([^?]+)/);
      if (pathMatch) {
        await supabase.storage.from('devis-pj').remove([decodeURIComponent(pathMatch[1])]);
      }
    }
    await supabase.from('devis_pieces_jointes').delete().eq('id', pj.id);
    setPjs(prev => prev.filter(p => p.id !== pj.id));
    toast.success('Supprimé');
  }

  /* ── Obtenir une URL signée fraîche ── */
  async function getSignedUrl(pj: PieceJointe, forDownload: boolean): Promise<string | null> {
    if (!pj.fichierUrl) return null;
    const pathMatch = pj.fichierUrl.match(/\/devis-pj\/([^?]+)/);
    if (pathMatch) {
      const storagePath = decodeURIComponent(pathMatch[1]);
      const { data } = await supabase.storage
        .from('devis-pj')
        .createSignedUrl(storagePath, 60, { download: forDownload });
      if (data?.signedUrl) return data.signedUrl;
    }
    return pj.fichierUrl;
  }

  /* ── Afficher dans le navigateur (PDF / image / lien) ── */
  async function handleView(pj: PieceJointe) {
    if (isLink(pj)) { if (pj.fichierUrl) window.open(pj.fichierUrl, '_blank', 'noopener'); return; }
    const url = await getSignedUrl(pj, false);
    if (url) window.open(url, '_blank');
  }

  /* ── Télécharger ── */
  async function handleDownload(pj: PieceJointe) {
    const url = await getSignedUrl(pj, true);
    if (url) window.open(url, '_blank');
  }

  /* ── Drag & Drop handlers ── */
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current++;
    if (Array.from(e.dataTransfer.items).some(i => i.kind === 'file')) setIsDragOver(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragOver(false);
  }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(f => handleUpload(f));
  }


  const inner = (
    <>
        <div className={embedded ? 'shrink-0' : ''}>
          {!embedded && (
            <div className="flex items-center gap-2 font-semibold text-lg">
              <MessageSquare className="w-5 h-5 text-primary" />
              Devis {devisNumero}
            </div>
          )}
          {/* Onglets */}
          <div className="flex gap-1 border-b border-border mt-2 -mb-1">
            <button
              onClick={() => setTab('documents')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${tab === 'documents' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <Paperclip className="w-3.5 h-3.5" />
              Documents
              {nbDocs > 0 && <span className="ml-1 text-xs bg-muted rounded-full px-1.5">{nbDocs}</span>}
            </button>
            <button
              onClick={() => setTab('historique')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${tab === 'historique' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <History className="w-3.5 h-3.5" />
              Historique
              {nbHist > 0 && <span className="ml-1 text-xs bg-muted rounded-full px-1.5">{nbHist}</span>}
            </button>
          </div>
        </div>

        {/* ── Zone drag & drop globale ── */}
        <div
          className="flex flex-col flex-1 min-h-0 relative"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Overlay drop */}
          {isDragOver && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-xl bg-primary/10 border-2 border-dashed border-primary pointer-events-none">
              <Paperclip className="w-10 h-10 text-primary mb-3" />
              <p className="text-sm font-semibold text-primary">Déposer le fichier ici</p>
              <p className="text-xs text-primary/70 mt-1">PDF, images, documents…</p>
            </div>
          )}

        {/* ── Onglet Documents ── */}
        {tab === 'documents' && <>

        {/* ── Zone de saisie ── */}
        <div className="shrink-0 border border-border rounded-xl p-3 space-y-2 bg-muted/20">
          {/* Boutons mode */}
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant={mode === 'note' ? 'default' : 'outline'}
              onClick={() => setMode(mode === 'note' ? null : 'note')}
              className="gap-1.5"
            >
              <StickyNote className="w-3.5 h-3.5" />
              Note
            </Button>
            <Button
              size="sm"
              variant={mode === 'fichier' ? 'default' : 'outline'}
              onClick={() => { setMode(mode === 'fichier' ? null : 'fichier'); if (mode !== 'fichier') setTimeout(() => fileRef.current?.click(), 50); }}
              className="gap-1.5"
              disabled={uploading}
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
              Joindre un fichier
            </Button>
            <Button
              size="sm"
              variant={mode === 'lien' ? 'default' : 'outline'}
              onClick={() => setMode(mode === 'lien' ? null : 'lien')}
              className="gap-1.5"
            >
              <Link2 className="w-3.5 h-3.5" />
              Lien
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileConfRef.current?.click()}
              className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30"
              disabled={uploading}
            >
              <Lock className="w-3.5 h-3.5" />
              Confidentiel
            </Button>
            <input ref={fileRef} type="file" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleUpload(f, false); }} />
            <input ref={fileConfRef} type="file" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleUpload(f, true); }} />
          </div>

          {/* Saisie lien */}
          {mode === 'lien' && (
            <div className="space-y-2">
              <div className="grid sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Libellé (ex : Dossier chantier, WhatsApp client…)"
                  value={linkForm.label}
                  onChange={e => setLinkForm(f => ({ ...f, label: e.target.value }))}
                  className="h-9 text-sm rounded-md border border-input bg-background px-3"
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="Lien : https://… (OneDrive, Drive, wa.me) ou chemin PC"
                  value={linkForm.url}
                  onChange={e => setLinkForm(f => ({ ...f, url: e.target.value }))}
                  className="h-9 text-sm rounded-md border border-input bg-background px-3"
                  onKeyDown={e => { if (e.key === 'Enter') handleAddLink(); }}
                />
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={linkForm.confidentiel} onChange={e => setLinkForm(f => ({ ...f, confidentiel: e.target.checked }))} className="rounded accent-amber-500" />
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                  Confidentiel <span className="text-muted-foreground">(non transmis à l'envoi)</span>
                </label>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setMode(null); setLinkForm({ label: '', url: '', confidentiel: false }); }}>Annuler</Button>
                  <Button size="sm" onClick={handleAddLink} disabled={!linkForm.url.trim() || uploading} className="gap-1.5">
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Ajouter le lien
                  </Button>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">📁 dossier PC · ☁️ OneDrive / Google Drive · 💬 WhatsApp (wa.me) — le lien s'ouvre dans un nouvel onglet.</p>
            </div>
          )}

          {/* Saisie note */}
          {mode === 'note' && (
            <div className="space-y-2">
              <Textarea
                placeholder="Saisissez votre note… (Ctrl+V pour coller une image)"
                value={note}
                onChange={e => setNote(e.target.value)}
                onPaste={handleNotePaste}
                className="min-h-[80px] text-sm resize-none"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddNote(); }}
              />
              {pastedImages.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pastedImages.map((img, i) => (
                    <div key={i} className="relative group/img">
                      <img src={img.preview} alt="" className="h-20 w-auto rounded border border-border object-cover" />
                      <button
                        type="button"
                        onClick={() => { URL.revokeObjectURL(img.preview); setPastedImages(prev => prev.filter((_, j) => j !== i)); }}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-white text-[10px] flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setMode(null); setNote(''); pastedImages.forEach(p => URL.revokeObjectURL(p.preview)); setPastedImages([]); }}>Annuler</Button>
                <Button size="sm" onClick={handleAddNote} disabled={!note.trim() && pastedImages.length === 0} className="gap-1.5">
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Enregistrer
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Ctrl+Entrée pour valider · Ctrl+V pour coller une image</p>
            </div>
          )}
        </div>

        {/* ── Timeline documents ── */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pt-1">
          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Chargement…</span>
            </div>
          )}
          {!loading && timelineDocs.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Aucune note ni fichier joint</p>
              <p className="text-xs mt-1 opacity-60">Glissez un fichier ici pour l'ajouter</p>
            </div>
          )}
          {!loading && timelineDocs.map((entry) => {
            const pj = entry.data as PieceJointe;
            return (
              <div key={pj.id} className="flex gap-3 group">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${pj.type === 'note' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                  {pj.type === 'note' ? <StickyNote className="w-4 h-4" /> : <IconFichier mime={pj.fichierMime} />}
                </div>
                <div className="flex-1 min-w-0">
                  {pj.type === 'note' ? (
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 rounded-lg px-3 py-2">
                      <p className="text-sm whitespace-pre-wrap break-words">{pj.contenu}</p>
                    </div>
                  ) : isLink(pj) ? (
                    <div className="border border-violet-200 dark:border-violet-800/50 rounded-lg px-3 py-2 flex items-center gap-2 min-w-0 bg-violet-50/40 dark:bg-violet-950/10">
                      <Link2 className="w-5 h-5 text-violet-500 shrink-0" />
                      <button onClick={() => handleView(pj)} className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-medium truncate text-violet-700 dark:text-violet-300 hover:underline">{pj.fichierNom}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{pj.fichierUrl}</p>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleView(pj)} className="p-1 rounded hover:bg-muted" title="Ouvrir le lien"><ExternalLink className="w-3.5 h-3.5 text-violet-500" /></button>
                        <button onClick={() => handleToggleConfidentiel(pj)} className="p-1 rounded hover:bg-muted" title="Rendre confidentiel"><Lock className="w-3.5 h-3.5 text-amber-500 opacity-50 hover:opacity-100" /></button>
                      </div>
                    </div>
                  ) : pj.fichierMime?.startsWith('image/') ? (
                    <div className="border border-border rounded-lg overflow-hidden">
                      <img
                        src={pj.fichierUrl} alt={pj.fichierNom}
                        className="max-w-full max-h-48 object-contain cursor-pointer w-full"
                        onClick={() => handleView(pj)}
                      />
                      <div className="px-2.5 py-1.5 flex items-center gap-2 border-t border-border/50 bg-muted/30">
                        <span className="text-xs text-muted-foreground truncate flex-1">{pj.fichierNom}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => handleView(pj)} className="p-1 rounded hover:bg-muted" title="Afficher"><Eye className="w-3.5 h-3.5 text-primary" /></button>
                          <button onClick={() => handleDownload(pj)} className="p-1 rounded hover:bg-muted" title="Télécharger"><Download className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => handleToggleConfidentiel(pj)} className="p-1 rounded hover:bg-muted" title="Rendre confidentiel"><Lock className="w-3.5 h-3.5 text-amber-500 opacity-50 hover:opacity-100" /></button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="border border-border rounded-lg px-3 py-2 flex items-center gap-2 min-w-0">
                      <IconFichier mime={pj.fichierMime} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{pj.fichierNom}</p>
                        {pj.fichierTaille != null && <p className="text-[10px] text-muted-foreground">{formatTaille(pj.fichierTaille)}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {(pj.fichierMime?.includes('pdf') || pj.fichierMime?.startsWith('image/')) && (
                          <button onClick={() => handleView(pj)} className="p-1 rounded hover:bg-muted" title="Afficher"><Eye className="w-3.5 h-3.5 text-primary" /></button>
                        )}
                        <button onClick={() => handleDownload(pj)} className="p-1 rounded hover:bg-muted" title="Télécharger"><Download className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button onClick={() => handleToggleConfidentiel(pj)} className="p-1 rounded hover:bg-muted" title="Rendre confidentiel"><Lock className="w-3.5 h-3.5 text-amber-500 opacity-50 hover:opacity-100" /></button>
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">{formatRelative(pj.date)}</p>
                </div>
                <button onClick={() => handleDelete(pj)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-destructive shrink-0 mt-1" title="Supprimer">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* ── Documents confidentiels ── */}
        {confidentiels.length > 0 && (
          <div className="shrink-0 mt-2 border border-amber-200 dark:border-amber-800 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
              <Lock className="w-3.5 h-3.5" />
              Documents confidentiels — non transmis à l'envoi
            </div>
            {confidentiels.map(pj => (
              <div key={pj.id} className="group bg-white dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded-lg overflow-hidden">
                {/* Aperçu image confidentielle */}
                {pj.fichierMime?.startsWith('image/') && (
                  <img
                    src={pj.fichierUrl} alt={pj.fichierNom}
                    className="max-w-full max-h-48 object-contain cursor-pointer w-full bg-muted/20"
                    onClick={() => handleView(pj)}
                  />
                )}
                <div className="flex items-center gap-2 px-2.5 py-1.5">
                  <IconFichier mime={pj.fichierMime} />
                  {isLink(pj) ? (
                    <button onClick={() => handleView(pj)} className="flex-1 min-w-0 text-left">
                      <span className="text-sm truncate block text-violet-700 dark:text-violet-300 hover:underline">{pj.fichierNom}</span>
                      <span className="text-[10px] text-muted-foreground truncate block">{pj.fichierUrl}</span>
                    </button>
                  ) : (
                    <span className="text-sm flex-1 truncate">{pj.fichierNom}</span>
                  )}
                  {pj.fichierTaille != null && <span className="text-[10px] text-muted-foreground shrink-0">{formatTaille(pj.fichierTaille)}</span>}
                  <div className="flex items-center gap-1 shrink-0">
                    {isLink(pj) ? (
                      <button onClick={() => handleView(pj)} className="p-1 rounded hover:bg-amber-100" title="Ouvrir le lien"><ExternalLink className="w-3.5 h-3.5 text-violet-500" /></button>
                    ) : (
                      <>
                        {(pj.fichierMime?.includes('pdf') || pj.fichierMime?.startsWith('image/')) && (
                          <button onClick={() => handleView(pj)} className="p-1 rounded hover:bg-amber-100" title="Afficher"><Eye className="w-3.5 h-3.5 text-primary" /></button>
                        )}
                        <button onClick={() => handleDownload(pj)} className="p-1 rounded hover:bg-amber-100" title="Télécharger"><Download className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      </>
                    )}
                    <button onClick={() => handleToggleConfidentiel(pj)} className="p-1 rounded hover:bg-amber-100" title="Rendre public"><LockOpen className="w-3.5 h-3.5 text-amber-600" /></button>
                    <button onClick={() => handleDelete(pj)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-destructive" title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        </>}{/* fin onglet Documents */}

        {/* ── Onglet Historique ── */}
        {tab === 'historique' && (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pt-1">
            {loading && (
              <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Chargement…</span>
              </div>
            )}
            {!loading && hist.length === 0 && (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Aucune modification enregistrée</p>
              </div>
            )}
            {!loading && hist.map(h => {
              const cfg = actionLabel[h.action] ?? { label: h.action, icon: Clock, color: 'text-muted-foreground' };
              const Icon = cfg.icon;
              const snap = h.action === 'modification' && h.details?.snapshot ? h.details.snapshot as DevisType : null;
              return (
                <div key={h.id} className="flex gap-3 items-start py-1.5 border-b border-border/40 last:border-0">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">
                      <span className="font-medium text-foreground">{cfg.label}</span>
                      {h.details?.nouveauStatut ? <span className="text-muted-foreground"> → {h.details.nouveauStatut}</span> : ''}
                      {h.details?.destinataire ? <span className="text-muted-foreground"> à {h.details.destinataire}</span> : ''}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{formatRelative(h.date)}</p>
                    {snap && (
                      <button
                        onClick={() => setSnapshotDevis(snap)}
                        className="mt-1 flex items-center gap-1 text-[10px] text-primary hover:underline"
                      >
                        <Eye className="w-3 h-3" />
                        Voir avant modification
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        </div>{/* fin zone drag & drop */}
    </>
  );

  return (
    <>
    {embedded ? (
      <div className="flex flex-col flex-1 min-h-0">{inner}</div>
    ) : (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent mobileFullscreen className="sm:max-w-2xl sm:max-h-[88vh] flex flex-col overflow-hidden">
          {inner}
        </DialogContent>
      </Dialog>
    )}

    {/* Dialog snapshot "avant modification" */}
    {snapshotDevis && (
      <Dialog open={!!snapshotDevis} onOpenChange={(o) => { if (!o) { setSnapshotDevis(null); setRestoreConfirm(false); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <History className="w-4 h-4" />
              Devis avant modification — {snapshotDevis.numero}
            </DialogTitle>
          </DialogHeader>

          {onRestore && (
            <div className="flex items-center gap-3 px-1 pb-2 border-b border-border">
              {!restoreConfirm ? (
                <Button variant="outline" size="sm" className="text-amber-600 border-amber-300 hover:bg-amber-50"
                  onClick={() => setRestoreConfirm(true)}>
                  <History className="w-3.5 h-3.5 mr-1.5" />
                  Restaurer cette version
                </Button>
              ) : (
                <>
                  <span className="text-sm text-muted-foreground">Écraser le devis actuel avec cette version ?</span>
                  <Button size="sm" variant="destructive" onClick={() => {
                    onRestore(snapshotDevis);
                    setSnapshotDevis(null);
                    setRestoreConfirm(false);
                    toast.success('Devis restauré à la version précédente');
                  }}>
                    Confirmer
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRestoreConfirm(false)}>Annuler</Button>
                </>
              )}
            </div>
          )}

          <DevisPreview
            devis={snapshotDevis}
            client={clients.find(c => c.id === snapshotDevis.clientId)}
            produits={produits}
            hideControls
          />
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}
