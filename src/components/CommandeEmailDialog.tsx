import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Send } from 'lucide-react';
import { type CommandeFournisseur, type CommandeClient, type Fournisseur, type Client, formatMontant, formatDate } from '@/lib/store';

type EmailTarget =
  | { type: 'fournisseur'; commande: CommandeFournisseur; contact: Fournisseur }
  | { type: 'facture'; commande: CommandeClient; contact: Client };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: EmailTarget | null;
  onSent?: () => void;
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
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, '_blank');
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
          <p className="text-xs text-muted-foreground">
            💡 Cliquer sur "Envoyer" ouvrira votre client mail (Outlook, etc.) avec le message pré-rempli. Pensez à joindre le PDF.
          </p>
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
