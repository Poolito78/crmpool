import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Send, Paperclip } from 'lucide-react';
import { type CommandeFournisseur, type CommandeClient, type Fournisseur, type Client, formatMontant, formatDate } from '@/lib/store';

type EmailTarget =
  | { type: 'fournisseur'; commande: CommandeFournisseur; contact: Fournisseur; pdfBase64?: string; pdfFileName?: string }
  | { type: 'facture'; commande: CommandeClient; contact: Client; pdfBase64?: string; pdfFileName?: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: EmailTarget | null;
  onSent?: () => void;
}

const _utf8Encoder = new TextEncoder();

function toQuotedPrintable(str: string): string {
  return str.split('\n').map(line => {
    const bytes = _utf8Encoder.encode(line);
    let out = '';
    for (const b of bytes) {
      if (b > 127 || b === 61) {
        out += '=' + b.toString(16).toUpperCase().padStart(2, '0');
      } else {
        out += String.fromCharCode(b);
      }
    }
    return out;
  }).join('\r\n');
}

function encodeHeader(str: string): string {
  if (/^[\x00-\x7F]*$/.test(str)) return str;
  const bytes = _utf8Encoder.encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

function generateAndDownloadEml(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  pdfBase64?: string;
  pdfFileName?: string;
}) {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const lines: string[] = [];

  lines.push('MIME-Version: 1.0');
  lines.push('X-Unsent: 1');
  lines.push(`From: ${params.from}`);
  lines.push(`To: ${params.to}`);
  lines.push(`Subject: ${encodeHeader(params.subject)}`);

  const htmlBody = params.body
    .split('\n')
    .map(l => l.trim() === '' ? '<br>' : `<p style="margin:0 0 0 0">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`)
    .join('\n');
  const fullHtml = `<html><body>${htmlBody}</body></html>`;

  if (params.pdfBase64 && params.pdfFileName) {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset="utf-8"');
    lines.push('Content-Transfer-Encoding: quoted-printable');
    lines.push('');
    lines.push(toQuotedPrintable(fullHtml));
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: application/pdf; name="${params.pdfFileName}"`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push(`Content-Disposition: attachment; filename="${params.pdfFileName}"`);
    lines.push('');
    const chunks = params.pdfBase64.match(/.{1,76}/g) ?? [];
    lines.push(...chunks);
    lines.push('');
    lines.push(`--${boundary}--`);
  } else {
    lines.push('Content-Type: text/html; charset="utf-8"');
    lines.push('Content-Transfer-Encoding: quoted-printable');
    lines.push('');
    lines.push(toQuotedPrintable(fullHtml));
  }

  const eml = lines.join('\r\n');
  const blob = new Blob([eml], { type: 'message/rfc822' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  // Pas de a.download → le navigateur ouvre avec l'app associée (.eml = Outlook)
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export default function CommandeEmailDialog({ open, onOpenChange, target, onSent }: Props) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (!target || !open) return;

    if (target.type === 'fournisseur') {
      const { commande, contact } = target;
      const lignes = Array.isArray(commande.lignes) ? commande.lignes : [];
      setTo(contact.email || '');
      setSubject(`Commande ${commande.numero}${contact.societe ? ` — ${contact.societe}` : ''}`);
      setBody(
`Bonjour${contact.nom ? ` ${contact.nom}` : ''},

Veuillez trouver ci-joint notre commande ${commande.numero} d'un montant de ${formatMontant(commande.totalTTC)} TTC.

Détail :
${lignes.map(l => `- ${l.description} (Réf: ${l.reference}) × ${l.quantite} = ${formatMontant(l.prixAchat * l.quantite)}`).join('\n')}

Total HT : ${formatMontant(commande.totalHT)}
Transport : ${commande.fraisTransport > 0 ? formatMontant(commande.fraisTransport) : 'Franco'}
Total TTC : ${formatMontant(commande.totalTTC)}

Merci de confirmer la réception de cette commande et de nous communiquer le délai de livraison.

Cordialement,
[Votre nom]
[Votre entreprise]`
      );
    } else {
      const { commande, contact } = target;
      setTo(contact.email || '');
      setSubject(`Facture ${commande.numero}${commande.referenceAffaire ? ` — Réf. ${commande.referenceAffaire}` : ''}${contact.societe ? ` — ${contact.societe}` : ''}`);
      setBody(
`Bonjour${contact.nom ? ` ${contact.nom}` : ''},

Veuillez trouver ci-joint notre facture ${commande.numero} d'un montant de ${formatMontant(commande.totalTTC)} TTC.

Détail :
- Total HT : ${formatMontant(commande.totalHT)}
- Total TVA : ${formatMontant(commande.totalTVA)}
- Total TTC : ${formatMontant(commande.totalTTC)}
${commande.fraisPortHT > 0 ? `- Frais de port : ${formatMontant(commande.fraisPortHT)}` : ''}
${commande.dateEcheance ? `\nDate d'échéance de paiement : ${formatDate(commande.dateEcheance)}` : ''}

Restant à votre disposition pour toute question.

Cordialement,
[Votre nom]
[Votre entreprise]`
      );
    }
  }, [target, open]);

  function handleSend() {
    const pdfBase64 = target?.pdfBase64;
    const pdfFileName = target?.pdfFileName;

    generateAndDownloadEml({
      from: 'f.mouhot@isosign.fr',
      to,
      subject,
      body,
      pdfBase64,
      pdfFileName,
    });
    onSent?.();
    onOpenChange(false);
  }

  if (!target) return null;
  const title = target.type === 'fournisseur'
    ? `Envoyer commande ${target.commande.numero}`
    : `Envoyer facture ${target.commande.numero}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" /> {title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Destinataire</Label>
            <Input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="email@exemple.com" />
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
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Paperclip className="w-3 h-3 shrink-0" />
            {target?.pdfBase64
              ? 'Le PDF sera joint automatiquement — ouvrez le fichier .eml téléchargé dans Outlook.'
              : 'Un fichier .eml sera téléchargé — ouvrez-le dans Outlook pour envoyer.'}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSend} disabled={!to}>
            <Send className="w-4 h-4 mr-2" /> {target?.pdfBase64 ? 'Ouvrir dans Outlook (avec PDF)' : 'Ouvrir dans Outlook'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
