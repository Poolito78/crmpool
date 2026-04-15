import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Send, Loader2, FileText, FolderOpen, X, Copy } from 'lucide-react';
import { type Devis, type Client, calculerTotalDevis, formatMontant, formatDate } from '@/lib/store';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// ─── IndexedDB : persistance du dossier mémorisé ─────────────────────────────

const IDB_NAME = 'crmpool-settings';
const IDB_STORE = 'handles';
const IDB_KEY = 'pdf-folder';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStoredDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function storeDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

async function clearStoredDirHandle(): Promise<void> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

type ShowDirPicker = (opts?: object) => Promise<FileSystemDirectoryHandle>;

async function writePdfToFolder(
  fileName: string,
  pdfBytes: Uint8Array,
  forcePickFolder = false,
): Promise<{ ok: boolean; folderName?: string }> {
  if (!('showDirectoryPicker' in window)) return { ok: false };
  try {
    let dirHandle = await getStoredDirHandle();
    if (!forcePickFolder && dirHandle) {
      // @ts-expect-error – requestPermission pas encore dans les types DOM
      const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') dirHandle = null;
    }
    if (!dirHandle || forcePickFolder) {
      dirHandle = await (window as typeof window & { showDirectoryPicker: ShowDirPicker })
        .showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
      await storeDirHandle(dirHandle);
    }
    const fh = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fh.createWritable();
    await writable.write(pdfBytes);
    await writable.close();
    return { ok: true, folderName: dirHandle.name };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') return { ok: false };
    console.error(err);
    return { ok: false };
  }
}

// ─── Composant principal ──────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devis: Devis | null;
  client?: Client;
  onSent: () => void;
  pdfContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export default function DevisEmailDialog({ open, onOpenChange, devis, client, onSent, pdfContainerRef }: Props) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [generating, setGenerating] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const [savedFolder, setSavedFolder] = useState<string | null>(null);
  const [lastSavedFile, setLastSavedFile] = useState<string | null>(null);
  const pdfBase64Ref = useRef<string | null>(null);

  useEffect(() => {
    getStoredDirHandle().then(h => setSavedFolder(h?.name ?? null));
  }, []);

  useEffect(() => {
    if (!devis || !open) {
      setPdfReady(false);
      pdfBase64Ref.current = null;
      setLastSavedFile(null);
      return;
    }
    const totals = calculerTotalDevis(devis.lignes, devis.fraisPortHT || 0, devis.fraisPortTVA ?? 20);
    setTo(client?.email || '');
    setSubject(`Devis ${devis.numero}${devis.referenceAffaire ? ` — ${devis.referenceAffaire}` : ''}${client?.societe ? ` — ${client.societe}` : ''}`);
    setBody(
`Bonjour${client?.nom ? ` ${client.nom}` : ''},

Suite à notre échange, veuillez trouver ci-joint notre devis ${devis.numero}${devis.referenceAffaire ? ` (Réf. ${devis.referenceAffaire})` : ''} d'un montant de ${formatMontant(totals.totalTTC)} TTC.

Ce devis est valable jusqu'au ${formatDate(devis.dateValidite)}.

Détail :
- Total HT : ${formatMontant(totals.totalHT)}
- Total TVA : ${formatMontant(totals.totalTVA)}
- Total TTC : ${formatMontant(totals.totalTTC)}

Restant à votre disposition pour toute question.

Cordialement,
[Votre nom]
[Votre entreprise]`
    );

    if (pdfContainerRef?.current) {
      setPdfReady(false);
      pdfBase64Ref.current = null;
      setTimeout(() => generatePdf(), 600);
    }
  }, [devis, client, open]);

  async function generatePdf() {
    if (!pdfContainerRef?.current || !devis) return;
    setGenerating(true);
    try {
      const canvas = await html2canvas(pdfContainerRef.current, {
        scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff',
      });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pw) / canvas.width;
      let yOffset = 0, page = 0;
      while (yOffset < imgH) {
        if (page > 0) pdf.addPage();
        const srcY = (yOffset / imgH) * canvas.height;
        const srcH = Math.min((ph / imgH) * canvas.height, canvas.height - srcY);
        const sliceH = (srcH / canvas.height) * imgH;
        const tmp = document.createElement('canvas');
        tmp.width = canvas.width; tmp.height = srcH;
        tmp.getContext('2d')!.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
        pdf.addImage(tmp.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, sliceH);
        yOffset += ph; page++;
      }
      pdfBase64Ref.current = pdf.output('datauristring').split(',')[1];
      setPdfReady(true);
    } catch (err) {
      console.error('Erreur génération PDF:', err);
    } finally {
      setGenerating(false);
    }
  }

  async function handlePickFolder() {
    const dummy = new Uint8Array(0);
    const res = await writePdfToFolder('_init', dummy, true);
    if (res.ok) setSavedFolder(res.folderName ?? null);
  }

  async function handleSend() {
    if (!to || !devis) return;

    const pdfFileName = `Devis_${devis.numero}.pdf`;

    // 1. Sauvegarder le PDF dans le dossier mémorisé (ou télécharger en fallback)
    if (pdfBase64Ref.current) {
      const pdfBytes = Uint8Array.from(atob(pdfBase64Ref.current), c => c.charCodeAt(0));
      const res = await writePdfToFolder(pdfFileName, pdfBytes);
      if (res.ok) {
        setSavedFolder(res.folderName ?? null);
        setLastSavedFile(pdfFileName);
      } else {
        // Fallback : téléchargement classique
        const url = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
        const a = document.createElement('a'); a.href = url; a.download = pdfFileName; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    }

    // 2. Ouvrir Outlook via mailto (s'ouvre directement dans Outlook)
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, '_blank');

    // 3. Statut → envoyé
    onSent();
    onOpenChange(false);

    // 4. Toast persistant avec le nom du fichier à joindre
    if (pdfBase64Ref.current) {
      toast.info(
        `📎 Joignez le PDF dans Outlook : ${pdfFileName}`,
        {
          description: savedFolder ? `Sauvegardé dans le dossier "${savedFolder}"` : 'Vérifie ton dossier Téléchargements',
          duration: 10000,
          action: {
            label: 'Copier le nom',
            onClick: () => navigator.clipboard.writeText(pdfFileName),
          },
        }
      );
    }
  }

  if (!devis) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Envoyer le devis {devis.numero}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Destinataire</Label>
            <Input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="email@client.com" />
          </div>
          <div>
            <Label>Objet</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div>
            <Label>Corps du message</Label>
            <textarea
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[280px] font-mono"
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          </div>

          {/* Dossier + état PDF */}
          <div className="rounded-md border px-3 py-2 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
              {savedFolder ? (
                <>
                  <span className="text-muted-foreground">Dossier PDF :</span>
                  <span className="font-medium truncate">{savedFolder}</span>
                  <button onClick={handlePickFolder} className="ml-auto text-xs text-muted-foreground hover:text-foreground underline shrink-0">Changer</button>
                  <button onClick={async () => { await clearStoredDirHandle(); setSavedFolder(null); }} className="text-muted-foreground hover:text-destructive shrink-0" title="Oublier"><X className="w-3.5 h-3.5" /></button>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground text-xs">Aucun dossier — PDF téléchargé dans Téléchargements</span>
                  <button onClick={handlePickFolder} className="ml-auto text-xs text-primary hover:underline shrink-0">Choisir un dossier</button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 border-t pt-2">
              {generating ? (
                <><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Génération du PDF…</span></>
              ) : pdfReady ? (
                <><FileText className="w-4 h-4 text-emerald-600" /><span className="text-emerald-700 font-medium">PDF prêt</span><span className="text-muted-foreground ml-1">— sauvegardé dans {savedFolder ?? 'Téléchargements'} à l'envoi</span></>
              ) : (
                <><FileText className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">PDF non disponible</span></>
              )}
            </div>

            {pdfReady && (
              <p className="text-xs text-amber-600 border-t pt-2">
                ⚠️ Outlook s'ouvrira sans pièce jointe — joignez le PDF depuis le dossier <strong>{savedFolder ?? 'Téléchargements'}</strong>
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSend} disabled={!to || generating}>
            <Send className="w-4 h-4 mr-2" /> Ouvrir Outlook
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
