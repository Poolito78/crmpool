import { useCRM } from '@/lib/StoreContext';
import { calculerTotalDevis, formatMontant } from '@/lib/store';
import { Users, Package, FileText, AlertTriangle, TrendingUp, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { clients, produits, fournisseurs, devis } = useCRM();

  const produitsStockBas = produits.filter(p => p.stock < p.stockMin);
  const devisAcceptes = devis.filter(d => d.statut === 'accepté');
  const caTotal = devisAcceptes.reduce((sum, d) => sum + calculerTotalDevis(d.lignes).totalTTC, 0);
  const devisEnCours = devis.filter(d => d.statut === 'envoyé');

  // Calcul marge : totalHT lignes - coût d'achat
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const calcMarge = (filteredDevis: typeof devis) =>
    filteredDevis.reduce((sum, d) => {
      const margeDevis = d.lignes.reduce((acc, l) => {
        const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
        const coutAchat = prod ? prod.prixAchat * l.quantite : 0;
        const montantBrut = l.quantite * l.prixUnitaireHT;
        const remise = montantBrut * (l.remise / 100);
        return acc + (montantBrut - remise - coutAchat);
      }, 0);
      return sum + margeDevis;
    }, 0);

  const devisAnnuels = devisAcceptes.filter(d => new Date(d.dateCreation).getFullYear() === currentYear);
  const devisMensuels = devisAnnuels.filter(d => new Date(d.dateCreation).getMonth() === currentMonth);
  const margeAnnuelle = calcMarge(devisAnnuels);
  const margeMensuelle = calcMarge(devisMensuels);

  const stats = [
    { label: 'Clients', value: clients.length, icon: Users, color: 'text-primary', bg: 'bg-primary/10', link: '/clients' },
    { label: 'Produits', value: produits.length, icon: Package, color: 'text-accent', bg: 'bg-accent/10', link: '/produits' },
    { label: 'Fournisseurs', value: fournisseurs.length, icon: Truck, color: 'text-info', bg: 'bg-info/10', link: '/fournisseurs' },
    { label: 'Devis', value: devis.length, icon: FileText, color: 'text-success', bg: 'bg-success/10', link: '/devis' },
    { label: 'CA Accepté', value: formatMontant(caTotal), icon: TrendingUp, color: 'text-success', bg: 'bg-success/10', link: '/devis' },
    { label: 'Marge annuelle', value: formatMontant(margeAnnuelle), icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10', link: '/devis' },
    { label: 'Marge mensuelle', value: formatMontant(margeMensuelle), icon: TrendingUp, color: 'text-accent', bg: 'bg-accent/10', link: '/devis' },
    { label: 'Stock bas', value: produitsStockBas.length, icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10', link: '/stock' },
  ];

  const statutColors: Record<string, string> = {
    brouillon: 'bg-muted text-muted-foreground',
    envoyé: 'bg-info/10 text-info',
    accepté: 'bg-success/10 text-success',
    refusé: 'bg-destructive/10 text-destructive',
    expiré: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map(stat => (
          <Link key={stat.label} to={stat.link} className="stat-card flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl ${stat.bg} flex items-center justify-center shrink-0`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground truncate">{stat.label}</p>
              <p className="text-xl font-heading font-bold truncate">{stat.value}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent Quotes */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-lg">Derniers devis</h2>
            <Link to="/devis" className="text-sm text-primary hover:underline">Voir tout</Link>
          </div>
          <div className="space-y-3">
            {devis.slice(0, 5).map(d => {
              const client = clients.find(c => c.id === d.clientId);
              const total = calculerTotalDevis(d.lignes);
              return (
                <div key={d.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{d.numero}</p>
                    <p className="text-xs text-muted-foreground truncate">{client?.nom || 'Client inconnu'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statutColors[d.statut]}`}>
                      {d.statut}
                    </span>
                    <span className="text-sm font-semibold whitespace-nowrap">{formatMontant(total.totalTTC)}</span>
                  </div>
                </div>
              );
            })}
            {devis.length === 0 && <p className="text-sm text-muted-foreground">Aucun devis</p>}
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-lg">Alertes stock</h2>
            <Link to="/stock" className="text-sm text-primary hover:underline">Voir tout</Link>
          </div>
          <div className="space-y-3">
            {produitsStockBas.slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{p.description}</p>
                  <p className="text-xs text-muted-foreground">{p.reference}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-warning">{p.stock}</span>
                  <span className="text-xs text-muted-foreground">/ {p.stockMin} min</span>
                </div>
              </div>
            ))}
            {produitsStockBas.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">✅ Stock OK</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
