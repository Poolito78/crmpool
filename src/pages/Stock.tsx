import { useCRM } from '@/lib/StoreContext';
import { formatMontant } from '@/lib/store';
import { AlertTriangle, CheckCircle, Package } from 'lucide-react';

export default function Stock() {
  const { produits, fournisseurs } = useCRM();

  const sorted = [...produits].sort((a, b) => {
    const aLow = a.stock <= a.stockMin ? 0 : 1;
    const bLow = b.stock <= b.stockMin ? 0 : 1;
    return aLow - bLow || a.nom.localeCompare(b.nom);
  });

  const totalStock = produits.reduce((s, p) => s + p.stock, 0);
  const totalValeur = produits.reduce((s, p) => s + p.stock * p.prixHT, 0);
  const alertes = produits.filter(p => p.stock <= p.stockMin).length;

  return (
    <div className="space-y-6">
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
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Fournisseur</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Valeur</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => {
                const low = p.stock <= p.stockMin;
                const fourn = fournisseurs.find(f => f.id === p.fournisseurId);
                return (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      {low
                        ? <AlertTriangle className="w-4 h-4 text-warning" />
                        : <CheckCircle className="w-4 h-4 text-success" />}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{p.nom}</p>
                      <p className="text-xs text-muted-foreground font-mono">{p.reference}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{p.categorie || '—'}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${low ? 'text-warning' : ''}`}>{p.stock} {p.unite}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">{p.stockMin}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{fourn?.societe || '—'}</td>
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
