import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Mail, FileText, Pencil } from 'lucide-react';
import { type CommandeFournisseur, type Fournisseur, formatMontant, formatDate } from '@/lib/store';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commande: CommandeFournisseur | null;
  fournisseur?: Fournisseur;
  onEmail?: () => void;
  onEdit?: () => void;
}

export default function CommandeFournisseurPreviewDialog({ open, onOpenChange, commande, fournisseur, onEmail, onEdit }: Props) {
  if (!commande) return null;
  const lignes = Array.isArray(commande.lignes) ? commande.lignes : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" /> Commande {commande.numero}
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 sm:px-8 pb-6 max-w-[800px] mx-auto text-sm space-y-6" id="cmd-fournisseur-print">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <h2 className="font-heading text-2xl font-bold text-primary">MonCRM</h2>
              <p className="text-muted-foreground text-xs mt-1">Votre entreprise</p>
            </div>
            <div className="text-right">
              <p className="font-heading font-bold text-lg">COMMANDE FOURNISSEUR</p>
              <p className="text-muted-foreground text-xs">N° {commande.numero}</p>
              <p className="text-muted-foreground text-xs">Date : {formatDate(commande.dateCreation)}</p>
              {commande.dateEcheance && <p className="text-muted-foreground text-xs">Échéance : {formatDate(commande.dateEcheance)}</p>}
            </div>
          </div>

          {/* Fournisseur */}
          {fournisseur && (
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-1">Fournisseur</p>
              <p className="font-semibold">{fournisseur.societe || fournisseur.nom}</p>
              <p className="text-xs text-muted-foreground">{fournisseur.adresse}, {fournisseur.codePostal} {fournisseur.ville}</p>
              {fournisseur.email && <p className="text-xs text-muted-foreground">{fournisseur.email} • {fournisseur.telephone}</p>}
            </div>
          )}

          {/* Lignes */}
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b-2 border-primary/30">
                  <th className="text-left py-2 px-3 font-semibold">Réf.</th>
                  <th className="text-left py-2 px-3 font-semibold">Description</th>
                  <th className="text-right py-2 px-3 font-semibold">Qté</th>
                  <th className="text-right py-2 px-3 font-semibold">P.U.</th>
                  <th className="text-right py-2 px-3 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 px-3 font-mono text-xs">{l.reference}</td>
                    <td className="py-2 px-3">{l.description}</td>
                    <td className="py-2 px-3 text-right">{l.quantite}</td>
                    <td className="py-2 px-3 text-right">{formatMontant(l.prixAchat)}</td>
                    <td className="py-2 px-3 text-right font-medium">{formatMontant(l.prixAchat * l.quantite)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totaux */}
          <div className="flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total HT</span><span className="font-medium">{formatMontant(commande.totalHT)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Transport</span><span>{commande.fraisTransport > 0 ? formatMontant(commande.fraisTransport) : <span className="text-success">Franco ✓</span>}</span></div>
              <div className="flex justify-between border-t border-border pt-1 font-bold text-base"><span>Total TTC</span><span>{formatMontant(commande.totalTTC)}</span></div>
            </div>
          </div>

          {commande.notes && (
            <div className="text-xs text-muted-foreground bg-muted p-3 rounded-lg">
              <p className="font-semibold mb-1">Notes :</p>
              <p>{commande.notes}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 print:hidden">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
          {onEdit && (
            <Button variant="outline" onClick={onEdit}>
              <Pencil className="w-4 h-4 mr-2" /> Modifier
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" /> Imprimer / PDF
          </Button>
          {onEmail && (
            <Button onClick={onEmail}>
              <Mail className="w-4 h-4 mr-2" /> Envoyer par email
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
