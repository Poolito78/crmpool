import { useCRM } from '@/lib/StoreContext';
import { formatMontant } from '@/lib/store';
import { AlertTriangle, CheckCircle, Package, Truck, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportToExcel } from '@/lib/exportExcel';

export default function Stock() {
  const { produits, fournisseurs } = useCRM();

  const sorted = [...produits].sort((a, b) => {
    const aLow = a.stock < a.stockMin ? 0 : 1;
    const bLow = b.stock < b.stockMin ? 0 : 1;
    return aLow - bLow || a.description.localeCompare(b.description);
  });

  const totalStock = produits.reduce((s, p) => s + p.stock, 0);
  const totalValeur = produits.reduce((s, p) => s + p.stock * p.prixHT, 0);
  const alertes = produits.filter(p => p.stock < p.stockMin).length;

  // Calcul du minimum de réappro par fournisseur pour atteindre le franco
  function calcReapproFranco(fournisseurId: string) {
    const fourn = fournisseurs.find(f => f.id === fournisseurId);
    if (!fourn || !fourn.francoPort) return null;
    // Produits en alerte pour ce fournisseur
    const produitsAlerte = produits.filter(p => p.fournisseurId === fournisseurId && p.stock < p.stockMin);
    const totalReappro = produitsAlerte.reduce((s, p) => {
      const qte = Math.max(0, p.stockMin - p.stock);
      return s + qte * p.prixAchat;
    }, 0);
    return { fourn, totalReappro, manque: Math.max(0, fourn.francoPort - totalReappro), atteint: totalReappro >= fourn.francoPort };
  }

  // Grouper les alertes par fournisseur
  const fournisseursAvecAlertes = [...new Set(produits.filter(p => p.stock <= p.stockMin && p.fournisseurId).map(p => p.fournisseurId!))];

  return (
    <div className="space-y-6">
      <div className="flex justify-end mb-2">
        <Button variant="outline" onClick={() => exportToExcel(sorted.map(p => ({ Référence: p.reference, Description: p.description, Stock: p.stock, 'Stock Min': p.stockMin, Alerte: p.stock <= p.stockMin ? 'Oui' : 'Non', 'Prix HT': p.prixHT, 'Valeur Stock': p.stock * p.prixHT, Catégorie: p.categorie || '', Fournisseur: fournisseurs.find(f => f.id === p.fournisseurId)?.societe || '' })), 'stock', 'Stock')}><Download className="w-4 h-4 mr-2" /> Exporter</Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
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

      {/* Résumé franco fournisseur */}
      {fournisseursAvecAlertes.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Truck className="w-4 h-4" /> Réappro & Franco fournisseur</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {fournisseursAvecAlertes.map(fId => {
              const info = calcReapproFranco(fId);
              if (!info) return null;
              const produitsAlerte = produits.filter(p => p.fournisseurId === fId && p.stock <= p.stockMin);
              return (
                <div key={fId} className="bg-card rounded-xl border border-border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{info.fourn.societe}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${info.atteint ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                      {info.atteint ? 'Franco atteint' : 'Franco non atteint'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <span className="text-muted-foreground">Franco de port :</span>
                    <span className="text-right font-medium">{formatMontant(info.fourn.francoPort)}</span>
                    <span className="text-muted-foreground">Total réappro min. :</span>
                    <span className="text-right font-medium">{formatMontant(info.totalReappro)}</span>
                    {!info.atteint && (
                      <>
                        <span className="text-muted-foreground">Reste pour franco :</span>
                        <span className="text-right font-medium text-warning">{formatMontant(info.manque)}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">Coût transport :</span>
                    <span className="text-right font-medium">{info.atteint ? <span className="text-success">Gratuit</span> : formatMontant(info.fourn.coutTransport)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {produitsAlerte.length} produit{produitsAlerte.length > 1 ? 's' : ''} en alerte :
                    <span className="ml-1">{produitsAlerte.map(p => `${p.description} (${Math.max(0, p.stockMin - p.stock + 1)} ${p.unite})`).join(', ')}</span>
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
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Fournisseur</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Valeur</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => {
                const low = p.stock <= p.stockMin;
                const fourn = fournisseurs.find(f => f.id === p.fournisseurId);
                const qteReappro = low ? Math.max(0, p.stockMin - p.stock + 1) : 0;
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
                      {low ? <span className="text-warning font-medium">{qteReappro} {p.unite} <span className="text-xs text-muted-foreground">({formatMontant(qteReappro * p.prixAchat)})</span></span> : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {fourn ? (
                        <div>
                          <span>{fourn.societe}</span>
                          {fourn.francoPort > 0 && (
                            <span className="block text-xs">Franco {formatMontant(fourn.francoPort)} · Transport {formatMontant(fourn.coutTransport)}</span>
                          )}
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
