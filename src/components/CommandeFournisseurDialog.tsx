import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ShoppingCart, Printer, AlertTriangle } from 'lucide-react';
import { type Devis, type Produit, type Fournisseur, type ProduitFournisseur, calculerFournisseurPrioritaire, formatMontant, formatDate } from '@/lib/store';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devis: Devis | null;
  produits: Produit[];
  fournisseurs: Fournisseur[];
  produitFournisseurs: ProduitFournisseur[];
}

interface LigneCommande {
  produit: Produit;
  quantite: number;
  pf: ProduitFournisseur;
  fournisseur: Fournisseur;
}

export default function CommandeFournisseurDialog({ open, onOpenChange, devis, produits, fournisseurs, produitFournisseurs }: Props) {
  const [alertOpen, setAlertOpen] = useState(false);

  const { commandesParFournisseur, produitsSansFournisseur } = useMemo(() => {
    if (!devis) return { commandesParFournisseur: new Map<string, { fournisseur: Fournisseur; lignes: LigneCommande[] }>(), produitsSansFournisseur: [] as { produit: Produit; quantite: number }[] };

    const sansFournisseur: { produit: Produit; quantite: number }[] = [];
    const parFournisseur = new Map<string, { fournisseur: Fournisseur; lignes: LigneCommande[] }>();

    for (const ligne of devis.lignes) {
      if (!ligne.produitId) continue;
      const produit = produits.find(p => p.id === ligne.produitId);
      if (!produit) continue;

      const pf = calculerFournisseurPrioritaire(produit.id, ligne.quantite, produitFournisseurs, fournisseurs);
      if (!pf) {
        sansFournisseur.push({ produit, quantite: ligne.quantite });
        continue;
      }

      const fourn = fournisseurs.find(f => f.id === pf.fournisseurId);
      if (!fourn) {
        sansFournisseur.push({ produit, quantite: ligne.quantite });
        continue;
      }

      if (!parFournisseur.has(fourn.id)) {
        parFournisseur.set(fourn.id, { fournisseur: fourn, lignes: [] });
      }
      parFournisseur.get(fourn.id)!.lignes.push({ produit, quantite: Math.max(ligne.quantite, pf.conditionnementMin), pf, fournisseur: fourn });
    }

    return { commandesParFournisseur: parFournisseur, produitsSansFournisseur: sansFournisseur };
  }, [devis, produits, fournisseurs, produitFournisseurs]);

  function handlePrint() {
    window.print();
  }

  if (!devis) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Commande fournisseur — Devis {devis.numero}
            </DialogTitle>
          </DialogHeader>

          {produitsSansFournisseur.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Produits sans fournisseur assigné</p>
                <ul className="text-xs text-amber-700 dark:text-amber-400 mt-1 space-y-0.5">
                  {produitsSansFournisseur.map(({ produit, quantite }) => (
                    <li key={produit.id}>• {produit.reference} — {produit.description} (Qté: {quantite})</li>
                  ))}
                </ul>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
                  Assignez un fournisseur à ces produits depuis la fiche produit pour les inclure dans la commande.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-6 py-2" id="commande-print">
            {Array.from(commandesParFournisseur.entries()).map(([fournId, { fournisseur, lignes }]) => {
              const totalAchat = lignes.reduce((acc, l) => acc + l.pf.prixAchat * l.quantite, 0);
              const francoAtteint = totalAchat >= fournisseur.francoPort;
              const transport = francoAtteint ? 0 : fournisseur.coutTransport;
              const totalCommande = totalAchat + transport;

              return (
                <div key={fournId} className="border border-border rounded-xl overflow-hidden">
                  {/* En-tête fournisseur */}
                  <div className="bg-muted/50 p-4 border-b border-border">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-heading font-semibold text-lg">{fournisseur.societe || fournisseur.nom}</h3>
                        <p className="text-sm text-muted-foreground">{fournisseur.adresse}, {fournisseur.codePostal} {fournisseur.ville}</p>
                        {fournisseur.email && <p className="text-sm text-muted-foreground">{fournisseur.email} • {fournisseur.telephone}</p>}
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-muted-foreground">Date : {formatDate(new Date().toISOString().split('T')[0])}</p>
                        <p className="text-muted-foreground">Réf. devis : {devis.numero}</p>
                        {devis.referenceAffaire && <p className="text-muted-foreground">Réf. affaire : {devis.referenceAffaire}</p>}
                      </div>
                    </div>
                  </div>

                  {/* Tableau */}
                  <div className="p-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-primary/30">
                          <th className="text-left py-2 font-semibold">Réf. fournisseur</th>
                          <th className="text-left py-2 font-semibold">Description</th>
                          <th className="text-right py-2 font-semibold">Qté</th>
                          <th className="text-right py-2 font-semibold">Cond. min</th>
                          <th className="text-right py-2 font-semibold">P.U. Achat</th>
                          <th className="text-right py-2 font-semibold">Total</th>
                          <th className="text-right py-2 font-semibold">Délai</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lignes.map(({ produit, quantite, pf }) => (
                          <tr key={produit.id} className="border-b border-border">
                            <td className="py-2">{pf.referenceFournisseur || produit.reference}</td>
                            <td className="py-2">{produit.description}</td>
                            <td className="py-2 text-right">{quantite}</td>
                            <td className="py-2 text-right">{pf.conditionnementMin}</td>
                            <td className="py-2 text-right">{formatMontant(pf.prixAchat)}</td>
                            <td className="py-2 text-right font-medium">{formatMontant(pf.prixAchat * quantite)}</td>
                            <td className="py-2 text-right text-muted-foreground">{pf.delaiLivraison}j</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Totaux */}
                    <div className="flex justify-end mt-4">
                      <div className="w-64 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total achat HT</span>
                          <span>{formatMontant(totalAchat)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Transport</span>
                          <span>{francoAtteint ? <span className="text-success">Franco ✓</span> : formatMontant(transport)}</span>
                        </div>
                        {!francoAtteint && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Franco à partir de</span>
                            <span className="text-muted-foreground">{formatMontant(fournisseur.francoPort)}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-border pt-1 mt-1">
                          <span className="font-semibold">Total commande</span>
                          <span className="font-heading font-bold">{formatMontant(totalCommande)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {commandesParFournisseur.size === 0 && (
              <p className="text-center py-8 text-muted-foreground">Aucun produit avec fournisseur assigné dans ce devis.</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
            {commandesParFournisseur.size > 0 && (
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" /> Imprimer
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
