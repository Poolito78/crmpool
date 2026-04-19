import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchHistorique, type HistoriqueEntry, type EntiteType, type ActionType } from '@/lib/historique';
import { formatDate } from '@/lib/store';
import {
  FileText, ShoppingCart, Users, Package, ClipboardList, Truck,
  Plus, Pencil, Trash2, Mail, ArrowRightLeft, PackageCheck, Warehouse,
  RefreshCw, Search, Filter, ChevronDown, ChevronRight, ExternalLink
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// ── Config visuelle par type d'entité ──────────────────────────
const entiteConfig: Record<EntiteType, { label: string; icon: typeof FileText; color: string; route: string }> = {
  devis:                { label: 'Devis',              icon: FileText,      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',       route: '/devis' },
  commande_fournisseur: { label: 'Cmd Fournisseur',    icon: ShoppingCart,  color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',    route: '/commandes' },
  commande_client:      { label: 'Cmd Client',         icon: ClipboardList, color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', route: '/commandes-client' },
  client:               { label: 'Client',             icon: Users,         color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', route: '/clients' },
  produit:              { label: 'Produit',             icon: Package,       color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',       route: '/produits' },
  fournisseur:          { label: 'Fournisseur',         icon: Truck,         color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', route: '/fournisseurs' },
};

// ── Config visuelle par action ──────────────────────────────────
const actionConfig: Record<ActionType, { label: string; icon: typeof Plus; color: string }> = {
  creation:     { label: 'Création',           icon: Plus,           color: 'text-emerald-600 dark:text-emerald-400' },
  modification: { label: 'Modification',        icon: Pencil,         color: 'text-blue-600 dark:text-blue-400' },
  suppression:  { label: 'Suppression',         icon: Trash2,         color: 'text-destructive' },
  envoi_email:  { label: 'Envoi email',         icon: Mail,           color: 'text-violet-600 dark:text-violet-400' },
  statut:       { label: 'Changement de statut',icon: ArrowRightLeft, color: 'text-amber-600 dark:text-amber-400' },
  reception:    { label: 'Réception',           icon: PackageCheck,   color: 'text-emerald-600 dark:text-emerald-400' },
  prise_stock:  { label: 'Prise sur stock',     icon: Warehouse,      color: 'text-teal-600 dark:text-teal-400' },
};

function formatDatetime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'à l\'instant';
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days}j`;
  return formatDate(iso.split('T')[0]);
}

function DetailsPanel({ details }: { details?: Record<string, unknown> }) {
  if (!details || Object.keys(details).length === 0) return null;
  return (
    <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
      {Object.entries(details).map(([k, v]) => {
        if (v === undefined || v === null || v === '') return null;
        const label: Record<string, string> = {
          ancienStatut: 'Ancien statut', nouveauStatut: 'Nouveau statut',
          dateEnvoi: 'Date d\'envoi', destinataire: 'Destinataire',
          montant: 'Montant TTC', client: 'Client', fournisseur: 'Fournisseur',
          dateReception: 'Date réception', lignes: 'Lignes', nbProduits: 'Produits',
        };
        return (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{label[k] ?? k}</dt>
            <dd className="font-medium text-foreground">{String(v)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function EntryRow({ entry }: { entry: HistoriqueEntry }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const ec = entiteConfig[entry.entiteType];
  const ac = actionConfig[entry.action];
  const ActionIcon = ac.icon;
  const EntiteIcon = ec.icon;
  const hasDetails = entry.details && Object.keys(entry.details).length > 0;

  return (
    <div className="flex gap-3 group">
      {/* Timeline dot */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${ec.color} ring-2 ring-background`}>
          <EntiteIcon className="w-4 h-4" />
        </div>
        <div className="w-px flex-1 bg-border mt-1 group-last:hidden" />
      </div>

      {/* Contenu */}
      <div className="flex-1 pb-5 min-w-0">
        <div className="bg-card border border-border rounded-xl px-4 py-3 hover:border-primary/30 transition-colors">
          {/* En-tête */}
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <ActionIcon className={`w-3.5 h-3.5 shrink-0 ${ac.color}`} />
              <span className={`font-semibold text-sm ${ac.color}`}>{ac.label}</span>
              <span className="text-muted-foreground text-sm">·</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ec.color}`}>{ec.label}</span>
              <button
                onClick={() => navigate(`${ec.route}?search=${encodeURIComponent(entry.entiteNumero)}`)}
                className="font-mono text-sm font-semibold text-primary hover:underline flex items-center gap-1"
              >
                {entry.entiteNumero}
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground" title={formatDatetime(entry.date)}>
                {formatRelative(entry.date)}
              </span>
              {hasDetails && (
                <button onClick={() => setExpanded(p => !p)} className="text-muted-foreground hover:text-foreground">
                  {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>

          {/* Date complète */}
          <p className="text-xs text-muted-foreground mt-0.5">{formatDatetime(entry.date)}</p>

          {/* Détails dépliables */}
          {expanded && hasDetails && (
            <div className="mt-2 pt-2 border-t border-border">
              <DetailsPanel details={entry.details} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Groupement par jour
function groupByDay(entries: HistoriqueEntry[]): [string, HistoriqueEntry[]][] {
  const map = new Map<string, HistoriqueEntry[]>();
  for (const e of entries) {
    const day = e.date.split('T')[0];
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(e);
  }
  return Array.from(map.entries());
}

const ALL_TYPES: EntiteType[] = ['devis', 'commande_fournisseur', 'commande_client', 'client', 'produit', 'fournisseur'];
const ALL_ACTIONS: ActionType[] = ['creation', 'modification', 'suppression', 'envoi_email', 'statut', 'reception', 'prise_stock'];

export default function GED() {
  const [entries, setEntries] = useState<HistoriqueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<EntiteType | 'tous'>('tous');
  const [filterAction, setFilterAction] = useState<ActionType | 'tous'>('tous');

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchHistorique({ limit: 500 });
    setEntries(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = entries.filter(e => {
    if (filterType !== 'tous' && e.entiteType !== filterType) return false;
    if (filterAction !== 'tous' && e.action !== filterAction) return false;
    if (search) {
      const s = search.toLowerCase();
      const inNumero = e.entiteNumero.toLowerCase().includes(s);
      const inDetails = e.details ? JSON.stringify(e.details).toLowerCase().includes(s) : false;
      if (!inNumero && !inDetails) return false;
    }
    return true;
  });

  const grouped = groupByDay(filtered);

  const stats = {
    total: entries.length,
    today: entries.filter(e => e.date.startsWith(new Date().toISOString().split('T')[0])).length,
    devis: entries.filter(e => e.entiteType === 'devis').length,
    commandes: entries.filter(e => e.entiteType === 'commande_fournisseur').length,
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card text-center">
          <p className="text-2xl font-heading font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Événements total</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-heading font-bold text-primary">{stats.today}</p>
          <p className="text-xs text-muted-foreground">Aujourd'hui</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-heading font-bold">{stats.devis}</p>
          <p className="text-xs text-muted-foreground">Devis</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-heading font-bold">{stats.commandes}</p>
          <p className="text-xs text-muted-foreground">Cmd fournisseur</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher par numéro, client…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value as EntiteType | 'tous')}
          className="text-sm rounded-md border border-input bg-background px-3 py-1.5">
          <option value="tous">Tous les types</option>
          {ALL_TYPES.map(t => <option key={t} value={t}>{entiteConfig[t].label}</option>)}
        </select>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value as ActionType | 'tous')}
          className="text-sm rounded-md border border-input bg-background px-3 py-1.5">
          <option value="tous">Toutes les actions</option>
          {ALL_ACTIONS.map(a => <option key={a} value={a}>{actionConfig[a].label}</option>)}
        </select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="shrink-0">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Filter className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>Aucun événement{search || filterType !== 'tous' || filterAction !== 'tous' ? ' pour ces filtres' : ''}</p>
          {entries.length === 0 && (
            <p className="text-xs mt-2">Les événements s'enregistrent automatiquement lors de vos actions (création, envoi, modification…)</p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, dayEntries]) => (
            <div key={day}>
              {/* Séparateur de jour */}
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2">
                  {new Date(day + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  <span className="ml-2 font-normal normal-case">({dayEntries.length} événement{dayEntries.length > 1 ? 's' : ''})</span>
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Entrées du jour */}
              <div className="space-y-0">
                {dayEntries.map(e => <EntryRow key={e.id} entry={e} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
