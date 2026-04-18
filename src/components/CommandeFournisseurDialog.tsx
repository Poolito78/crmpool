import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Printer, AlertTriangle, Save, ExternalLink, Warehouse, PackageCheck, RotateCcw } from 'lucide-react';
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
  onPriseStock?: (items: { produitId: string; quantite: number }[]) => void;
}

export default function CommandeFournisseurDialog({ open, onOpenChange, devis, produits, fournisseurs, produitFournisseurs, onSaveCommandes, onPriseStock }: Props) {
  const navigate = useNavigate();
  const [priseStockIds, setPriseStockIds] = useState<Set<string>>(new Set());

  // Reset stock selection when dialog opens with a new devis
  useEffect(() => {
    if (open) setPriseStockIds(new Set());
  }, [open, devis?.id]);

  const { commandesParFournisseur, produitsSansFournisseur } = useMemo(() => {
    if (!devis) return { commandesParFournisseur: new Map<string, { fournisseur: Fournisseur; lignes: LigneCommande[] }>(), produitsSansFournisseur: [] as { produit: Produit; quantite: number; produitParent?: Produit }[] };

    const devisLignes = Array.isArray(devis.lignes) ? devis.lignes : [];
    const sansFournisseur: { produit: Produit; quantite: number; produitParent?: Produit }[] = [];
    const parFournisseur = new Map<string, { fournisseur: Fournisseur; lignes: LigneCommande[] }>();

    function resoudreLigne(produitId: string, qteParent: number, produitParent?: Produit): { produit: Produit; quantite: number; produitParent?: Produit }[] {
      const produit = produits.find(p => p.id === produitId);
      if (!produit) return [];

      if (produit.composants && produit.composants.length > 0) {
        const result: { produit: Produit; quantite: number; produitParent?: Produit }[] = [];
        for (const composant of produit.composants) {
          const lignesComposant = resoudreLigne(composant.produitId, composant.quantite * qteParent, produit);
          result.push(...lignesComposant);
        }
        return result;
      }

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

  function togglePriseStock(produitId: string) {
    setPriseStockIds(prev => {
      const next = new Set(prev);
      if (next.has(produitId)) next.delete(produitId);
      else next.add(produitId);
      return next;
    });
  }

  // Collect all lignes taken from stock (from supplier sections)
  const lignesSurStock = useMemo(() => {
    const result: { produit: Produit; quantite: number }[] = [];
    for (const [, { lignes }] of commandesParFournisseur) {
      for (const { produit, quantite } of lignes) {
        if (priseStockIds.has(produit.id)) {
          result.push({ produit, quantite });
        }
      }
    }
    // Also include produitsSansFournisseur taken from stock
    for (const { produit, quantite } of produitsSansFournisseur) {
      if (priseStockIds.has(produit.id)) {
        result.push({ produit, quantite });
      }
    }
    return result;
  }, [commandesParFournisseur, produitsSansFournisseur, priseStockIds]);

  function handlePrint() {
    window.print();
  }

  function handleSave() {
    if (!devis || !onSaveCommandes) return;
    const commandes: CommandeFournisseur[] = [];
    let idx = 1;

    for (const [, { fournisseur, lignes }] of commandesParFournisseur) {
      // Only include lignes NOT taken from stock
      const lignesPourCommande = lignes.filter(l => !priseStockIds.has(l.produit.id));
      if (lignesPourCommande.length === 0) continue; // All taken from stock, skip CF

      const totalAchat = lignesPourCommande.reduce((acc, l) => acc + l.produit.prixAchat * l.quantite, 0);
      const francoAtteint = totalAchat >= fournisseur.francoPort;
      const transport = francoAtteint ? 0 : fournisseur.coutTransport;
      commandes.push({
        id: generateId(),
        devisId: devis.id,
        fournisseurId: fournisseur.id,
        numero: `CF-${new Date().getFullYear()}-${devis.numero.split('-').pop()}-${String(idx).padStart(2, '0')}`,
        dateCreation: new Date().toISOString().split('T')[0],
        statut: 'en_attente',
        lignes: lignesPourCommande.map(l => ({
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

    // Handle stock items
    if (lignesSurStock.length > 0 && onPriseStock) {
      // Check if any stock is insufficient
      const manquants = lignesSurStock.filter(({ produit, quantite }) => (produit.stock ?? 0) < quantite);
      if (manquants.length > 0) {
        manquants.forEach(({ produit, quantite }) => {
          toast.warning(`Stock insuffisant : ${produit.reference} (disponible: ${produit.stock ?? 0}, requis: ${quantite})`);
        });
      }
      onPriseStock(lignesSurStock.map(({ produit, quantite }) => ({ produitId: produit.id, quantite })));
      toast.success(`${lignesSurStock.length} produit(s) prélevé(s) sur stock Isofloor`);
    }

    if (commandes.length > 0) {
      onSaveCommandes(commandes);
      toast.success(`${commandes.length} commande(s) fournisseur créée(s)`);
    }

    onOpenChange(false);
  }

  if (!devis) return null;

  const hasAnything = commandesParFournisseur.size > 0 || produitsSansFournisseur.some(p => p.produit.stock > 0);

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
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Produits sans fournisseur</p>
                <ul className="text-xs text-amber-700 dark:text-amber-400 mt-1 space-y-1.5">
                  {produitsSansFournisseur.map(({ produit, quantite, produitParent }, idx) => {
                    const surStock = priseStockIds.has(produit.id);
                    const hasStock = (produit.stock ?? 0) > 0;
                    return (
                      <li key={`${produit.id}-${idx}`} className="flex items-center gap-2 flex-wrap">
                        <span className={surStock ? 'line-through opacity-50' : ''}>
                          • {produit.reference} — {produit.description} (Qté: {quantite})
                          {produitParent && <span className="text-amber-500 ml-1">— composant de {produitParent.reference}</span>}
                        </span>
                        {hasStock && !surStock && (
                          <button
                            onClick={() => togglePriseStock(produit.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs font-medium hover:bg-emerald-200 dark:hover:bg-emerald-800/50 transition-colors"
                          >
                            <Warehouse className="w-3 h-3" />
                            Stock: {produit.stock}
                          </button>
                        )}
                        {surStock && (
                          <button
                            onClick={() => togglePriseStock(produit.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition-colors"
                          >
                            <PackageCheck className="w-3 h-3" />
                            Sur stock Isofloor
                            <RotateCcw className="w-3 h-3 ml-0.5" />
                          </button>
                        )}
                        {!hasStock && !surStock && (
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
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}

          <div className="space-y-4 py-2" id="commande-print">
            {Array.from(commandesParFournisseur.entries()).map(([fournId, { fournisseur, lignes }]) => {
              const lignesActives = lignes.filter(l => !priseStockIds.has(l.produit.id));
              const totalAchat = lignesActives.reduce((acc, l) => acc + l.produit.prixAchat * l.quantite, 0);
              const francoAtteint = totalAchat >= fournisseur.francoPort;
              const transport = francoAtteint ? 0 : fournisseur.coutTransport;
              const totalCommande = totalAchat + transport;
              const allOnStock = lignesActives.length === 0 && lignes.length > 0;

              return (
                <div key={fournId} className={`border rounded-xl overflow-hidden transition-opacity ${allOnStock ? 'border-emerald-300 dark:border-emerald-700 opacity-60' : 'border-border'}`}>
                  <div className="bg-muted/50 p-3 sm:p-4 border-b border-border">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                      <div>
                        <h3 className="font-heading font-semibold text-base sm:text-lg flex items-center gap-2">
                          {fournisseur.societe || fournisseur.nom}
                          {allOnStock && <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">Tout sur stock Isofloor</span>}
                        </h3>
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
                    {lignes.map(({ produit, quantite, pf }) => {
                      const surStock = priseStockIds.has(produit.id);
                      const hasStock = (produit.stock ?? 0) > 0;
                      return (
                        <div key={produit.id} className={`border-b border-border pb-2 last:border-0 last:pb-0 text-sm space-y-1 ${surStock ? 'opacity-50' : ''}`}>
                          <div className="flex items-start justify-between gap-2">
                            <p className={`font-medium ${surStock ? 'line-through' : ''}`}>{produit.description}</p>
                            {hasStock && (
                              <button
                                onClick={() => togglePriseStock(produit.id)}
                                className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${surStock ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200'}`}
                                title={surStock ? 'Retirer du stock' : 'Prendre sur stock Isofloor'}
                              >
                                {surStock ? <PackageCheck className="w-3 h-3" /> : <Warehouse className="w-3 h-3" />}
                                {surStock ? 'Isofloor ✓' : `Stock: ${produit.stock}`}
                              </button>
                            )}
                          </div>
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
                      );
                    })}
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
                          <th className="text-center py-2 font-semibold w-28">Stock Isofloor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lignes.map(({ produit, quantite, pf }) => {
                          const surStock = priseStockIds.has(produit.id);
                          const hasStock = (produit.stock ?? 0) > 0;
                          const stockInsuffisant = hasStock && (produit.stock ?? 0) < quantite;
                          return (
                            <tr key={produit.id} className={`border-b border-border transition-all ${surStock ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''}`}>
                              <td className={`py-2 ${surStock ? 'opacity-40' : ''}`}>{pf.referenceFournisseur || produit.reference}</td>
                              <td className={`py-2 ${surStock ? 'line-through opacity-40' : ''}`}>{produit.description}</td>
                              <td className={`py-2 text-right ${surStock ? 'opacity-40' : ''}`}>{quantite}</td>
                              <td className={`py-2 text-right ${surStock ? 'opacity-40' : ''}`}>{pf.conditionnementMin}</td>
                              <td className={`py-2 text-right ${surStock ? 'opacity-40' : ''}`}>{formatMontant(produit.prixAchat)}</td>
                              <td className={`py-2 text-right font-medium ${surStock ? 'opacity-40' : ''}`}>{formatMontant(produit.prixAchat * quantite)}</td>
                              <td className={`py-2 text-right text-muted-foreground ${surStock ? 'opacity-40' : ''}`}>{pf.delaiLivraison}j</td>
                              <td className="py-2 text-center">
                                {hasStock ? (
                                  <button
                                    onClick={() => togglePriseStock(produit.id)}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                                      surStock
                                        ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                                        : stockInsuffisant
                                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 border border-amber-300'
                                          : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-800/50'
                                    }`}
                                    title={surStock ? 'Cliquer pour annuler' : `Stock disponible : ${produit.stock}`}
                                  >
                                    {surStock ? (
                                      <><PackageCheck className="w-3 h-3" /> Isofloor ✓</>
                                    ) : (
                                      <><Warehouse className="w-3 h-3" /> {stockInsuffisant ? `⚠ ${produit.stock}` : produit.stock}</>
                                    )}
                                  </button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Totaux */}
                  {!allOnStock && (
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
                  )}
                </div>
              );
            })}

            {commandesParFournisseur.size === 0 && produitsSansFournisseur.length === 0 && (
              <p className="text-center py-8 text-muted-foreground">Aucun produit avec fournisseur assigné dans ce devis.</p>
            )}

            {/* Section récapitulatif Stock Isofloor */}
            {lignesSurStock.length > 0 && (
              <div className="border border-emerald-300 dark:border-emerald-700 rounded-xl overflow-hidden">
                <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3 sm:p-4 border-b border-emerald-200 dark:border-emerald-800">
                  <h3 className="font-heading font-semibold text-base flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                    <Warehouse className="w-5 h-5" />
                    Prise sur stock Isofloor
                  </h3>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">Ces produits seront prélevés sur votre stock interne — aucune commande fournisseur ne sera créée.</p>
                </div>
                <div className="p-3 sm:p-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
                        <th className="text-left py-1.5 font-semibold">Référence</th>
                        <th className="text-left py-1.5 font-semibold">Description</th>
                        <th className="text-right py-1.5 font-semibold">Qté requise</th>
                        <th className="text-right py-1.5 font-semibold">Stock actuel</th>
                        <th className="text-right py-1.5 font-semibold">Stock après</th>
                        <th className="text-center py-1.5 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignesSurStock.map(({ produit, quantite }) => {
                        const stockApres = (produit.stock ?? 0) - quantite;
                        const insuffisant = stockApres < 0;
                        return (
                          <tr key={produit.id} className="border-b border-emerald-100 dark:border-emerald-900/50 last:border-0">
                            <td className="py-2 font-mono text-xs">{produit.reference}</td>
                            <td className="py-2">{produit.description}</td>
                            <td className="py-2 text-right font-medium">{quantite}</td>
                            <td className="py-2 text-right text-muted-foreground">{produit.stock ?? 0}</td>
                            <td className={`py-2 text-right font-semibold ${insuffisant ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {insuffisant ? `⚠ ${stockApres}` : stockApres}
                            </td>
                            <td className="py-2 text-center">
                              <button
                                onClick={() => togglePriseStock(produit.id)}
                                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                title="Retirer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
            {(commandesParFournisseur.size > 0 || lignesSurStock.length > 0) && (
              <>
                <Button variant="outline" onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-2" /> Imprimer
                </Button>
                {onSaveCommandes && (
                  <Button onClick={handleSave}>
                    <Save className="w-4 h-4 mr-2" />
                    {lignesSurStock.length > 0 && commandesParFournisseur.size > 0
                      ? 'Enregistrer commandes + stock'
                      : lignesSurStock.length > 0
                        ? 'Valider prise sur stock'
                        : 'Enregistrer les commandes'}
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
