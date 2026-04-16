import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  formatDate,
  calculerDateEcheance,
  type CommandeFournisseur,
  type Fournisseur,
  type LigneReception,
} from '@/lib/store';
import { AlertTriangle, CheckCircle2, Package } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commande: CommandeFournisseur | null;
  fournisseur?: Fournisseur;
  onConfirm: (data: {
    dateReception: string;
    dateLivraisonClientPrevue: string;
    dateEcheance: string;
    lignesRecues: LigneReception[];
  }) => void;
}

export default function ReceptionCommandeDialog({ open, onOpenChange, commande, fournisseur, onConfirm }: Props) {
  const today = new Date().toISOString().split('T')[0];

  const [dateReception, setDateReception] = useState(today);
  const [dateLivraisonClientPrevue, setDateLivraisonClientPrevue] = useState('');
  const [dateEcheance, setDateEcheance] = useState('');
  const [lignesRecues, setLignesRecues] = useState<LigneReception[]>([]);

  // Reset when commande changes
  useEffect(() => {
    if (commande) {
      const initialLignes: LigneReception[] = (Array.isArray(commande.lignes) ? commande.lignes : []).map(l => ({
        produitId: l.produitId,
        description: l.description,
        reference: l.reference,
        quantiteCommandee: l.quantite,
        quantiteRecue: l.quantite,
      }));
      setLignesRecues(initialLignes);
      setDateReception(today);
      setDateLivraisonClientPrevue('');
      const echeance = calculerDateEcheance(today, fournisseur?.delaiReglement || '45j FDM')
        .toISOString()
        .split('T')[0];
      setDateEcheance(echeance);
    }
  }, [commande]);

  // Recalculate dateEcheance when dateReception or fournisseur changes
  useEffect(() => {
    if (dateReception) {
      const echeance = calculerDateEcheance(dateReception, fournisseur?.delaiReglement || '45j FDM')
        .toISOString()
        .split('T')[0];
      setDateEcheance(echeance);
    }
  }, [dateReception, fournisseur]);

  if (!commande) return null;

  const lignesAvecEcart = lignesRecues.map(l => ({
    ...l,
    ecart: l.quantiteRecue - l.quantiteCommandee,
  }));

  const lignesManquantes = lignesAvecEcart.filter(l => l.ecart < 0);
  const livraisonComplete = lignesManquantes.length === 0;

  function updateQuantiteRecue(produitId: string, valeur: number) {
    setLignesRecues(prev =>
      prev.map(l => l.produitId === produitId ? { ...l, quantiteRecue: Math.max(0, valeur) } : l)
    );
  }

  function handleConfirm() {
    if (!dateReception) {
      toast.error('Veuillez saisir une date de réception');
      return;
    }
    onConfirm({ dateReception, dateLivraisonClientPrevue, dateEcheance, lignesRecues });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Réception de commande {commande.numero}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="date-reception">Date de réception</Label>
              <Input
                id="date-reception"
                type="date"
                value={dateReception}
                onChange={e => setDateReception(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date-livraison-client">Date livraison client prévue</Label>
              <Input
                id="date-livraison-client"
                type="date"
                value={dateLivraisonClientPrevue}
                onChange={e => setDateLivraisonClientPrevue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date-echeance">Date de règlement</Label>
              <Input
                id="date-echeance"
                type="date"
                value={dateEcheance}
                onChange={e => setDateEcheance(e.target.value)}
              />
              {fournisseur?.delaiReglement && (
                <p className="text-xs text-muted-foreground">Calculé : {fournisseur.delaiReglement}</p>
              )}
            </div>
          </div>

          {/* Quantités reçues */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Vérification des quantités reçues</h3>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Référence</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Description</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Commandé</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Reçu</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Écart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lignesAvecEcart.map(ligne => (
                    <tr key={ligne.produitId} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{ligne.reference}</td>
                      <td className="px-3 py-2">{ligne.description}</td>
                      <td className="px-3 py-2 text-center">{ligne.quantiteCommandee}</td>
                      <td className="px-3 py-2 text-center">
                        <Input
                          type="number"
                          min={0}
                          value={ligne.quantiteRecue}
                          onChange={e => updateQuantiteRecue(ligne.produitId, Number(e.target.value))}
                          className="w-20 mx-auto text-center h-7 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={
                            ligne.ecart < 0
                              ? 'font-semibold text-destructive'
                              : ligne.ecart > 0
                              ? 'font-semibold text-warning'
                              : 'text-success'
                          }
                        >
                          {ligne.ecart > 0 ? '+' : ''}{ligne.ecart}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Statut livraison */}
          {livraisonComplete ? (
            <div className="flex items-center gap-2 rounded-lg bg-success/10 text-success px-4 py-2.5 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Livraison complète
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-warning/10 text-warning px-4 py-2.5 text-sm font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Livraison incomplète : {lignesManquantes.length} article{lignesManquantes.length > 1 ? 's' : ''} manquant{lignesManquantes.length > 1 ? 's' : ''}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button onClick={handleConfirm}>
              Confirmer la réception
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
