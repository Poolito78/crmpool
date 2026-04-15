import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Send, Loader2, FileText, FolderOpen, X } from 'lucide-react';
import { type Devis, type Client, calculerTotalDevis, formatMontant, formatDate } from '@/lib/store';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// ─── IndexedDB : persistance du handle de dossier ───────────────────────────

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

// ─── Sauvegarde PDF dans le dossier mémorisé ─────────────────────────────────

async function savePdfToFolder(
  fileName: string,
  pdfBase64: string,
  forcePickFolder = false,
): Promise<{ ok: boolean; folderName?: string; error?: string }> {
  // File System Access API dispo ?
  if (!('showDirectoryPicker' in window)) {
    return { ok: false, error: 'non_supported' };
  }

  try {
    let dirHandle: FileSystemDirectoryHandle | null = null;

    if (!forcePickFolder) {
      dirHandle = await getStoredDirHandle();
      if (dirHandle) {
        // Vérifier / demander la permission
        // @ts-expect-error – queryPermission est dans la spec mais pas encore dans les types TS
        const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') dirHandle = null;
      }
    }

    if (!dirHandle) {
      // Ouvrir le sélecteur de dossier (requiert un geste utilisateur)
      dirHandle = await (window as typeof window & { showDirectoryPicker: (opts?: object) => Promise<FileSystemDirectoryHandle> })
        .showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
      await storeDirHandle(dirHandle);
    }

    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    const bytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
    await writable.write(bytes);
    await writable.close();

    return { ok: true, folderName: dirHandle.name };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: 'annulé' };
    }
    return { ok: false, error: String(err) };
  }
}

// ─── Composant ───────────────────────────────────────────────────────────────

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
  const pdfBase64Ref = useRef<string | null>(null);

  // Charger le nom du dossier mémorisé
  useEffect(() => {
    getStoredDirHandle().then(h => setSavedFolder(h?.name ?? null));
  }, []);

  useEffect(() => {
    if (!devis || !open) {
      setPdfReady(false);
      pdfBase64Ref.current = null;
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
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pw) / canvas.width;

      let yOffset = 0;
      let page = 0;
      while (yOffset < imgH) {
        if (page > 0) pdf.addPage();
        const srcY = (yOffset / imgH) * canvas.height;
        const srcH = Math.min((ph / imgH) * canvas.height, canvas.height - srcY);
        const sliceH = (srcH / canvas.height) * imgH;
        const tmp = document.createElement('canvas');
        tmp.width = canvas.width;
        tmp.height = srcH;
        tmp.getContext('2d')!.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
        pdf.addImage(tmp.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, sliceH);
        yOffset += ph;
        page++;
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
    const result = await savePdfToFolder('test.pdf', btoa('test'), true);
    if (result.ok) {
      setSavedFolder(result.folderName ?? null);
    }
  }

  async function handleClearFolder() {
    await clearStoredDirHandle();
    setSavedFolder(null);
  }

  async function handleSend() {
    if (!to || !devis) return;
    const fileName = `Devis_${devis.numero}.pdf`;

    if (pdfBase64Ref.current) {
      // Essayer de sauvegarder dans le dossier mémorisé
      const result = await savePdfToFolder(fileName, pdfBase64Ref.current);
      if (result.ok) {
        setSavedFolder(result.folderName ?? null);
      } else if (result.error === 'non_supported') {
        // Navigateur non compatible → téléchargement classique
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${pdfBase64Ref.current}`;
        link.download = fileName;
        link.click();
      }
      // Si annulé par l'utilisateur → on continue quand même avec Outlook
    }

    // Ouvrir Outlook
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, '_blank');

    onSent();
    onOpenChange(false);
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

          {/* Dossier de sauvegarde */}
          <div className="rounded-md border px-3 py-2 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
              {savedFolder ? (
                <>
                  <span className="text-muted-foreground">Dossier :</span>
                  <span className="font-medium truncate">{savedFolder}</span>
                  <button onClick={handlePickFolder} className="ml-auto text-xs text-muted-foreground hover:text-foreground underline shrink-0">Changer</button>
                  <button onClick={handleClearFolder} className="text-muted-foreground hover:text-destructive shrink-0" title="Oublier ce dossier"><X className="w-3.5 h-3.5" /></button>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground text-xs">Aucun dossier configuré — le PDF sera téléchargé dans Téléchargements</span>
                  <button onClick={handlePickFolder} className="ml-auto text-xs text-primary hover:underline shrink-0">Choisir un dossier</button>
                </>
              )}
            </div>

            {/* État PDF */}
            <div className="flex items-center gap-2 text-sm border-t pt-2">
              {generating ? (
                <><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Génération du PDF…</span></>
              ) : pdfReady ? (
                <><FileText className="w-4 h-4 text-emerald-600" /><span className="text-emerald-700 font-medium">PDF prêt</span><span className="text-muted-foreground">— sera sauvegardé automatiquement à l'envoi</span></>
              ) : (
                <><FileText className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">PDF non disponible</span></>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSend} disabled={!to}>
            <Send className="w-4 h-4 mr-2" /> Envoyer via Outlook
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
