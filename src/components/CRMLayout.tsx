import { Outlet, useLocation, Link } from 'react-router-dom';
import { LayoutDashboard, Users, Package, Truck, FileText, Menu, X, BarChart3, Download, LogOut, ShoppingCart, Calculator, ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useCRM } from '@/lib/StoreContext';
import { calculerTotalDevis } from '@/lib/store';
import { exportMultiSheet } from '@/lib/exportExcel';
import { supabase } from '@/integrations/supabase/client';

const navItems = [
  { label: 'Tableau de bord', icon: LayoutDashboard, path: '/' },
  { label: 'Clients', icon: Users, path: '/clients' },
  { label: 'Produits', icon: Package, path: '/produits' },
  { label: 'Stock', icon: BarChart3, path: '/stock' },
  { label: 'Devis', icon: FileText, path: '/devis' },
  { label: 'Commandes Client', icon: ClipboardList, path: '/commandes-client' },
  { label: 'Fournisseurs', icon: Truck, path: '/fournisseurs' },
  { label: 'Cmd Fournisseur', icon: ShoppingCart, path: '/commandes' },
  { label: 'Calcul Transport', icon: Calculator, path: '/calculateur-ups' },
];

export default function CRMLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { clients, produits, fournisseurs, devis } = useCRM();

  function exportGlobal() {
    const sheets = [
      { name: 'Clients', data: clients.map(c => ({ Nom: c.nom, Société: c.societe || '', Email: c.email, Téléphone: c.telephone, Adresse: c.adresse, Ville: c.ville, 'Code Postal': c.codePostal, Revendeur: c.estRevendeur ? 'Oui' : 'Non', Notes: c.notes || '' })) },
      { name: 'Produits', data: produits.map(p => ({ Référence: p.reference, Description: p.description, 'Prix Achat': p.prixAchat, Coefficient: p.coefficient, 'Prix HT': p.prixHT, 'Remise Revendeur %': p.remiseRevendeur, 'Prix Revendeur': p.prixRevendeur, 'TVA %': p.tva, Unité: p.unite, Poids: p.poids || '', Stock: p.stock, 'Stock Min': p.stockMin, Catégorie: p.categorie || '', Fournisseur: fournisseurs.find(f => f.id === p.fournisseurId)?.societe || '' })) },
      { name: 'Fournisseurs', data: fournisseurs.map(f => ({ Nom: f.nom, Société: f.societe, Email: f.email, Téléphone: f.telephone, Adresse: f.adresse, Ville: f.ville, 'Code Postal': f.codePostal, 'Franco Port': f.francoPort, 'Coût Transport': f.coutTransport, Notes: f.notes || '' })) },
      { name: 'Devis', data: devis.map(d => { const client = clients.find(c => c.id === d.clientId); const t = calculerTotalDevis(d.lignes, d.fraisPortHT, d.fraisPortTVA); return { Numéro: d.numero, Client: client?.nom || '', Société: client?.societe || '', Date: d.dateCreation, Validité: d.dateValidite, Statut: d.statut, 'Réf. Affaire': d.referenceAffaire || '', 'Total HT': t.totalHT, 'Total TVA': t.totalTVA, 'Total TTC': t.totalTTC, Notes: d.notes || '' }; }) },
    ];
    exportMultiSheet(sheets, `MonCRM_Export_${new Date().toISOString().split('T')[0]}`);
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-sidebar text-sidebar-foreground z-30">
        <div className="flex items-center gap-3 px-6 h-16 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <FileText className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-heading font-bold text-lg tracking-tight">MonCRM</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 pb-4 space-y-1">
          <button
            onClick={exportGlobal}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <Download className="w-5 h-5 shrink-0" />
            Export global
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Mobile Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 w-64 bg-sidebar text-sidebar-foreground z-50 transform transition-transform duration-200 md:hidden',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex items-center justify-between px-6 h-16 border-b border-sidebar-border">
          <span className="font-heading font-bold text-lg">MonCRM</span>
          <button onClick={() => setSidebarOpen(false)} className="text-sidebar-foreground/70">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="px-3 py-4 space-y-1">
          {navItems.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent'
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-20 h-16 flex items-center px-4 md:px-6 bg-card/80 backdrop-blur-md border-b border-border">
          <button className="md:hidden mr-3 p-2 rounded-lg hover:bg-muted" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-heading font-semibold text-lg truncate">
            {navItems.find(i => i.path === location.pathname)?.label || 'MonCRM'}
          </h1>
        </header>

        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border z-30 flex justify-around py-2">
        {navItems.slice(0, 6).map(item => {
          const active = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center gap-0.5 px-2 py-1 text-xs transition-colors',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="truncate max-w-[60px]">{item.label.split(' ').pop()}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
