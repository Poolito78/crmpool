import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Send, Loader2, FileText, Download } from 'lucide-react';
import { type Devis, type Client, calculerTotalDevis, formatMontant, formatDate } from '@/lib/store';
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
  const [generating, setGenerating] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const pdfBase64Ref = useRef<string | null>(null);

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

    // Génération automatique du PDF dès l'ouverture
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
      const element = pdfContainerRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let yOffset = 0;
      let page = 0;
      while (yOffset < imgHeight) {
        if (page > 0) pdf.addPage();
        const srcY = (yOffset / imgHeight) * canvas.height;
        const srcH = Math.min((pageHeight / imgHeight) * canvas.height, canvas.height - srcY);
        const sliceH = (srcH / canvas.height) * imgHeight;

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = srcH;
        pageCanvas.getContext('2d')!.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
        pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgWidth, sliceH);

        yOffset += pageHeight;
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

  function downloadPdf() {
    if (!pdfBase64Ref.current || !devis) return;
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${pdfBase64Ref.current}`;
    link.download = `Devis_${devis.numero}.pdf`;
    link.click();
  }

  function handleSend() {
    if (!to || !devis) return;

    // 1. Télécharger le PDF automatiquement
    if (pdfBase64Ref.current) {
      downloadPdf();
    }

    // 2. Ouvrir Outlook avec le mail pré-rempli
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, '_blank');

    // 3. Statut → envoyé
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

          {/* Statut PDF */}
          <div className="rounded-md border px-3 py-2 text-sm flex items-center gap-2">
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Génération du PDF…</span>
              </>
            ) : pdfReady ? (
              <>
                <FileText className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-700 font-medium">PDF prêt</span>
                <span className="text-muted-foreground">— sera téléchargé automatiquement, puis joignez-le dans Outlook</span>
                <button onClick={downloadPdf} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline">
                  <Download className="w-3 h-3" /> Télécharger
                </button>
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">PDF non disponible — Outlook s'ouvrira sans pièce jointe</span>
              </>
            )}
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
