import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Printer, AlertTriangle, Save, ExternalLink } from 'lucide-react';
import { type Devis, type Produit, type Fournisseur, type ProduitFournisseur, type CommandeFournisseur, calculerFournisseurPrioritaire, formatMontant, formatDate, generateId } from '@/lib/store';
import { toast } from 'sonner';

interface LigneCommande {
  produit: Produit;
  quantite: number;
  pf: ProduitFournisseur;
  fournisseur: Fournisseur;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devis: Devis | null;
  produits: Produit[];
  fournisseurs: Fournisseur[];
  produitFournisseurs: ProduitFournisseur[];
  onSaveCommandes?: (commandes: CommandeFournisseur[]) => void;
}

export default function CommandeFournisseurDialog({ open, onOpenChange, devis, produits, fournisseurs, produitFournisseurs, onSaveCommandes }: Props) {
  const navigate = useNavigate();

  const { commandesParFournisseur, produitsSansFournisseur } = useMemo(() => {
    if (!devis) return { commandesParFournisseur: new Map<string, { fournisseur: Fournisseur; lignes: LigneCommande[] }>(), produitsSansFournisseur: [] as { produit: Produit; quantite: number; produitParent?: Produit }[] };

    const devisLignes = Array.isArray(devis.lignes) ? devis.lignes : [];
    const sansFournisseur: { produit: Produit; quantite: number; produitParent?: Produit }[] = [];
    const parFournisseur = new Map<string, { fournisseur: Fournisseur; lignes: LigneCommande[] }>();

    // Résout une ligne en liste de (produit, quantité, produitParent?)
    // Si le produit est composé, on descend dans ses composants
    function resoudreLigne(produitId: string, qteParent: number, produitParent?: Produit): { produit: Produit; quantite: number; produitParent?: Produit }[] {
      const produit = produits.find(p => p.id === produitId);
      if (!produit) return [];

      if (produit.composants && produit.composants.length > 0) {
        // Produit composé : on éclate en composants
        const result: { produit: Produit; quantite: number; produitParent?: Produit }[] = [];
        for (const composant of produit.composants) {
          const lignesComposant = resoudreLigne(composant.produitId, composant.quantite * qteParent, produit);
          result.push(...lignesComposant);
        }
        return result;
      }

      // Produit simple
      return [{ produit, quantite: qteParent, produitParent }];
    }

    for (const ligne of devisLignes) {
      if (!ligne.produitId) continue;
      const qteLigne = Number.isFinite(Number(ligne.quantite)) && Number(ligne.quantite) > 0 ? Number(ligne.quantite) : 1;

      const unitesACommander = resoudreLigne(ligne.produitId, qteLigne);

      for (const { produit, quantite, produitParent } of unitesACommander) {
        const pf = calculerFournisseurPrioritaire(produit.id, quantite, produitFournisseurs, fournisseurs);
        if (!pf) {
          sansFournisseur.push({ produit, quantite, produitParent });
          continue;
        }

        const fourn = fournisseurs.find(f => f.id === pf.fournisseurId);
        if (!fourn) {
          sansFournisseur.push({ produit, quantite, produitParent });
          continue;
        }

        if (!parFournisseur.has(fourn.id)) {
          parFournisseur.set(fourn.id, { fournisseur: fourn, lignes: [] });
        }

        // Si le même produit/composant est déjà dans la commande fournisseur (cas de composants partagés), on cumule
        const existant = parFournisseur.get(fourn.id)!.lignes.find(l => l.produit.id === produit.id);
        if (existant) {
          existant.quantite += Math.max(quantite, Number(pf.conditionnementMin) || 1);
        } else {
          parFournisseur.get(fourn.id)!.lignes.push({
            produit,
            quantite: Math.max(quantite, Number(pf.conditionnementMin) || 1),
            pf,
            fournisseur: fourn,
          });
        }
      }
    }

    return { commandesParFournisseur: parFournisseur, produitsSansFournisseur: sansFournisseur };
  }, [devis, produits, fournisseurs, produitFournisseurs]);

  function handlePrint() {
    window.print();
  }

  function handleSave() {
    if (!devis || !onSaveCommandes) return;
    const commandes: CommandeFournisseur[] = [];
    let idx = 1;
    for (const [, { fournisseur, lignes }] of commandesParFournisseur) {
      const totalAchat = lignes.reduce((acc, l) => acc + l.produit.prixAchat * l.quantite, 0);
      const francoAtteint = totalAchat >= fournisseur.francoPort;
      const transport = francoAtteint ? 0 : fournisseur.coutTransport;
      commandes.push({
        id: generateId(),
        devisId: devis.id,
        fournisseurId: fournisseur.id,
        numero: `CF-${new Date().getFullYear()}-${devis.numero.split('-').pop()}-${String(idx).padStart(2, '0')}`,
        dateCreation: new Date().toISOString().split('T')[0],
        statut: 'en_attente',
        lignes: lignes.map(l => ({
          produitId: l.produit.id,
          description: l.produit.description,
          reference: l.pf.referenceFournisseur || l.produit.reference,
          quantite: l.quantite,
          prixAchat: l.produit.prixAchat,
          total: l.produit.prixAchat * l.quantite,
        })),
        totalHT: totalAchat,
        fraisTransport: transport,
        totalTTC: totalAchat + transport,
      });
      idx++;
    }
    onSaveCommandes(commandes);
    toast.success(`${commandes.length} commande(s) fournisseur créée(s)`);
    onOpenChange(false);
  }

  if (!devis) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <ShoppingCart className="w-5 h-5" />
              <span className="truncate">Commande — {devis.numero}</span>
            </DialogTitle>
          </DialogHeader>

          {produitsSansFournisseur.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Produits sans fournisseur</p>
                <ul className="text-xs text-amber-700 dark:text-amber-400 mt-1 space-y-1">
                  {produitsSansFournisseur.map(({ produit, quantite, produitParent }, idx) => (
                    <li key={`${produit.id}-${idx}`} className="flex items-center gap-1 flex-wrap">
                      <span>• {produit.reference} — {produit.description} (Qté: {quantite}){produitParent && <span className="text-amber-500 ml-1">— composant de {produitParent.reference}</span>}</span>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs text-amber-800 dark:text-amber-300 underline"
                        onClick={() => {
                          onOpenChange(false);
                          navigate(`/produits?highlight=${produit.id}&from=devis${devis ? `&devisId=${devis.id}` : ''}`);
                        }}
                      >
                        <ExternalLink className="w-3 h-3 mr-0.5" /> Ajouter fournisseur
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="space-y-4 py-2" id="commande-print">
            {Array.from(commandesParFournisseur.entries()).map(([fournId, { fournisseur, lignes }]) => {
              const totalAchat = lignes.reduce((acc, l) => acc + l.produit.prixAchat * l.quantite, 0);
              const francoAtteint = totalAchat >= fournisseur.francoPort;
              const transport = francoAtteint ? 0 : fournisseur.coutTransport;
              const totalCommande = totalAchat + transport;

              return (
                <div key={fournId} className="border border-border rounded-xl overflow-hidden">
                  <div className="bg-muted/50 p-3 sm:p-4 border-b border-border">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                      <div>
                        <h3 className="font-heading font-semibold text-base sm:text-lg">{fournisseur.societe || fournisseur.nom}</h3>
                        <p className="text-xs sm:text-sm text-muted-foreground">{fournisseur.adresse}, {fournisseur.codePostal} {fournisseur.ville}</p>
                        {fournisseur.email && <p className="text-xs sm:text-sm text-muted-foreground">{fournisseur.email} • {fournisseur.telephone}</p>}
                      </div>
                      <div className="text-xs sm:text-sm text-muted-foreground sm:text-right">
                        <p>Date : {formatDate(new Date().toISOString().split('T')[0])}</p>
                        <p>Réf. devis : {devis.numero}</p>
                      </div>
                    </div>
                  </div>

                  {/* Mobile card view */}
                  <div className="p-3 sm:hidden space-y-3">
                    {lignes.map(({ produit, quantite, pf }) => (
                      <div key={produit.id} className="border-b border-border pb-2 last:border-0 last:pb-0 text-sm space-y-1">
                        <p className="font-medium">{produit.description}</p>
                        <p className="text-xs text-muted-foreground font-mono">{pf.referenceFournisseur || produit.reference}</p>
                        <div className="flex justify-between text-xs">
                          <span>Qté: {quantite} (min. {pf.conditionnementMin})</span>
                          <span className="font-medium">{formatMontant(produit.prixAchat * quantite)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>P.U. {formatMontant(produit.prixAchat)}</span>
                          <span>Délai {pf.delaiLivraison}j</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="p-4 hidden sm:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-primary/30">
                          <th className="text-left py-2 font-semibold">Réf.</th>
                          <th className="text-left py-2 font-semibold">Description</th>
                          <th className="text-right py-2 font-semibold">Qté</th>
                          <th className="text-right py-2 font-semibold">Cond.</th>
                          <th className="text-right py-2 font-semibold">P.U.</th>
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
                            <td className="py-2 text-right">{formatMontant(produit.prixAchat)}</td>
                            <td className="py-2 text-right font-medium">{formatMontant(produit.prixAchat * quantite)}</td>
                            <td className="py-2 text-right text-muted-foreground">{pf.delaiLivraison}j</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totaux */}
                  <div className="px-3 sm:px-4 pb-3 sm:pb-4">
                    <div className="flex justify-end">
                      <div className="w-full sm:w-64 space-y-1 text-sm">
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

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
            {commandesParFournisseur.size > 0 && (
              <>
                <Button variant="outline" onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-2" /> Imprimer
                </Button>
                {onSaveCommandes && (
                  <Button onClick={handleSave}>
                    <Save className="w-4 h-4 mr-2" /> Enregistrer les commandes
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
