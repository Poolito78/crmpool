import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Send, Loader2, FileText } from 'lucide-react';
import { type Devis, type Client, calculerTotalDevis, formatMontant, formatDate } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

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
  const [sending, setSending] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const pdfBlobRef = useRef<string | null>(null);

  useEffect(() => {
    if (!devis || !open) {
      setPdfReady(false);
      pdfBlobRef.current = null;
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

    // Génération automatique du PDF dès l'ouverture du dialog
    if (pdfContainerRef?.current) {
      setPdfReady(false);
      pdfBlobRef.current = null;
      // Légère attente pour laisser le DOM se stabiliser
      setTimeout(() => generatePdf(), 600);
    }
  }, [devis, client, open]);

  async function generatePdf() {
    if (!pdfContainerRef?.current || !devis) return;
    try {
      const element = pdfContainerRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = canvas.width / canvas.height;
      const imgWidth = pageWidth;
      const imgHeight = imgWidth / ratio;

      let yPos = 0;
      let remainingHeight = imgHeight;

      while (remainingHeight > 0) {
        const sliceHeight = Math.min(remainingHeight, pageHeight);
        const srcY = (imgHeight - remainingHeight) / imgHeight * canvas.height;
        const srcH = sliceHeight / imgHeight * canvas.height;

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = srcH;
        const ctx = pageCanvas.getContext('2d')!;
        ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);

        const pageImg = pageCanvas.toDataURL('image/jpeg', 0.92);
        if (yPos > 0) pdf.addPage();
        pdf.addImage(pageImg, 'JPEG', 0, 0, imgWidth, sliceHeight);

        remainingHeight -= sliceHeight;
        yPos += sliceHeight;
      }

      // Convertir en base64 (sans le préfixe data:)
      const base64 = pdf.output('datauristring').split(',')[1];
      pdfBlobRef.current = base64;
      setPdfReady(true);
    } catch (err) {
      console.error('Erreur génération PDF:', err);
    }
  }

  async function handleSend() {
    if (!to || !devis) return;
    setSending(true);
    try {
      const fileName = `Devis_${devis.numero}.pdf`;

      if (pdfBlobRef.current) {
        // Envoi via Supabase edge function (Resend)
        const { data, error } = await supabase.functions.invoke('send-devis-email', {
          body: {
            to,
            subject,
            body,
            pdfBase64: pdfBlobRef.current,
            fileName,
          },
        });

        if (error || data?.error) {
          throw new Error(error?.message || data?.error || 'Erreur envoi');
        }
      } else {
        // Fallback mailto sans PDF si la génération a échoué
        const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailto, '_blank');
      }

      onSent();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Fallback mailto en cas d'erreur edge function
      if (msg.includes('RESEND_API_KEY') || msg.includes('non configuré')) {
        alert(`⚠️ Resend non configuré.\n\nVotre client mail va s'ouvrir. Pensez à joindre manuellement le PDF.\n\nErreur : ${msg}`);
        const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailto, '_blank');
        // Proposer de télécharger le PDF quand même
        if (pdfBlobRef.current) downloadPdf();
        onSent();
        onOpenChange(false);
      } else {
        alert(`Erreur lors de l'envoi : ${msg}`);
      }
    } finally {
      setSending(false);
    }
  }

  function downloadPdf() {
    if (!pdfBlobRef.current || !devis) return;
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${pdfBlobRef.current}`;
    link.download = `Devis_${devis.numero}.pdf`;
    link.click();
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

          {/* Indicateur état PDF */}
          <div className="flex items-center gap-3">
            {pdfContainerRef ? (
              pdfReady ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600">
                  <FileText className="w-4 h-4" />
                  <span>PDF prêt — sera joint automatiquement à l'email</span>
                  <button onClick={downloadPdf} className="underline text-xs text-muted-foreground ml-2">Télécharger</button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Génération du PDF en cours…</span>
                </div>
              )
            ) : (
              <p className="text-xs text-muted-foreground">
                💡 Cliquer sur "Envoyer" ouvrira votre client mail. Pensez à joindre le PDF du devis.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Annuler</Button>
          <Button onClick={handleSend} disabled={!to || sending}>
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            {sending ? 'Envoi…' : 'Envoyer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
