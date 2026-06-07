import { Outlet, useLocation, Link } from 'react-router-dom';
import { LayoutDashboard, Users, Package, Truck, FileText, Menu, X, BarChart3, LogOut, ShoppingCart, Calculator, ClipboardList, ScanText, History, Receipt, Target, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Settings, PanelLeftClose, PanelLeftOpen, Eye, Warehouse, ShieldCheck } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import AnalyseDocumentDialog from '@/components/AnalyseDocumentDialog';
import { PageHeaderSlotTarget } from '@/components/PageHeaderSlot';

type NavLink = { type: 'link'; label: string; icon: any; path: string; shortLabel?: string };
type NavGroup = { type: 'group'; label: string; icon: any; items: NavLink[] };
type NavEntry = NavLink | NavGroup;

const NAV: NavEntry[] = [
  { type: 'link',  label: 'Tableau de bord', icon: LayoutDashboard, path: '/' },
  { type: 'link',  label: 'Veille Concurrence', icon: Eye,          path: '/veille-concurrence', shortLabel: 'Veille' },
  { type: 'link',  label: 'CRM',              icon: Target,          path: '/crm' },
  {
    type: 'group', label: 'Vente', icon: TrendingUp,
    items: [
      { type: 'link', label: 'Clients',           icon: Users,       path: '/clients' },
      { type: 'link', label: 'Produits',           icon: Package,     path: '/produits' },
      { type: 'link', label: 'Devis',              icon: FileText,    path: '/devis' },
      { type: 'link', label: 'Commandes Client',   icon: ClipboardList, path: '/commandes-client' },
      { type: 'link', label: 'Factures Client',    icon: Receipt,     path: '/factures-client' },
    ],
  },
  {
    type: 'group', label: 'Achat', icon: TrendingDown,
    items: [
      { type: 'link', label: 'Fournisseurs',       icon: Truck,       path: '/fournisseurs' },
      { type: 'link', label: 'Cmd Fournisseur',    icon: ShoppingCart, path: '/commandes' },
      { type: 'link', label: 'Factures Fourn.',    icon: Receipt,     path: '/factures-fournisseur' },
    ],
  },
  { type: 'link',  label: 'Stock',            icon: BarChart3,       path: '/stock' },
  { type: 'link',  label: 'Calcul Transport', icon: Calculator,      path: '/calculateur-ups' },
  {
    type: 'group', label: 'Paramètres', icon: Settings,
    items: [
      { type: 'link', label: 'Général',             icon: Settings,        path: '/parametres?tab=general' },
      { type: 'link', label: 'Tableau de bord',    icon: LayoutDashboard, path: '/parametres?tab=dashboard' },
      { type: 'link', label: 'Entrepôts',          icon: Warehouse,       path: '/parametres?tab=entrepots' },
      { type: 'link', label: 'Devis',              icon: FileText,        path: '/parametres?tab=devis' },
      { type: 'link', label: 'Veille Concurrence', icon: Eye,             path: '/parametres?tab=veille' },
      { type: 'link', label: 'Admin App Veille ext', icon: ShieldCheck,   path: '/parametres?tab=administration' },
      { type: 'link', label: 'Historique GED',     icon: History,         path: '/ged' },
    ],
  },
];

// Flat list for mobile bottom nav and top-bar title
const NAV_FLAT: NavLink[] = NAV.flatMap(e => e.type === 'group' ? e.items : [e]);

export default function CRMLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [analyseOpen, setAnalyseOpen] = useState(false);
  // Sidebar desktop repliée (icônes seules) — persistée
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('crm_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed(c => { const n = !c; try { localStorage.setItem('crm_sidebar_collapsed', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  const location = useLocation();

  // Lien actif : compare le pathname et, pour les liens avec ?tab=, l'onglet courant.
  const isLinkActive = (path: string) => {
    const [base, query] = path.split('?');
    if (location.pathname !== base) return false;
    if (!query) return true;
    const want = new URLSearchParams(query).get('tab');
    const cur = new URLSearchParams(location.search).get('tab') || 'dashboard';
    return want === cur;
  };
  // Section active (pour ouvrir le groupe) : par pathname seul (ignore ?tab=).
  const isSectionActive = (path: string) => location.pathname === path.split('?')[0];

  // Auto-open groups containing the active route
  const initialOpen = NAV
    .filter((e): e is NavGroup => e.type === 'group' && e.items.some(i => isSectionActive(i.path)))
    .map(e => e.label);
  const [openGroups, setOpenGroups] = useState<string[]>(initialOpen);

  // Keep groups open when navigating into them
  useEffect(() => {
    const active = NAV
      .filter((e): e is NavGroup => e.type === 'group' && e.items.some(i => isSectionActive(i.path)))
      .map(e => e.label);
    setOpenGroups(prev => Array.from(new Set([...prev, ...active])));
  }, [location.pathname]);

  function toggleGroup(label: string) {
    setOpenGroups(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]);
  }

  function renderNavEntries(entries: NavEntry[], onLinkClick?: () => void, iconsOnly = false) {
    // Mode replié : liste à plat d'icônes (liens + items de groupes), avec tooltip title
    if (iconsOnly) {
      const flat: NavLink[] = entries.flatMap(e => e.type === 'group' ? e.items : [e]);
      return flat.map(item => {
        const active = isLinkActive(item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onLinkClick}
            title={item.label}
            className={cn(
              'flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-all duration-150',
              active
                ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
          >
            <item.icon className="w-5 h-5 shrink-0" />
          </Link>
        );
      });
    }
    return entries.map(entry => {
      if (entry.type === 'link') {
        const active = isLinkActive(entry.path);
        return (
          <Link
            key={entry.path}
            to={entry.path}
            onClick={onLinkClick}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              active
                ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
          >
            <entry.icon className="w-5 h-5 shrink-0" />
            {entry.label}
          </Link>
        );
      }

      // NavGroup
      const isOpen = openGroups.includes(entry.label);
      const hasActive = entry.items.some(i => isSectionActive(i.path));
      return (
        <div key={entry.label}>
          <button
            onClick={() => toggleGroup(entry.label)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              hasActive
                ? 'text-sidebar-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
          >
            <entry.icon className="w-5 h-5 shrink-0" />
            <span className="flex-1 text-left">{entry.label}</span>
            {isOpen
              ? <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
              : <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />}
          </button>
          {isOpen && (
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border/50 pl-3">
              {entry.items.map(item => {
                const active = isLinkActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={onLinkClick}
                    className={cn(
                      'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                      active
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                        : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    )}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span className={cn('min-w-0 truncate', item.label.length > 16 && 'text-[13px]')}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    });
  }

  const currentNav = NAV_FLAT.find(i => isLinkActive(i.path))
    ?? NAV_FLAT.find(i => i.path.split('?')[0] === location.pathname);
  const currentLabel = currentNav?.label ?? (location.pathname === '/crm' ? 'CRM' : 'MonCRM');
  const currentShort = currentNav?.shortLabel ?? currentLabel;

  return (
    <div className="h-screen overflow-hidden flex bg-background">
      {/* Desktop Sidebar */}
      <aside className={cn(
        'hidden md:flex md:flex-col md:fixed md:inset-y-0 bg-sidebar text-sidebar-foreground z-30 transition-[width] duration-200',
        collapsed ? 'md:w-16' : 'md:w-64'
      )}>
        <div className={cn('flex items-center h-16 border-b border-sidebar-border', collapsed ? 'justify-center px-2' : 'gap-3 px-6')}>
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-primary-foreground" />
          </div>
          {!collapsed && <span className="font-heading font-bold text-lg tracking-tight flex-1">MonCRM</span>}
          <button
            onClick={toggleCollapsed}
            title={collapsed ? 'Déplier le menu' : 'Replier le menu'}
            className={cn('rounded-lg p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors', collapsed && 'absolute top-3 right-2')}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>
        <nav className={cn('flex-1 py-4 space-y-1 overflow-y-auto overflow-x-hidden', collapsed ? 'px-2' : 'px-3')}>
          {renderNavEntries(NAV, undefined, collapsed)}
          <button
            onClick={() => setAnalyseOpen(true)}
            title="Analyse de document"
            className={cn(
              'rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-150',
              collapsed ? 'flex items-center justify-center w-10 h-10 mx-auto' : 'flex items-center gap-3 px-3 py-2.5 w-full'
            )}
          >
            <ScanText className="w-5 h-5 shrink-0" />
            {!collapsed && 'Analyse de document'}
          </button>
        </nav>
        <div className={cn('pb-4 space-y-1', collapsed ? 'px-2' : 'px-3')}>
          <button
            onClick={() => supabase.auth.signOut()}
            title="Déconnexion"
            className={cn(
              'rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive transition-colors',
              collapsed ? 'flex items-center justify-center w-10 h-10 mx-auto' : 'flex items-center gap-3 px-3 py-2.5 w-full'
            )}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && 'Déconnexion'}
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
        <nav className="px-3 py-4 space-y-1 overflow-y-auto max-h-[calc(100vh-4rem)]">
          {renderNavEntries(NAV, () => setSidebarOpen(false))}
          <button
            onClick={() => { setAnalyseOpen(true); setSidebarOpen(false); }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full text-sidebar-foreground/70 hover:bg-sidebar-accent transition-colors"
          >
            <ScanText className="w-5 h-5 shrink-0" />
            Analyse de document
          </button>
        </nav>
      </aside>

      {/* Main content */}
      <div className={cn('flex-1 flex flex-col min-h-0 min-w-0 transition-[margin] duration-200', collapsed ? 'md:ml-16' : 'md:ml-64')}>
        {/* Top bar */}
        <header className="shrink-0 z-20 h-16 flex items-center px-4 md:px-6 bg-card/80 backdrop-blur-md border-b border-border gap-3">
          <button className="md:hidden mr-3 p-2 rounded-lg hover:bg-muted" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-heading font-semibold text-lg truncate shrink-0">
            <span className="sm:hidden">{currentShort}</span>
            <span className="hidden sm:inline">{currentLabel}</span>
          </h1>
          <PageHeaderSlotTarget />
          {location.pathname === '/' && (
            <button
              onClick={() => setAnalyseOpen(true)}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <ScanText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Analyser document</span>
              <span className="sm:hidden">Analyser</span>
            </button>
          )}
        </header>

        <main className="relative flex-1 flex flex-col min-h-0 px-4 md:px-6 pt-2 md:pt-2 pb-20 md:pb-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>

      <AnalyseDocumentDialog open={analyseOpen} onOpenChange={setAnalyseOpen} />

      {/* Mobile bottom nav — show first 5 flat items */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border z-30 flex justify-around py-2">
        {NAV_FLAT.slice(0, 5).map(item => {
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
