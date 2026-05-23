import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useCRM } from '@/lib/StoreContext';
import {
  calculerTotalDevis, formatMontant, formatDate, formatDateISO,
  useCrmActions,
  CrmAction, TYPE_CRM_ACTION, STATUT_CRM_ACTION,
} from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import CRMActionDialog from '@/components/CRMActionDialog';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, Clock, BarChart3,
  Plus, Pencil, Trash2, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  Phone, Mail, Calendar, MapPin, CheckSquare, Star, AlertCircle, Filter,
  FileText, PieChart, Users,
} from 'lucide-react';
import { RAISON_ARCHIVE } from '@/lib/store';

// ── Statut devis ──────────────────────────────────────────────────────────
const STATUT_DEVIS: Record<string, { label: string; color: string; icon?: any }> = {
  brouillon: { label: 'Brouillon',  color: 'bg-muted text-muted-foreground' },
  envoyé:    { label: 'Envoyé',     color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  accepté:   { label: 'Gagné ✓',   color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  refusé:    { label: 'Perdu ✗',   color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  expiré:    { label: 'Expiré',     color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  archivé:   { label: 'Archivé',    color: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
};

// ── Calendar helpers ──────────────────────────────────────────────────────
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  let d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1; // lundi = 0
}
const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const JOURS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

// ── Type color icons ──────────────────────────────────────────────────────
const TYPE_ICON: Record<string, any> = {
  visite: MapPin, appel: Phone, email: Mail, tache: CheckSquare, rdv: Calendar,
};

export default function CRM() {
  const { clients, devis, produits, updateDevis } = useCRM();
  const { actions, loading: actionsLoading, addAction, updateAction, deleteAction } = useCrmActions();
  const navigate = useNavigate();

  const [tab, setTab] = useState<'pipeline' | 'actions' | 'calendrier' | 'analyse'>('pipeline');

  // ── Pipeline ──────────────────────────────────────────────────────────
  const [filterStatut, setFilterStatut] = useState('tous');
  const [filterClientId, setFilterClientId] = useState('');
  const [searchDevis, setSearchDevis] = useState('');
  const [raisonDialog, setRaisonDialog] = useState<{ devisId: string; open: boolean; raison: string }>({ devisId: '', open: false, raison: '' });

  // ── Actions ───────────────────────────────────────────────────────────
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<CrmAction | null>(null);
  const [actionFilterStatut, setActionFilterStatut] = useState<'toutes' | 'planifiee' | 'realisee' | 'annulee'>('planifiee');
  const [actionFilterType, setActionFilterType] = useState<string>('tous');
  const [actionFilterClient, setActionFilterClient] = useState('');
  const [actionSearch, setActionSearch] = useState('');

  // ── Calendar ──────────────────────────────────────────────────────────
  const [calDate, setCalDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [calViewMode, setCalViewMode] = useState<'mois' | 'semaine'>('mois');

  // ── Stats Pipeline ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totaux = devis.map(d => {
      const t = calculerTotalDevis(d.lignes, d.fraisPortHT, d.fraisPortTVA);
      return { ...d, totalHT: t.totalHT };
    });
    const enCours = totaux.filter(d => d.statut === 'envoyé' || d.statut === 'brouillon');
    const gagnes = totaux.filter(d => d.statut === 'accepté');
    const perdus = totaux.filter(d => d.statut === 'refusé');
    const total = gagnes.length + perdus.length;
    return {
      enCours: enCours.reduce((s, d) => s + d.totalHT, 0),
      gagnes: gagnes.reduce((s, d) => s + d.totalHT, 0),
      perdus: perdus.reduce((s, d) => s + d.totalHT, 0),
      tauxTransfo: total > 0 ? Math.round(gagnes.length / total * 100) : 0,
      nbEnCours: enCours.length,
      nbGagnes: gagnes.length,
      nbPerdus: perdus.length,
    };
  }, [devis]);

  // ── Devis filtrés ─────────────────────────────────────────────────────
  const devisFiltres = useMemo(() => {
    return devis
      .filter(d => {
        if (filterStatut !== 'tous' && d.statut !== filterStatut) return false;
        if (filterClientId && d.clientId !== filterClientId) return false;
        if (searchDevis) {
          const q = searchDevis.toLowerCase();
          const client = clients.find(c => c.id === d.clientId);
          const match = d.numero.toLowerCase().includes(q)
            || (d.referenceAffaire || '').toLowerCase().includes(q)
            || (client?.societe || client?.nom || '').toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => b.dateCreation.localeCompare(a.dateCreation));
  }, [devis, filterStatut, filterClientId, searchDevis, clients]);

  // ── Actions filtrées ──────────────────────────────────────────────────
  const actionsFiltrees = useMemo(() => {
    return actions.filter(a => {
      if (actionFilterStatut !== 'toutes' && a.statut !== actionFilterStatut) return false;
      if (actionFilterType !== 'tous' && a.type !== actionFilterType) return false;
      if (actionFilterClient && a.clientId !== actionFilterClient) return false;
      if (actionSearch) {
        const q = actionSearch.toLowerCase();
        const client = clients.find(c => c.id === a.clientId);
        const match = a.titre.toLowerCase().includes(q)
          || (a.description || '').toLowerCase().includes(q)
          || (client?.societe || client?.nom || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [actions, actionFilterStatut, actionFilterType, actionFilterClient, actionSearch, clients]);

  // ── Calendar data ─────────────────────────────────────────────────────
  const calYear = calDate.getFullYear();
  const calMonth = calDate.getMonth();
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);

  const actionsByDay = useMemo(() => {
    const map: Record<string, CrmAction[]> = {};
    actions.forEach(a => {
      if (!a.datePlanifiee) return;
      const [y, m, d] = a.datePlanifiee.split('-').map(Number);
      if (y === calYear && m - 1 === calMonth) {
        const key = String(d);
        if (!map[key]) map[key] = [];
        map[key].push(a);
      }
    });
    return map;
  }, [actions, calYear, calMonth]);

  const selectedDayActions = selectedDay ? (actionsByDay[String(selectedDay)] || []) : [];

  // ── Handlers ──────────────────────────────────────────────────────────
  function handleStatutDevis(devisId: string, statut: string) {
    if (statut === 'refusé') {
      const d = devis.find(x => x.id === devisId);
      setRaisonDialog({ devisId, open: true, raison: d?.raisonRefus || '' });
    } else {
      updateDevis(prev => prev.map(d => d.id === devisId ? { ...d, statut: statut as any, raisonRefus: undefined } : d));
    }
  }

  function saveRaisonRefus() {
    const { devisId, raison } = raisonDialog;
    updateDevis(prev => prev.map(d => d.id === devisId ? { ...d, statut: 'refusé' as const, raisonRefus: raison || undefined } : d));
    setRaisonDialog({ devisId: '', open: false, raison: '' });
  }

  async function handleSaveAction(a: Omit<CrmAction, 'id' | 'createdAt'>): Promise<any> {
    const err = editingAction
      ? await updateAction({ ...editingAction, ...a })
      : await addAction(a);
    if (err) {
      toast.error('Erreur lors de l\'enregistrement : ' + (err.message || JSON.stringify(err)));
      return err;
    }
    setEditingAction(null);
    return null;
  }

  function openNewAction() {
    setEditingAction(null);
    setActionDialogOpen(true);
  }

  function openEditAction(a: CrmAction) {
    setEditingAction(a);
    setActionDialogOpen(true);
  }

  async function handleMarkDone(a: CrmAction) {
    await updateAction({ ...a, statut: 'realisee', dateRealisee: formatDateISO(new Date()) });
  }

  // ── Today ─────────────────────────────────────────────────────────────
  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();
  const actionsEnRetard = actions.filter(a => {
    if (a.statut !== 'planifiee' || !a.datePlanifiee) return false;
    return a.datePlanifiee < formatDateISO(today);
  });

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header avec alerte retard */}
      {actionsEnRetard.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg text-sm text-orange-700 dark:text-orange-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span><strong>{actionsEnRetard.length} action{actionsEnRetard.length > 1 ? 's' : ''}</strong> en retard</span>
          <button onClick={() => { setTab('actions'); setActionFilterStatut('planifiee'); }} className="ml-auto text-xs underline">Voir</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          { key: 'pipeline', label: 'Pipeline commercial', icon: BarChart3 },
          { key: 'actions',  label: 'Actions',             icon: CheckSquare },
          { key: 'calendrier', label: 'Calendrier',        icon: Calendar },
          { key: 'analyse',  label: 'Analyse',             icon: PieChart },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════ PIPELINE ══════════════════════════ */}
      {tab === 'pipeline' && (
        <div className="space-y-4">
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="En cours"
              value={formatMontant(stats.enCours)}
              sub={`${stats.nbEnCours} devis`}
              color="blue"
              icon={Clock}
            />
            <StatCard
              label="Gagné"
              value={formatMontant(stats.gagnes)}
              sub={`${stats.nbGagnes} devis`}
              color="green"
              icon={TrendingUp}
            />
            <StatCard
              label="Perdu"
              value={formatMontant(stats.perdus)}
              sub={`${stats.nbPerdus} devis`}
              color="red"
              icon={TrendingDown}
            />
            <StatCard
              label="Taux de transfo"
              value={`${stats.tauxTransfo}%`}
              sub={`${stats.nbGagnes} / ${stats.nbGagnes + stats.nbPerdus} décidés`}
              color="purple"
              icon={BarChart3}
            />
          </div>

          {/* Filtres */}
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              placeholder="Rechercher…"
              value={searchDevis}
              onChange={e => setSearchDevis(e.target.value)}
              className="h-8 w-48 text-sm"
            />
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={filterStatut}
              onChange={e => setFilterStatut(e.target.value)}
            >
              <option value="tous">Tous statuts</option>
              {Object.entries(STATUT_DEVIS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={filterClientId}
              onChange={e => setFilterClientId(e.target.value)}
            >
              <option value="">Tous clients</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.societe || c.nom}</option>
              ))}
            </select>
          </div>

          {/* Table devis */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-xs">Devis</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-xs">Client</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-xs hidden md:table-cell">Réf. affaire</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground text-xs">Montant HT</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground text-xs">Statut</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground text-xs hidden lg:table-cell">Date</th>
                    <th className="px-3 py-2.5 font-semibold text-muted-foreground text-xs">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {devisFiltres.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">Aucun devis</td></tr>
                  )}
                  {devisFiltres.map(d => {
                    const client = clients.find(c => c.id === d.clientId);
                    const total = calculerTotalDevis(d.lignes, d.fraisPortHT, d.fraisPortTVA);
                    const st = STATUT_DEVIS[d.statut];
                    return (
                      <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => navigate('/devis')}
                            className="font-medium text-primary hover:underline flex items-center gap-1"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            {d.numero}
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium truncate max-w-[140px]">{client?.societe || client?.nom || '—'}</div>
                          {d.raisonRefus && (
                            <div className="text-xs text-muted-foreground truncate max-w-[140px]" title={d.raisonRefus}>
                              ↳ {d.raisonRefus}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground">{d.referenceAffaire || '—'}</td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatMontant(total.totalHT)}</td>
                        <td className="px-3 py-2.5 text-center">
                          <Badge className={cn('text-xs', st?.color)}>{st?.label}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-center hidden lg:table-cell text-muted-foreground text-xs">{formatDate(d.dateCreation)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            {d.statut !== 'accepté' && (
                              <button
                                onClick={() => handleStatutDevis(d.id, 'accepté')}
                                title="Marquer Gagné"
                                className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 transition-colors"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}
                            {d.statut !== 'refusé' && (
                              <button
                                onClick={() => handleStatutDevis(d.id, 'refusé')}
                                title="Marquer Perdu"
                                className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 transition-colors"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setActionDialogOpen(true);
                                setEditingAction(null);
                              }}
                              title="Créer une action"
                              className="p-1 rounded hover:bg-primary/10 text-primary transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════ ACTIONS ══════════════════════════ */}
      {tab === 'actions' && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex flex-wrap gap-2 items-center">
            <Button size="sm" onClick={openNewAction} className="gap-1.5">
              <Plus className="w-4 h-4" />
              Nouvelle action
            </Button>
            <Input
              placeholder="Rechercher…"
              value={actionSearch}
              onChange={e => setActionSearch(e.target.value)}
              className="h-8 w-44 text-sm"
            />
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={actionFilterStatut}
              onChange={e => setActionFilterStatut(e.target.value as any)}
            >
              <option value="toutes">Tous statuts</option>
              <option value="planifiee">Planifiées</option>
              <option value="realisee">Réalisées</option>
              <option value="annulee">Annulées</option>
            </select>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={actionFilterType}
              onChange={e => setActionFilterType(e.target.value)}
            >
              <option value="tous">Tous types</option>
              {(Object.keys(TYPE_CRM_ACTION) as Array<keyof typeof TYPE_CRM_ACTION>).map(k => (
                <option key={k} value={k}>{TYPE_CRM_ACTION[k].icon} {TYPE_CRM_ACTION[k].label}</option>
              ))}
            </select>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={actionFilterClient}
              onChange={e => setActionFilterClient(e.target.value)}
            >
              <option value="">Tous clients</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.societe || c.nom}</option>
              ))}
            </select>
          </div>

          {/* Liste actions */}
          {actionsLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Chargement…</div>
          ) : actionsFiltrees.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <CheckSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Aucune action trouvée</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={openNewAction}>
                <Plus className="w-4 h-4 mr-1" /> Créer une action
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {actionsFiltrees.map(a => {
                const client = clients.find(c => c.id === a.clientId);
                const TypeIcon = TYPE_ICON[a.type] || CheckSquare;
                const isLate = a.statut === 'planifiee' && a.datePlanifiee && a.datePlanifiee < formatDateISO(today);
                return (
                  <div
                    key={a.id}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                      a.statut === 'realisee' ? 'border-border bg-muted/20 opacity-70' :
                      isLate ? 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/10' :
                      'border-border bg-card hover:bg-muted/30'
                    )}
                  >
                    {/* Icône type */}
                    <div className={cn('flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5', TYPE_CRM_ACTION[a.type].color)}>
                      <TypeIcon className="w-4 h-4" />
                    </div>

                    {/* Contenu */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('font-medium text-sm', a.statut === 'realisee' && 'line-through text-muted-foreground')}>
                          {a.titre}
                        </span>
                        <Badge className={cn('text-xs', STATUT_CRM_ACTION[a.statut].color)}>
                          {STATUT_CRM_ACTION[a.statut].label}
                        </Badge>
                        {a.priorite === 'haute' && (
                          <Badge className="text-xs bg-destructive/10 text-destructive">Urgent</Badge>
                        )}
                        {isLate && (
                          <Badge className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">En retard</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                        {client && <span className="font-medium text-foreground/70">{client.societe || client.nom}</span>}
                        {a.datePlanifiee && <span>📅 {formatDate(a.datePlanifiee)}</span>}
                        {a.dateRealisee && <span>✓ {formatDate(a.dateRealisee)}</span>}
                        {a.description && <span className="truncate max-w-[260px]" title={a.description}>{a.description}</span>}
                      </div>
                    </div>

                    {/* Boutons */}
                    <div className="flex items-center gap-1 shrink-0">
                      {a.statut === 'planifiee' && (
                        <button
                          onClick={() => handleMarkDone(a)}
                          title="Marquer réalisée"
                          className="p-1.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => openEditAction(a)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteAction(a.id)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════ CALENDRIER ══════════════════════════ */}
      {tab === 'calendrier' && (
        <div className="space-y-3">
          {/* En-tête calendrier */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCalDate(new Date(calYear, calMonth - 1, 1))}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-semibold min-w-[180px] text-center">
                {MOIS[calMonth]} {calYear}
              </h2>
              <button
                onClick={() => setCalDate(new Date(calYear, calMonth + 1, 1))}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => setCalDate(new Date())}
                className="ml-2 px-3 py-1 text-xs rounded-md border border-border hover:bg-muted transition-colors"
              >
                Aujourd'hui
              </button>
            </div>
            <Button size="sm" onClick={openNewAction} className="gap-1.5">
              <Plus className="w-4 h-4" />
              Nouvelle action
            </Button>
          </div>

          {/* Grille calendrier */}
          <div className="rounded-lg border border-border overflow-hidden">
            {/* Jours de la semaine */}
            <div className="grid grid-cols-7 bg-muted/50 border-b border-border">
              {JOURS.map(j => (
                <div key={j} className="py-2 text-center text-xs font-semibold text-muted-foreground">
                  {j}
                </div>
              ))}
            </div>
            {/* Jours */}
            <div className="grid grid-cols-7">
              {/* Cases vides avant le 1er */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[80px] border-r border-b border-border bg-muted/10 last:border-r-0" />
              ))}
              {/* Jours du mois */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayActions = actionsByDay[String(day)] || [];
                const isToday = day === todayDay && calMonth === todayMonth && calYear === todayYear;
                const isSelected = day === selectedDay;
                const hasLate = dayActions.some(a => a.statut === 'planifiee' && a.datePlanifiee && a.datePlanifiee < formatDateISO(today));
                return (
                  <div
                    key={day}
                    onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                    className={cn(
                      'min-h-[80px] border-r border-b border-border p-1.5 cursor-pointer transition-colors',
                      (firstDay + i) % 7 === 6 && 'border-r-0',
                      isSelected ? 'bg-primary/5' :
                      isToday ? 'bg-blue-50 dark:bg-blue-900/10' :
                      'hover:bg-muted/30'
                    )}
                  >
                    <div className={cn(
                      'w-6 h-6 flex items-center justify-center rounded-full text-sm font-medium mb-1',
                      isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
                    )}>
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {dayActions.slice(0, 3).map(a => {
                        const TypeIcon = TYPE_ICON[a.type] || CheckSquare;
                        return (
                          <div
                            key={a.id}
                            onClick={e => { e.stopPropagation(); openEditAction(a); }}
                            title={a.titre}
                            className={cn(
                              'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium truncate cursor-pointer hover:opacity-80',
                              TYPE_CRM_ACTION[a.type].color
                            )}
                          >
                            <TypeIcon className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{a.titre}</span>
                          </div>
                        );
                      })}
                      {dayActions.length > 3 && (
                        <div className="text-[10px] text-muted-foreground px-1">
                          +{dayActions.length - 3} autres
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Panneau du jour sélectionné */}
          {selectedDay && (
            <div className="rounded-lg border border-border p-4 bg-card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">
                  {selectedDay} {MOIS[calMonth]} {calYear}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({selectedDayActions.length} action{selectedDayActions.length > 1 ? 's' : ''})
                  </span>
                </h3>
                <Button size="sm" variant="outline" onClick={() => {
                  setEditingAction(null);
                  setActionDialogOpen(true);
                }}>
                  <Plus className="w-4 h-4 mr-1" /> Ajouter
                </Button>
              </div>
              {selectedDayActions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune action ce jour.</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayActions.map(a => {
                    const client = clients.find(c => c.id === a.clientId);
                    const TypeIcon = TYPE_ICON[a.type] || CheckSquare;
                    return (
                      <div key={a.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30">
                        <div className={cn('flex items-center justify-center w-7 h-7 rounded-md shrink-0', TYPE_CRM_ACTION[a.type].color)}>
                          <TypeIcon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{a.titre}</div>
                          {client && <div className="text-xs text-muted-foreground">{client.societe || client.nom}</div>}
                          {a.description && <div className="text-xs text-muted-foreground mt-0.5">{a.description}</div>}
                        </div>
                        <div className="flex gap-1">
                          {a.statut === 'planifiee' && (
                            <button onClick={() => handleMarkDone(a)} className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => openEditAction(a)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Onglet Analyse ────────────────────────────────────────────── */}
      {tab === 'analyse' && (() => {
        const devisActifs = devis.filter(d => d.statut !== 'système');

        // Par client
        const parClient = clients.map(c => {
          const cd = devisActifs.filter(d => d.clientId === c.id);
          const acceptes = cd.filter(d => d.statut === 'accepté');
          const archives = cd.filter(d => d.statut === 'archivé');
          const total = acceptes.length + archives.length;
          const taux = total > 0 ? Math.round(acceptes.length / total * 100) : null;
          const ca = acceptes.reduce((s, d) => s + calculerTotalDevis(d.lignes, d.fraisPortHT, d.fraisPortTVA).totalHT, 0);
          return { client: c, acceptes: acceptes.length, archives: archives.length, taux, ca, total: cd.length };
        }).filter(r => r.total > 0).sort((a, b) => b.ca - a.ca);

        // Par produit
        const parProduit: Record<string, { gains: number; pertes: number; ca: number }> = {};
        devisActifs.forEach(d => {
          const isGagne = d.statut === 'accepté';
          const isPerdu = d.statut === 'archivé';
          d.lignes.filter(l => l.produitId && (!l.type || l.type === 'ligne')).forEach(l => {
            if (!parProduit[l.produitId!]) parProduit[l.produitId!] = { gains: 0, pertes: 0, ca: 0 };
            if (isGagne) { parProduit[l.produitId!].gains++; parProduit[l.produitId!].ca += l.prixUnitaireHT * l.quantite * (1 - (l.remise || 0) / 100); }
            if (isPerdu) parProduit[l.produitId!].pertes++;
          });
        });
        const produitRows = Object.entries(parProduit).map(([produitId, stats]) => {
          const prod = produits.find(p => p.id === produitId);
          const total = stats.gains + stats.pertes;
          return { prod, ...stats, taux: total > 0 ? Math.round(stats.gains / total * 100) : null };
        }).filter(r => r.prod).sort((a, b) => b.ca - a.ca);

        // Raisons de refus globales
        const raisonsGlobal: Record<string, number> = {};
        devisActifs.filter(d => d.statut === 'archivé').forEach(d => {
          if (d.archiveRaison) raisonsGlobal[d.archiveRaison] = (raisonsGlobal[d.archiveRaison] || 0) + 1;
        });

        // Concurrents depuis devis archivés
        const concurrentsDevisMap: Record<string, { count: number; prixTotal: number; prixCount: number }> = {};
        devisActifs.filter(d => d.statut === 'archivé' && d.archiveConcurrents).forEach(d => {
          d.archiveConcurrents!.forEach(c => {
            const nom = c.nomConcurrent?.trim() || 'Inconnu';
            if (!concurrentsDevisMap[nom]) concurrentsDevisMap[nom] = { count: 0, prixTotal: 0, prixCount: 0 };
            concurrentsDevisMap[nom].count++;
            if (c.prixConcurrent) { concurrentsDevisMap[nom].prixTotal += c.prixConcurrent; concurrentsDevisMap[nom].prixCount++; }
          });
        });
        const concurrentsDevisRows = Object.entries(concurrentsDevisMap).sort((a, b) => b[1].count - a[1].count);

        // ── Analyse de prix depuis actions CRM ────────────────────────
        // Collect all concurrent entries from CRM actions
        interface PrixEntry {
          nomConcurrent: string;
          produitRef: string;
          tarif?: number;
          delai?: number;
          note?: string;
          clientNom: string;
          date: string;
          actionTitre: string;
        }
        const prixEntries: PrixEntry[] = [];
        actions.forEach(a => {
          if (!a.concurrents?.length) return;
          const clientNom = a.clientId ? (clients.find(c => c.id === a.clientId)?.societe || clients.find(c => c.id === a.clientId)?.nom || '—') : '—';
          a.concurrents.forEach(c => {
            if (!c.nomConcurrent?.trim()) return;
            prixEntries.push({
              nomConcurrent: c.nomConcurrent.trim(),
              produitRef: c.produitRef?.trim() || '—',
              tarif: c.tarif,
              delai: c.delai,
              note: c.note,
              clientNom,
              date: a.dateRealisee || a.datePlanifiee || a.createdAt,
              actionTitre: a.titre,
            });
          });
        });
        // Sort by date desc
        prixEntries.sort((a, b) => b.date.localeCompare(a.date));

        // Aggregate by concurrent+produit
        const prixParConcProd: Record<string, { nom: string; produit: string; tarifsTotal: number; tarifsCount: number; delaisTotal: number; delaisCount: number; mentions: number; derniereDate: string }> = {};
        prixEntries.forEach(e => {
          const key = `${e.nomConcurrent}||${e.produitRef}`;
          if (!prixParConcProd[key]) prixParConcProd[key] = { nom: e.nomConcurrent, produit: e.produitRef, tarifsTotal: 0, tarifsCount: 0, delaisTotal: 0, delaisCount: 0, mentions: 0, derniereDate: e.date };
          prixParConcProd[key].mentions++;
          if (e.tarif) { prixParConcProd[key].tarifsTotal += e.tarif; prixParConcProd[key].tarifsCount++; }
          if (e.delai) { prixParConcProd[key].delaisTotal += e.delai; prixParConcProd[key].delaisCount++; }
          if (e.date > prixParConcProd[key].derniereDate) prixParConcProd[key].derniereDate = e.date;
        });
        const prixRows = Object.values(prixParConcProd).sort((a, b) => b.mentions - a.mentions);

        return (
          <div className="space-y-6">
            {/* Bloc 1 — Par client */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Users className="w-4 h-4" /> Analyse par client</h3>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Client</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total devis</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Acceptés</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Archivés</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Taux</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">CA accepté HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parClient.map(({ client, acceptes, archives, taux, ca, total }) => (
                      <tr key={client.id} className="border-t border-border hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium">{client.societe || client.nom}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{total}</td>
                        <td className="px-3 py-2 text-right text-success font-medium">{acceptes}</td>
                        <td className="px-3 py-2 text-right text-destructive">{archives}</td>
                        <td className="px-3 py-2 text-right">
                          {taux !== null ? (
                            <span className={`font-semibold ${taux >= 50 ? 'text-success' : taux >= 25 ? 'text-amber-500' : 'text-destructive'}`}>{taux}%</span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{ca > 0 ? formatMontant(ca) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parClient.length === 0 && <p className="text-center py-6 text-muted-foreground text-sm">Aucune donnée</p>}
              </div>
            </div>

            {/* Bloc 2 — Par produit */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Analyse par produit</h3>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Produit</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Devis gagnés</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Devis perdus</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Taux win</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">CA HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {produitRows.map(({ prod, gains, pertes, taux, ca }) => (
                      <tr key={prod!.id} className="border-t border-border hover:bg-muted/20">
                        <td className="px-3 py-2">
                          <p className="font-medium truncate max-w-xs">{prod!.description}</p>
                          <p className="text-xs text-muted-foreground font-mono">{prod!.reference}</p>
                        </td>
                        <td className="px-3 py-2 text-right text-success font-medium">{gains}</td>
                        <td className="px-3 py-2 text-right text-destructive">{pertes}</td>
                        <td className="px-3 py-2 text-right">
                          {taux !== null ? <span className={`font-semibold ${taux >= 50 ? 'text-success' : 'text-amber-500'}`}>{taux}%</span> : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{ca > 0 ? formatMontant(ca) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {produitRows.length === 0 && <p className="text-center py-6 text-muted-foreground text-sm">Aucune donnée</p>}
              </div>
            </div>

            {/* Bloc 3 — Raisons d'archivage */}
            {Object.keys(raisonsGlobal).length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2"><XCircle className="w-4 h-4" /> Raisons d'archivage</h3>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(raisonsGlobal) as [import('@/lib/store').RaisonArchive, number][]).sort((a, b) => b[1] - a[1]).map(([raison, count]) => (
                    <span key={raison} className={`text-sm px-3 py-1.5 rounded-full font-medium flex items-center gap-2 ${RAISON_ARCHIVE[raison]?.color || 'bg-muted text-muted-foreground'}`}>
                      {RAISON_ARCHIVE[raison]?.label} <span className="font-bold bg-white/30 rounded-full px-1.5">×{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Bloc 4 — Concurrents depuis devis archivés */}
            {concurrentsDevisRows.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2"><TrendingDown className="w-4 h-4" /> Concurrents (devis archivés)</h3>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Concurrent</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cité</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Prix moyen renseigné</th>
                      </tr>
                    </thead>
                    <tbody>
                      {concurrentsDevisRows.map(([nom, stats]) => (
                        <tr key={nom} className="border-t border-border hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium">{nom}</td>
                          <td className="px-3 py-2 text-right font-semibold">{stats.count}×</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {stats.prixCount > 0 ? formatMontant(Math.round(stats.prixTotal / stats.prixCount)) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Bloc 5 — Analyse de prix concurrents (depuis actions CRM) */}
            <div>
              <h3 className="font-semibold mb-1 flex items-center gap-2"><PieChart className="w-4 h-4 text-violet-500" /> Analyse de prix concurrents</h3>
              <p className="text-xs text-muted-foreground mb-3">Tarifs et délais collectés lors des visites, appels et rendez-vous.</p>

              {prixRows.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border mb-4">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Concurrent</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Produit / Réf.</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Tarif moyen</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Délai moy.</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Mentions</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Dernière info</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prixRows.map((r, i) => (
                        <tr key={i} className="border-t border-border hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium">{r.nom}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.produit}</td>
                          <td className="px-3 py-2 text-right font-semibold text-destructive">
                            {r.tarifsCount > 0 ? formatMontant(Math.round(r.tarifsTotal / r.tarifsCount)) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {r.delaisCount > 0 ? `${Math.round(r.delaisTotal / r.delaisCount)} j` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right">{r.mentions}×</td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground">{formatDate(r.derniereDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Détail des entrées */}
              {prixEntries.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Historique détaillé</p>
                  <div className="space-y-1.5">
                    {prixEntries.slice(0, 30).map((e, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-muted/10 px-3 py-2 text-sm">
                        <span className="font-medium text-destructive min-w-[120px] truncate">{e.nomConcurrent}</span>
                        <span className="font-mono text-xs text-muted-foreground min-w-[80px]">{e.produitRef}</span>
                        <span className="font-semibold min-w-[70px]">{e.tarif ? formatMontant(e.tarif) : '—'}</span>
                        {e.delai && <span className="text-muted-foreground">{e.delai} j</span>}
                        <span className="text-muted-foreground flex-1 truncate">{e.clientNom}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{formatDate(e.date)}</span>
                        {e.note && <span className="text-xs italic text-muted-foreground truncate max-w-[150px]">{e.note}</span>}
                      </div>
                    ))}
                    {prixEntries.length > 30 && (
                      <p className="text-xs text-muted-foreground text-center py-1">… et {prixEntries.length - 30} autres entrées</p>
                    )}
                  </div>
                </div>
              )}

              {prixEntries.length === 0 && (
                <div className="rounded-lg border border-dashed border-border py-8 text-center">
                  <TrendingDown className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Aucune info concurrence saisie</p>
                  <p className="text-xs text-muted-foreground mt-1">Renseignez les tarifs concurrents dans les actions CRM (visite, appel, RDV)</p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Dialog action ─────────────────────────────────────────────── */}
      <CRMActionDialog
        open={actionDialogOpen}
        onOpenChange={v => { setActionDialogOpen(v); if (!v) setEditingAction(null); }}
        action={editingAction}
        clients={clients}
        produits={produits.map(p => ({ id: p.id, reference: p.reference, description: p.description }))}
        onSave={handleSaveAction}
      />

      {/* ── Dialog raison refus ───────────────────────────────────────── */}
      <Dialog open={raisonDialog.open} onOpenChange={v => setRaisonDialog(p => ({ ...p, open: v }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Raison du refus</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-xs text-muted-foreground">Motif (optionnel)</Label>
            <Textarea
              value={raisonDialog.raison}
              onChange={e => setRaisonDialog(p => ({ ...p, raison: e.target.value }))}
              placeholder="Prix, concurrent, délai, budget…"
              rows={3}
              className="mt-1 resize-none"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRaisonDialog({ devisId: '', open: false, raison: '' })}>Annuler</Button>
            <Button variant="destructive" onClick={saveRaisonRefus}>Marquer Perdu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── StatCard ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub: string;
  color: 'blue' | 'green' | 'red' | 'purple';
  icon: any;
}) {
  const colors = {
    blue:   'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green:  'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
    red:    'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    purple: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400',
  };
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', colors[color])}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}
