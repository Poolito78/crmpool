import { Outlet, useLocation, Link } from 'react-router-dom';
import { LayoutDashboard, Users, Package, Truck, FileText, Menu, X, BarChart3, LogOut, ShoppingCart, Calculator, ClipboardList, ScanText, History, Receipt, Target, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Settings, PanelLeftClose, PanelLeftOpen, Eye, Warehouse, ShieldCheck, FileSearch } from 'lucide-react';
import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useAuth';
import { useCommercials } from '@/hooks/useCommercials';
/* Chargé à la demande.
 *
 * Cet écran vivait ici, monté en permanence : présent sur CHAQUE page de
 * l'application, ses quelque soixante hooks se rejouaient à chaque rendu de
 * la coquille, et ses 188 ko — plus les alphabets de signalisation et le
 * barème plastique qu'il entraîne — partaient dans le paquet principal,
 * téléchargés par tout le monde à la première visite. */
const AnalyseDocumentDialog = lazy(() => import('@/components/AnalyseDocumentDialog'));
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
      { type: 'link', label: 'Devis Fournisseurs', icon: FileSearch,  path: '/devis-fournisseurs' },
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
      { type: 'link', label: 'Clients',            icon: Users,           path: '/parametres?tab=clients' },
      { type: 'link', label: 'Veille Concurrence', icon: Eye,             path: '/parametres?tab=veille' },
      { type: 'link', label: 'Admin App invité', icon: ShieldCheck,   path: '/parametres?tab=administration' },
      { type: 'link', label: 'Historique GED',     icon: History,         path: '/ged' },
    ],
  },
];

export default function CRMLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [analyseOpen, setAnalyseOpen] = useState(false);
  const analyseDejaOuvert = useRef(false);
  if (analyseOpen) analyseDejaOuvert.current = true;

  /* ── Glisser-déposer d'un document, sur TOUTE l'application ─────────────
   *
   * Le tableau de bord savait le faire, et lui seul. Or on ne se trouve
   * presque jamais sur le tableau de bord quand un fournisseur envoie son
   * tarif : on est dans les produits, dans les devis, dans la page qui a
   * motivé la question. Poser le déposé ICI, dans la coquille, le rend
   * disponible partout — et il n'y a qu'une fenêtre d'analyse, celle que
   * cette coquille montait déjà.
   *
   * UN GLISSER INTERNE N'EST PAS UN DOCUMENT. Réordonner les colonnes d'un
   * tableau ou déplacer une ligne de devis déclenche les mêmes événements ;
   * les intercepter ouvrirait la fenêtre d'analyse au milieu d'un tri. On
   * repère donc les glissers nés dans la page — eux seuls émettent
   * `dragstart` — et on les laisse tranquilles. */
  const [fichiersDeposes, setFichiersDeposes] = useState<File[]>([]);
  const [texteDepose, setTexteDepose] = useState('');
  const [survolDepot, setSurvolDepot] = useState(false);
  /** Compteur : les enfants émettent leurs propres dragenter/dragleave. */
  const compteurDepot = useRef(0);
  const glisserInterne = useRef(false);

  useEffect(() => {
    const debut = () => { glisserInterne.current = true; };
    const fin = () => { glisserInterne.current = false; };
    document.addEventListener('dragstart', debut, true);
    document.addEventListener('dragend', fin, true);
    document.addEventListener('drop', fin, true);
    return () => {
      document.removeEventListener('dragstart', debut, true);
      document.removeEventListener('dragend', fin, true);
      document.removeEventListener('drop', fin, true);
    };
  }, []);

  const depotDragEnter = (e: React.DragEvent) => {
    if (glisserInterne.current) return;
    compteurDepot.current++;
    if (e.dataTransfer.types.some(t => t === 'Files' || t === 'text/plain')) {
      e.preventDefault();
      setSurvolDepot(true);
    }
  };

  const depotDragOver = (e: React.DragEvent) => {
    if (glisserInterne.current || !survolDepot) return;
    e.preventDefault();
  };

  const depotDragLeave = () => {
    if (glisserInterne.current) return;
    compteurDepot.current--;
    if (compteurDepot.current <= 0) { compteurDepot.current = 0; setSurvolDepot(false); }
  };

  const depotDrop = (e: React.DragEvent) => {
    compteurDepot.current = 0;
    setSurvolDepot(false);
    if (glisserInterne.current) return;

    const fichiers = Array.from(e.dataTransfer.files);
    if (fichiers.length) {
      e.preventDefault();
      setTexteDepose('');
      setFichiersDeposes(fichiers);
      setAnalyseOpen(true);
      return;
    }
    const texte = e.dataTransfer.getData('text/plain');
    if (texte?.trim()) {
      e.preventDefault();
      setFichiersDeposes([]);
      setTexteDepose(texte.trim());
      setAnalyseOpen(true);
    }
  };
  // Sidebar desktop repliée (icônes seules) — persistée
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('crm_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed(c => { const n = !c; try { localStorage.setItem('crm_sidebar_collapsed', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  const location = useLocation();
  const { canAchat, canCrm, isAdmin, userId, session } = useCurrentUser();
  const { nameOf } = useCommercials();
  const currentName = nameOf(userId);
  const currentLabel2 = currentName !== '—' ? currentName : (session?.user?.email ?? 'Utilisateur');
  const roleLabel = isAdmin ? 'Administrateur' : 'Invité';

  // Nav filtrée selon les droits : groupe « Achat » masqué sans droit Achat,
  // lien « CRM » masqué sans droit CRM, onglet « Admin » masqué aux non-admins.
  const nav = useMemo<NavEntry[]>(() => NAV
    .filter(e => canAchat || !(e.type === 'group' && e.label === 'Achat'))
    .filter(e => canCrm || !(e.type === 'link' && e.path === '/crm'))
    .map(e => e.type === 'group'
      ? { ...e, items: e.items.filter(i => isAdmin || !['/parametres?tab=administration', '/parametres?tab=entrepots', '/parametres?tab=general', '/parametres?tab=clients', '/parametres?tab=veille'].includes(i.path)) }
      : e),
  [canAchat, canCrm, isAdmin]);
  const navFlat = useMemo<NavLink[]>(() => nav.flatMap(e => e.type === 'group' ? e.items : [e]), [nav]);

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
  const initialOpen = nav
    .filter((e): e is NavGroup => e.type === 'group' && e.items.some(i => isSectionActive(i.path)))
    .map(e => e.label);
  const [openGroups, setOpenGroups] = useState<string[]>(initialOpen);

  // Keep groups open when navigating into them
  useEffect(() => {
    const active = nav
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

  const currentNav = navFlat.find(i => isLinkActive(i.path))
    ?? navFlat.find(i => i.path.split('?')[0] === location.pathname);
  const currentLabel = currentNav?.label ?? (location.pathname === '/crm' ? 'CRM' : 'MonCRM');
  const currentShort = currentNav?.shortLabel ?? currentLabel;

  return (
    <div
      className="h-screen overflow-hidden flex bg-background"
      onDragEnter={depotDragEnter}
      onDragOver={depotDragOver}
      onDragLeave={depotDragLeave}
      onDrop={depotDrop}
    >
      {/* Voile de dépôt, au-dessus de tout et transparent au pointeur : c'est
          le conteneur en dessous qui reçoit le drop. */}
      {survolDepot && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none bg-primary/10"
          style={{ backdropFilter: 'blur(2px)' }}
        >
          <div className="rounded-3xl border-4 border-dashed border-primary bg-background/85 px-10 py-8 sm:px-16 sm:py-12 flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-primary/15 flex items-center justify-center">
              <ScanText className="w-8 h-8 sm:w-10 sm:h-10 text-primary animate-bounce" />
            </div>
            <p className="text-lg sm:text-xl font-heading font-bold">Déposez pour analyser</p>
            <p className="text-xs sm:text-sm text-muted-foreground text-center max-w-xs">
              PDF, e-mail, Excel ou simple texte — devis, commande, bon de livraison
              ou tarif fournisseur.
            </p>
          </div>
        </div>
      )}
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
          {renderNavEntries(nav, undefined, collapsed)}
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
          {/* Utilisateur connecté */}
          {collapsed ? (
            <div title={`${currentLabel2} · ${roleLabel}`} className="flex items-center justify-center w-9 h-9 mx-auto mb-1 rounded-full bg-sidebar-accent/40 text-sidebar-foreground text-xs font-semibold uppercase">
              {currentLabel2.charAt(0)}
            </div>
          ) : (
            <div className="px-3 py-2 mb-1 border-t border-sidebar-border/50">
              <p className="text-sm font-medium text-sidebar-foreground truncate" title={currentLabel2}>{currentLabel2}</p>
              <p className="text-[11px] text-sidebar-foreground/60">{roleLabel}</p>
            </div>
          )}
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
          {renderNavEntries(nav, () => setSidebarOpen(false))}
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
            <span className="lg:hidden">{currentShort}</span>
            <span className="hidden lg:inline">{currentLabel}</span>
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

      {/* Monté à la première ouverture, et plus jamais démonté : refermer la
          fenêtre ne doit pas jeter l'analyse en cours. */}
      {(analyseOpen || analyseDejaOuvert.current) && (
        <Suspense fallback={null}>
          <AnalyseDocumentDialog
            open={analyseOpen}
            onOpenChange={(v) => {
              setAnalyseOpen(v);
              /* Ce qui a été déposé n'a de sens que pour l'analyse en cours :
                 le garder rouvrirait la fenêtre sur le document précédent. */
              if (!v) { setFichiersDeposes([]); setTexteDepose(''); }
            }}
            initialFiles={fichiersDeposes.length ? fichiersDeposes : undefined}
            initialText={texteDepose || undefined}
          />
        </Suspense>
      )}

      {/* Mobile bottom nav — show first 5 flat items */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border z-30 flex justify-around py-2">
        {navFlat.slice(0, 5).map(item => {
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
