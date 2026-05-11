import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { fetchHistorique, type HistoriqueEntry } from '@/lib/historique';
import {
  MessageSquare, Paperclip, Send, Trash2, Download, FileText,
  FileImage, FileSpreadsheet, File, Clock, Pencil, Mail,
  Plus, ArrowRightLeft, PackageCheck, Loader2, StickyNote, Eye,
} from 'lucide-react';
import { toast } from 'sonner';

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
}

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
export default function DevisChatter({ open, onOpenChange, devisId, devisNumero }: Props) {
  const [pjs, setPjs] = useState<PieceJointe[]>([]);
  const [hist, setHist] = useState<HistoriqueEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'note' | 'fichier' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const userId = useRef<string | null>(null);

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
        date: r.date,
      })));
      setHist(histData);
    } finally {
      setLoading(false);
    }
  }, [devisId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  /* ── Timeline fusionnée ── */
  const timeline: EntreeTimeline[] = [
    ...pjs.map(p => ({ kind: 'pj' as const, data: p, date: p.date })),
    ...hist.map(h => ({ kind: 'hist' as const, data: h, date: h.date })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  /* ── Ajouter note ── */
  async function handleAddNote() {
    if (!note.trim()) return;
    const uid = userId.current;
    if (!uid) return;
    const { error } = await supabase.from('devis_pieces_jointes').insert({
      user_id: uid,
      devis_id: devisId,
      type: 'note',
      contenu: note.trim(),
    });
    if (error) { toast.error('Erreur ajout note'); return; }
    toast.success('Note enregistrée');
    setNote('');
    setMode(null);
    load();
  }

  /* ── Upload fichier ── */
  async function handleUpload(file: File) {
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

  /* ── Afficher dans le navigateur (PDF / image) ── */
  async function handleView(pj: PieceJointe) {
    const url = await getSignedUrl(pj, false);
    if (url) window.open(url, '_blank');
  }

  /* ── Télécharger ── */
  async function handleDownload(pj: PieceJointe) {
    const url = await getSignedUrl(pj, true);
    if (url) window.open(url, '_blank');
  }

  const nbPj = pjs.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullscreen className="sm:max-w-2xl sm:max-h-[88vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Devis {devisNumero}
            {nbPj > 0 && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                — {nbPj} pièce{nbPj > 1 ? 's' : ''} jointe{nbPj > 1 ? 's' : ''}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* ── Zone de saisie ── */}
        <div className="shrink-0 border border-border rounded-xl p-3 space-y-2 bg-muted/20">
          {/* Boutons mode */}
          <div className="flex gap-2">
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
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleUpload(f); }}
            />
          </div>

          {/* Saisie note */}
          {mode === 'note' && (
            <div className="space-y-2">
              <Textarea
                placeholder="Saisissez votre note…"
                value={note}
                onChange={e => setNote(e.target.value)}
                className="min-h-[80px] text-sm resize-none"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddNote(); }}
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setMode(null); setNote(''); }}>Annuler</Button>
                <Button size="sm" onClick={handleAddNote} disabled={!note.trim()} className="gap-1.5">
                  <Send className="w-3.5 h-3.5" />
                  Enregistrer
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Ctrl+Entrée pour valider</p>
            </div>
          )}
        </div>

        {/* ── Timeline ── */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pt-1">
          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Chargement…</span>
            </div>
          )}

          {!loading && timeline.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Aucune note ni fichier joint
            </div>
          )}

          {!loading && timeline.map((entry, i) => {
            if (entry.kind === 'pj') {
              const pj = entry.data;
              return (
                <div key={pj.id} className="flex gap-3 group">
                  {/* Icône */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${pj.type === 'note' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                    {pj.type === 'note' ? <StickyNote className="w-4 h-4" /> : <IconFichier mime={pj.fichierMime} />}
                  </div>
                  {/* Contenu */}
                  <div className="flex-1 min-w-0">
                    {pj.type === 'note' ? (
                      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 rounded-lg px-3 py-2">
                        <p className="text-sm whitespace-pre-wrap break-words">{pj.contenu}</p>
                      </div>
                    ) : (
                      <div className="border border-border rounded-lg px-3 py-2 flex items-center gap-2 min-w-0">
                        <IconFichier mime={pj.fichierMime} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{pj.fichierNom}</p>
                          {pj.fichierTaille != null && (
                            <p className="text-[10px] text-muted-foreground">{formatTaille(pj.fichierTaille)}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {(pj.fichierMime?.includes('pdf') || pj.fichierMime?.startsWith('image/')) && (
                            <button onClick={() => handleView(pj)} className="p-1 rounded hover:bg-muted" title="Afficher">
                              <Eye className="w-3.5 h-3.5 text-primary" />
                            </button>
                          )}
                          <button onClick={() => handleDownload(pj)} className="p-1 rounded hover:bg-muted" title="Télécharger">
                            <Download className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">{formatRelative(pj.date)}</p>
                  </div>
                  {/* Supprimer */}
                  <button
                    onClick={() => handleDelete(pj)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-destructive shrink-0 mt-1"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            }

            /* Entrée historique */
            const h = entry.data;
            const cfg = actionLabel[h.action] ?? { label: h.action, icon: Clock, color: 'text-muted-foreground' };
            const Icon = cfg.icon;
            return (
              <div key={h.id} className="flex gap-3 items-start">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{cfg.label}</span>
                    {h.details?.nouveauStatut ? ` → ${h.details.nouveauStatut}` : ''}
                    {h.details?.destinataire ? ` à ${h.details.destinataire}` : ''}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{formatRelative(h.date)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
