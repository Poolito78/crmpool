import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Send, Loader2, FileText, FolderOpen, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { type Devis, type Client, type Produit, calculerTotalDevis, formatMontant, formatDate } from '@/lib/store';
import { toast } from 'sonner';
import { generatePdfFromElement, writeFileToFolder, getStoredDirHandle, clearStoredDirHandle } from '@/lib/pdfFolder';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devis: Devis | null;
  client?: Client;
  produits?: Produit[];
  onSent: () => void;
  pdfContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export default function DevisEmailDialog({ open, onOpenChange, devis, client, produits = [], onSent, pdfContainerRef }: Props) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const [savedFolder, setSavedFolder] = useState<string | null>(null);
  const pdfBase64Ref = useRef<string | null>(null);

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

Suite à notre échange, veuillez trouver ci-joint notre devis ${devis.numero}${devis.referenceAffaire ? ` (Réf. ${devis.referenceAffaire})` : ''} d'un montant de ${formatMontant(totals.totalHT)} HT.
Ce devis est valable jusqu'au ${formatDate(devis.dateValidite)}.

Restant à votre disposition pour tout complément d'information.

Cordialement,

François MOUHOT
📞 06 31 61 15 96
📧 f.mouhot@isosign.fr
🌐 www.isosign.fr
🌐 www.isofloor.fr`
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
      pdfBase64Ref.current = await generatePdfFromElement(pdfContainerRef.current);
      setPdfReady(true);
    } catch (err) {
      console.error('Erreur génération PDF:', err);
    } finally {
      setGenerating(false);
    }
  }

  async function handlePickFolder() {
    const res = await writeFileToFolder('_init', new Uint8Array(0), true);
    if (res.ok) setSavedFolder(res.folderName ?? null);
  }

  async function handleSend() {
    if (!to || !devis || !pdfBase64Ref.current) return;
    setSending(true);

    const pdfFileName = `Devis_${devis.numero}.pdf`;
    const pdfBytes = Uint8Array.from(atob(pdfBase64Ref.current), c => c.charCodeAt(0));

    // 1. Sauvegarder PDF dans le dossier Préco
    const folderRes = await writeFileToFolder(pdfFileName, pdfBytes);
    if (folderRes.ok) setSavedFolder(folderRes.folderName ?? null);

    // 1b. Sauvegarder les références produits pour la macro VBA Outlook
    if (folderRes.ok && devis && produits.length > 0) {
      const refs = devis.lignes
        .map(l => produits.find(p => p.id === l.produitId))
        .filter(Boolean)
        .map(p => p!.description || p!.reference || '')
        .filter(Boolean);
      if (refs.length > 0) {
        const refsContent = refs.join('\n');
        const refsBytes = new TextEncoder().encode(refsContent);
        const refsFileName = `Devis_${devis.numero}_refs.txt`;
        await writeFileToFolder(refsFileName, refsBytes);
      }
    }

    // 2. Envoyer via Resend (edge function) avec PDF en pièce jointe
    try {
      const { data, error } = await supabase.functions.invoke('send-devis-email', {
        body: {
          to,
          subject,
          body,
          pdfBase64: pdfBase64Ref.current,
          fileName: pdfFileName,
        },
      });

      if (error || data?.error) {
        throw new Error(error?.message || data?.error || 'Erreur envoi');
      }

      toast.success('Mail envoyé avec le PDF en pièce jointe', {
        description: folderRes.ok ? `PDF aussi sauvegardé dans "${folderRes.folderName}"` : '',
        duration: 6000,
      });
      onSent();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Fallback mailto si Resend non configuré
      toast.error(`Envoi échoué — ouverture Outlook (${msg})`, { duration: 8000 });
      const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(mailto, '_blank');
      onSent();
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  }

  if (!devis) return null;

  const canSend = !!(to && pdfReady && !generating && !sending);

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
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[260px] font-mono"
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          </div>

          {/* Statut PDF + dossier */}
          <div className="rounded-md border px-3 py-2 space-y-2 text-sm">
            {/* PDF */}
            <div className="flex items-center gap-2">
              {generating ? (
                <><Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" /><span className="text-muted-foreground">Génération du PDF…</span></>
              ) : pdfReady ? (
                <><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /><span className="text-emerald-700 font-medium">PDF prêt</span><span className="text-muted-foreground ml-1">— sera joint automatiquement</span></>
              ) : (
                <><AlertCircle className="w-4 h-4 text-amber-500 shrink-0" /><span className="text-amber-600">PDF non disponible</span></>
              )}
            </div>

            {/* Dossier Préco */}
            <div className="flex items-center gap-2 border-t pt-2">
              <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
              {savedFolder ? (
                <>
                  <span className="text-muted-foreground">Copie dans :</span>
                  <span className="font-medium truncate">{savedFolder}</span>
                  <button onClick={handlePickFolder} className="ml-auto text-xs text-muted-foreground hover:text-foreground underline shrink-0">Changer</button>
                  <button onClick={async () => { await clearStoredDirHandle(); setSavedFolder(null); }} className="text-muted-foreground hover:text-destructive shrink-0"><X className="w-3.5 h-3.5" /></button>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground text-xs">Aucun dossier de copie configuré</span>
                  <button onClick={handlePickFolder} className="ml-auto text-xs text-primary hover:underline shrink-0">Choisir Préco…</button>
                </>
              )}
            </div>

            <p className="text-xs text-muted-foreground border-t pt-2">
              <FileText className="w-3 h-3 inline mr-1" />
              Le PDF sera envoyé en pièce jointe via Resend et copié dans le dossier.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Annuler</Button>
          <Button onClick={handleSend} disabled={!canSend}>
            {sending
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Envoi…</>
              : <><Send className="w-4 h-4 mr-2" /> Envoyer</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
