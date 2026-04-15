import { useCRM } from '@/lib/StoreContext';
import { formatMontant, calculerFournisseurPrioritaire } from '@/lib/store';
import { AlertTriangle, CheckCircle, Package, Truck, Download, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportToExcel } from '@/lib/exportExcel';

export default function Stock() {
  const { produits, fournisseurs, produitFournisseurs } = useCRM();

  const sorted = [...produits].sort((a, b) => {
    const aLow = a.stock < a.stockMin ? 0 : 1;
    const bLow = b.stock < b.stockMin ? 0 : 1;
    return aLow - bLow || a.description.localeCompare(b.description);
  });

  const totalStock = produits.reduce((s, p) => s + p.stock, 0);
  const totalValeur = produits.reduce((s, p) => s + p.stock * p.prixHT, 0);
  const alertes = produits.filter(p => p.stock < p.stockMin).length;

  // Calcul du fournisseur optimal par produit en alerte
  function getBestSupplierInfo(p: typeof produits[0]) {
    const qte = Math.max(1, p.stockMin - p.stock);
    const pfs = produitFournisseurs.filter(pf => pf.produitId === p.id);
    
    // Si pas de multi-fournisseurs, fallback sur fournisseurId legacy
    if (pfs.length === 0) {
      const fourn = fournisseurs.find(f => f.id === p.fournisseurId);
      return fourn ? { fourn, prixAchat: p.prixAchat, qte, totalAchat: p.prixAchat * qte, transport: 0, coutGlobal: p.prixAchat * qte, isMulti: false } : null;
    }

    const best = calculerFournisseurPrioritaire(p.id, qte, produitFournisseurs, fournisseurs);
    if (!best) return null;
    const fourn = fournisseurs.find(f => f.id === best.fournisseurId);
    if (!fourn) return null;
    
    const realQte = Math.max(qte, best.conditionnementMin);
    const totalAchat = best.prixAchat * realQte;
    const transport = totalAchat >= fourn.francoPort ? 0 : fourn.coutTransport;
    return { fourn, prixAchat: best.prixAchat, qte: realQte, totalAchat, transport, coutGlobal: totalAchat + transport, isMulti: pfs.length > 1, nbFournisseurs: pfs.length };
  }

  // Grouper les réappros par fournisseur optimal
  const produitsEnAlerte = produits.filter(p => p.stock < p.stockMin);
  const reapproParFournisseur = new Map<string, { fourn: typeof fournisseurs[0], produits: { produit: typeof produits[0], info: NonNullable<ReturnType<typeof getBestSupplierInfo>> }[] }>();

  for (const p of produitsEnAlerte) {
    const info = getBestSupplierInfo(p);
    if (!info) continue;
    const fId = info.fourn.id;
    if (!reapproParFournisseur.has(fId)) {
      reapproParFournisseur.set(fId, { fourn: info.fourn, produits: [] });
    }
    reapproParFournisseur.get(fId)!.produits.push({ produit: p, info });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end mb-2">
        <Button variant="outline" onClick={() => exportToExcel(sorted.map(p => {
          const info = getBestSupplierInfo(p);
          return {
            Référence: p.reference, Description: p.description, Stock: p.stock, 'Stock Min': p.stockMin,
            Alerte: p.stock < p.stockMin ? 'Oui' : 'Non', 'Prix HT': p.prixHT, 'Valeur Stock': p.stock * p.prixHT,
            Catégorie: p.categorie || '', 'Fournisseur optimal': info?.fourn.societe || '',
            'Prix achat fourn.': info?.prixAchat || '',
          };
        }), 'stock', 'Stock')}><Download className="w-4 h-4 mr-2" /> Exporter</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card text-center">
          <Package className="w-5 h-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-heading font-bold">{totalStock}</p>
          <p className="text-xs text-muted-foreground">Unités totales</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-heading font-bold">{formatMontant(totalValeur)}</p>
          <p className="text-xs text-muted-foreground">Valeur stock HT</p>
        </div>
        <div className="stat-card text-center">
          <AlertTriangle className={`w-5 h-5 mx-auto mb-1 ${alertes > 0 ? 'text-warning' : 'text-success'}`} />
          <p className="text-2xl font-heading font-bold">{alertes}</p>
          <p className="text-xs text-muted-foreground">Alertes</p>
        </div>
      </div>

      {/* Résumé réappro par fournisseur optimal */}
      {reapproParFournisseur.size > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Truck className="w-4 h-4" /> Réappro optimale par fournisseur</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {[...reapproParFournisseur.entries()].map(([fId, group]) => {
              const totalReappro = group.produits.reduce((s, { info }) => s + info.totalAchat, 0);
              const francoAtteint = totalReappro >= group.fourn.francoPort;
              const manque = Math.max(0, group.fourn.francoPort - totalReappro);
              return (
                <div key={fId} className="bg-card rounded-xl border border-border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-primary" /> {group.fourn.societe}
                    </p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${francoAtteint ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                      {francoAtteint ? 'Franco atteint' : 'Franco non atteint'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <span className="text-muted-foreground">Franco de port :</span>
                    <span className="text-right font-medium">{formatMontant(group.fourn.francoPort)}</span>
                    <span className="text-muted-foreground">Total réappro :</span>
                    <span className="text-right font-medium">{formatMontant(totalReappro)}</span>
                    {!francoAtteint && (
                      <>
                        <span className="text-muted-foreground">Reste pour franco :</span>
                        <span className="text-right font-medium text-warning">{formatMontant(manque)}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">Coût transport :</span>
                    <span className="text-right font-medium">{francoAtteint ? <span className="text-success">Gratuit</span> : formatMontant(group.fourn.coutTransport)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {group.produits.length} produit{group.produits.length > 1 ? 's' : ''} :
                    <span className="ml-1">{group.produits.map(({ produit, info }) => `${produit.description} (${info.qte} ${produit.unite} à ${formatMontant(info.prixAchat)})`).join(', ')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Statut</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Produit</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Catégorie</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Stock</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Min.</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Qté réappro</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Fournisseur optimal</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Valeur</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => {
                const low = p.stock < p.stockMin;
                const info = getBestSupplierInfo(p);
                const qteReappro = low ? Math.max(0, p.stockMin - p.stock) : 0;
                return (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      {low
                        ? <AlertTriangle className="w-4 h-4 text-warning" />
                        : <CheckCircle className="w-4 h-4 text-success" />}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{p.description}</p>
                      <p className="text-xs text-muted-foreground font-mono">{p.reference}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{p.categorie || '—'}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${low ? 'text-warning' : ''}`}>{p.stock} {p.unite}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">{p.stockMin}</td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                      {low ? <span className="text-warning font-medium">{qteReappro} {p.unite} <span className="text-xs text-muted-foreground">({formatMontant(qteReappro * (info?.prixAchat || p.prixAchat))})</span></span> : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {info ? (
                        <div>
                          <span className="flex items-center gap-1">
                            {info.isMulti && <Star className="w-3 h-3 text-primary" />}
                            {info.fourn.societe}
                          </span>
                          <span className="block text-xs">
                            {formatMontant(info.prixAchat)}/{p.unite}
                            {info.fourn.francoPort > 0 && ` · Franco ${formatMontant(info.fourn.francoPort)}`}
                          </span>
                          {info.isMulti && <span className="text-xs text-primary">{info.nbFournisseurs} fournisseurs disponibles</span>}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">{formatMontant(p.stock * p.prixHT)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sorted.length === 0 && <p className="text-center py-8 text-muted-foreground">Aucun produit en stock</p>}
      </div>
    </div>
  );
}
