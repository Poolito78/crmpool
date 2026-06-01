import { useState, useCallback, useRef, useMemo, Fragment } from 'react';
import { useCRM } from '@/lib/StoreContext';
import { calculerTotalDevis, formatMontant, formatDate, calculerDateEcheance, useCrmActions, formatDateISO, getPrixPourQuantite, TYPE_CRM_ACTION, STATUT_CRM_ACTION } from '@/lib/store';
import { exportToExcel } from '@/lib/exportExcel';
import { Users, Package, FileText, AlertTriangle, TrendingUp, Truck, Clock, ScanText, Upload, ArrowDownCircle, ArrowUpCircle, ShoppingCart, Bell, Phone, Mail, MapPin, CheckSquare, Calendar, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import AnalyseDocumentDialog from '@/components/AnalyseDocumentDialog';
import { toast } from 'sonner';
import { useConcurrents, formatCreateur } from '@/lib/concurrents';
import { useHiddenTiles } from '@/lib/dashboardSettings';

const TYPE_ICON: Record<string, any> = {
  visite: MapPin, appel: Phone, email: Mail, tache: CheckSquare, rdv: Calendar,
};

export default function Dashboard() {
  const { clients, produits, fournisseurs, devis, commandesFournisseur, commandesClient } = useCRM();
  const { actions: crmActions } = useCrmActions();
  const { concurrents: concurrentsList, notes: concurrentNotes } = useConcurrents();
  const hidden = useHiddenTiles();
  const [dashTab, setDashTab] = useState<'overview' | 'previsionnel'>('overview');
  const [analyseOpen, setAnalyseOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [droppedText, setDroppedText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0); // compteur pour ignorer les dragenter/leave des enfants

  const handlePageDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.some(t => t === 'Files' || t === 'text/plain')) setIsDragging(true);
  }, []);

  const handlePageDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handlePageDragLeave = useCallback((e: React.DragEvent) => {
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragging(false); }
  }, []);

  const handlePageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setDroppedFiles(files);
      setAnalyseOpen(true);
      return;
    }
    // Detect text drop → open analyse dialog with text pre-filled
    const text = e.dataTransfer.getData('text/plain');
    if (text?.trim()) {
      setDroppedText(text.trim());
      setAnalyseOpen(true);
    }
  }, []);

  const produitsStockBas = produits.filter(p => p.stock < p.stockMin);
  const devisAcceptes = devis.filter(d => d.statut === 'accepté');
  const caTotal = devisAcceptes.reduce((sum, d) => sum + calculerTotalDevis(d.lignes, d.fraisPortHT, d.fraisPortTVA).totalHT, 0);
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

  // Échéances fournisseurs
  // Priorité : dateEcheance stockée (calculée à la réception) > recalcul depuis dateReception > dateCreation
  const echeancesFournisseurs = commandesFournisseur
    .filter(cf => cf.statut === 'recue' || cf.statut === 'payee')
    .map(cf => {
      const fourn = fournisseurs.find(f => f.id === cf.fournisseurId);
      let dateEch: Date;
      if (cf.dateEcheance) {
        const [y, mo, da] = cf.dateEcheance.split('-').map(Number);
        dateEch = new Date(y, mo - 1, da);
      } else {
        const dateBase = cf.dateReception || cf.dateCreation;
        const delai = fourn?.delaiReglement || '45j FDM';
        dateEch = calculerDateEcheance(dateBase, delai);
      }
      return { cf, fourn, dateEch };
    })
    .sort((a, b) => a.dateEch.getTime() - b.dateEch.getTime());

  const echeancesEchues = echeancesFournisseurs.filter(e => e.dateEch < now);
  const totalEchu = echeancesEchues.reduce((s, e) => s + e.cf.totalTTC, 0);
  const totalEncours = echeancesFournisseurs.reduce((s, e) => s + e.cf.totalTTC, 0);

  // ── Encours fin de mois ──────────────────────────────────────────────────
  const finDuMois = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);

  // Fournisseurs : commandes non payées avec échéance ≤ fin du mois
  const encoursFournFDM = echeancesFournisseurs
    .filter(e => e.cf.statut !== 'payee' && e.dateEch <= finDuMois);
  const totalFournFDM = encoursFournFDM.reduce((s, e) => s + e.cf.totalTTC, 0);
  const totalFournFDMEchu = encoursFournFDM.filter(e => e.dateEch < now).reduce((s, e) => s + e.cf.totalTTC, 0);

  // Clients : commandes non livrées/annulées (ce qu'on doit facturer/encaisser)
  const encoursClientFDM = commandesClient
    .filter(cc => cc.statut === 'a_traiter' || cc.statut === 'en_cours' || cc.statut === 'expedie');
  const totalClientFDM = encoursClientFDM.reduce((s, cc) => s + cc.totalTTC, 0);
  // Parmi ceux dont la livraison prévue est ce mois-ci ou dépassée
  const clientFDMCeMois = encoursClientFDM.filter(cc => {
    if (!cc.dateLivraisonPrevue) return false;
    const d = new Date(cc.dateLivraisonPrevue);
    return d <= finDuMois;
  });
  const totalClientFDMCeMois = clientFDMCeMois.reduce((s, cc) => s + cc.totalTTC, 0);

  // ── Commandes client à traiter ──────────────────────────────────────────────
  const commandesATraiter = commandesClient.filter(c => c.statut === 'a_traiter');
  const totalCommandesATraiter = commandesATraiter.reduce((s, c) => s + c.totalHT, 0);

  // ── CRM : actions à relancer (planifiées aujourd'hui ou en retard) ──────────
  const today = formatDateISO(new Date());
  const actionsUrgentes = crmActions.filter(a =>
    a.statut === 'planifiee' && a.datePlanifiee && a.datePlanifiee <= today
  ).sort((a, b) => (a.datePlanifiee || '') > (b.datePlanifiee || '') ? 1 : -1);
  const actionsEnRetard = actionsUrgentes.filter(a => a.datePlanifiee && a.datePlanifiee < today);
  const actionsAujourdhui = actionsUrgentes.filter(a => a.datePlanifiee === today);

  const stats = [
    { id: 'stat-clients', label: 'Clients', value: clients.length, icon: Users, color: 'text-primary', bg: 'bg-primary/10', link: '/clients' },
    { id: 'stat-produits', label: 'Produits', value: produits.length, icon: Package, color: 'text-accent', bg: 'bg-accent/10', link: '/produits' },
    { id: 'stat-fournisseurs', label: 'Fournisseurs', value: fournisseurs.length, icon: Truck, color: 'text-info', bg: 'bg-info/10', link: '/fournisseurs' },
    { id: 'stat-devis', label: 'Devis', value: devis.length, icon: FileText, color: 'text-success', bg: 'bg-success/10', link: '/devis' },
    { id: 'stat-ca', label: 'CA Accepté HT', value: formatMontant(caTotal), icon: TrendingUp, color: 'text-success', bg: 'bg-success/10', link: '/devis' },
    { id: 'stat-marge-annuelle', label: 'Marge annuelle', value: formatMontant(margeAnnuelle), icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10', link: '/devis' },
    { id: 'stat-marge-mensuelle', label: 'Marge mensuelle', value: formatMontant(margeMensuelle), icon: TrendingUp, color: 'text-accent', bg: 'bg-accent/10', link: '/devis' },
    { id: 'stat-stock-bas', label: 'Stock bas', value: produitsStockBas.length, icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10', link: '/stock' },
    { id: 'stat-concurrents', label: 'Concurrents suivis', value: concurrentsList.length, icon: Eye, color: 'text-rose-500', bg: 'bg-rose-500/10', link: '/veille-concurrence' },
  ].filter(s => !hidden.has(s.id as any));

  const statutColors: Record<string, string> = {
    brouillon: 'bg-muted text-muted-foreground',
    envoyé: 'bg-info/10 text-info',
    accepté: 'bg-success/10 text-success',
    refusé: 'bg-destructive/10 text-destructive',
    expiré: 'bg-muted text-muted-foreground',
  };

  return (
    <div
      className="space-y-6 relative"
      onDragEnter={handlePageDragEnter}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      {/* ── Overlay drag-and-drop plein écran ── */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 pointer-events-none"
          style={{ background: 'rgba(var(--primary-rgb, 59 130 246) / 0.08)', backdropFilter: 'blur(2px)' }}>
          <div className="rounded-3xl border-4 border-dashed border-primary bg-background/80 px-16 py-12 flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-20 h-20 rounded-2xl bg-primary/15 flex items-center justify-center">
              <Upload className="w-10 h-10 text-primary animate-bounce" />
            </div>
            <p className="text-2xl font-bold text-primary">Déposer pour analyser</p>
            <p className="text-sm text-muted-foreground text-center">PDF · Excel · Email (.eml / .msg) · Texte d'email</p>
          </div>
        </div>
      )}

      {/* ── Onglets tableau de bord ── */}
      <div className="flex gap-1 border-b border-border">
        <button onClick={() => setDashTab('overview')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${dashTab === 'overview' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Vue d'ensemble</button>
        <button onClick={() => setDashTab('previsionnel')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${dashTab === 'previsionnel' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Prévisionnel devis</button>
      </div>

      {dashTab === 'previsionnel' ? (
        <PrevisionnelDevis devis={devis} clients={clients} produits={produits} />
      ) : (
      <>
      {/* ── Alertes prioritaires ── */}
      {((commandesATraiter.length > 0 && !hidden.has('alerte-commandes')) || (actionsUrgentes.length > 0 && !hidden.has('alerte-relances'))) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Commandes client à traiter */}
          {commandesATraiter.length > 0 && !hidden.has('alerte-commandes') && (
            <Link to="/commandes-client" className="block rounded-xl border-2 border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20 p-4 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
                  <ShoppingCart className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-orange-700 dark:text-orange-300">
                    {commandesATraiter.length} commande{commandesATraiter.length > 1 ? 's' : ''} à traiter
                  </p>
                  <p className="text-xs text-orange-600/70 dark:text-orange-400/70">{formatMontant(totalCommandesATraiter)} HT</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {commandesATraiter.slice(0, 4).map(cmd => {
                  const client = clients.find(c => c.id === cmd.clientId);
                  return (
                    <div key={cmd.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-medium text-orange-700 dark:text-orange-300 shrink-0">{cmd.numero}</span>
                        <span className="truncate text-orange-600/80 dark:text-orange-400/80">{client?.societe || client?.nom || '—'}</span>
                      </div>
                      <span className="font-semibold text-orange-700 dark:text-orange-300 shrink-0 ml-2">{formatMontant(cmd.totalHT)}</span>
                    </div>
                  );
                })}
                {commandesATraiter.length > 4 && (
                  <p className="text-xs text-orange-500 dark:text-orange-400 text-right">+{commandesATraiter.length - 4} autres</p>
                )}
              </div>
            </Link>
          )}

          {/* CRM : relances */}
          {actionsUrgentes.length > 0 && !hidden.has('alerte-relances') && (
            <Link to="/crm" className="block rounded-xl border-2 border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 p-4 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                  <Bell className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-violet-700 dark:text-violet-300">
                    {actionsUrgentes.length} relance{actionsUrgentes.length > 1 ? 's' : ''} CRM
                    {actionsEnRetard.length > 0 && (
                      <span className="ml-2 text-xs font-normal text-red-500 dark:text-red-400">
                        ({actionsEnRetard.length} en retard)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-violet-600/70 dark:text-violet-400/70">
                    {actionsAujourdhui.length > 0 && `${actionsAujourdhui.length} aujourd'hui`}
                    {actionsAujourdhui.length > 0 && actionsEnRetard.length > 0 && ' · '}
                    {actionsEnRetard.length > 0 && `${actionsEnRetard.length} en retard`}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                {actionsUrgentes.slice(0, 4).map(a => {
                  const client = clients.find(c => c.id === a.clientId);
                  const TypeIcon = TYPE_ICON[a.type] || CheckSquare;
                  const isLate = a.datePlanifiee && a.datePlanifiee < today;
                  return (
                    <div key={a.id} className="flex items-center gap-2 text-xs">
                      <TypeIcon className={cn('w-3.5 h-3.5 shrink-0', isLate ? 'text-red-500' : 'text-violet-500')} />
                      <span className={cn('truncate flex-1', isLate ? 'text-red-600 dark:text-red-400' : 'text-violet-700 dark:text-violet-300')}>
                        {a.titre}
                      </span>
                      {client && <span className="truncate text-violet-500/70 dark:text-violet-400/70 max-w-[90px]">{client.societe || client.nom}</span>}
                      {a.datePlanifiee && (
                        <span className={cn('shrink-0 font-medium', isLate ? 'text-red-500' : 'text-violet-600 dark:text-violet-400')}>
                          {isLate ? `−${Math.round((new Date(today).getTime() - new Date(a.datePlanifiee).getTime()) / 86400000)}j` : 'auj.'}
                        </span>
                      )}
                    </div>
                  );
                })}
                {actionsUrgentes.length > 4 && (
                  <p className="text-xs text-violet-500 dark:text-violet-400 text-right">+{actionsUrgentes.length - 4} autres</p>
                )}
              </div>
            </Link>
          )}
        </div>
      )}

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

      <AnalyseDocumentDialog
        open={analyseOpen}
        onOpenChange={(v) => { setAnalyseOpen(v); if (!v) { setDroppedFiles([]); setDroppedText(''); } }}
        initialFiles={droppedFiles.length > 0 ? droppedFiles : undefined}
        initialText={droppedText || undefined}
      />

      {/* ── Encours fin de mois ── */}
      {((totalFournFDM > 0 && !hidden.has('encours-fourn-fdm')) || (totalClientFDM > 0 && !hidden.has('encours-client-fdm'))) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Fournisseurs FDM */}
          {totalFournFDM > 0 && !hidden.has('encours-fourn-fdm') && (
            <Link to="/commandes" className="bg-card rounded-xl border border-border p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                  <ArrowUpCircle className="w-4 h-4 text-destructive" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">À payer — FDM</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(currentYear, currentMonth + 1, 0).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</p>
                </div>
              </div>
              <p className="text-2xl font-bold font-heading text-destructive">{formatMontant(totalFournFDM)}</p>
              {totalFournFDMEchu > 0 && (
                <p className="text-xs text-destructive/70 mt-1">dont {formatMontant(totalFournFDMEchu)} échus</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">{encoursFournFDM.length} commande{encoursFournFDM.length > 1 ? 's' : ''} fournisseur</p>
            </Link>
          )}

          {/* Clients FDM */}
          {totalClientFDM > 0 && !hidden.has('encours-client-fdm') && (
            <Link to="/commandes-client" className="bg-card rounded-xl border border-border p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                  <ArrowDownCircle className="w-4 h-4 text-success" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">À encaisser — FDM</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(currentYear, currentMonth + 1, 0).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</p>
                </div>
              </div>
              <p className="text-2xl font-bold font-heading text-success">{formatMontant(totalClientFDM)}</p>
              {totalClientFDMCeMois > 0 && totalClientFDMCeMois < totalClientFDM && (
                <p className="text-xs text-success/70 mt-1">dont {formatMontant(totalClientFDMCeMois)} ce mois</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">{encoursClientFDM.length} commande{encoursClientFDM.length > 1 ? 's' : ''} client</p>
            </Link>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Encours fournisseurs */}
        {echeancesFournisseurs.length > 0 && !hidden.has('panel-echeances-fourn') && (
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-warning" />
                Échéances fournisseurs
              </h2>
              <Link to="/fournisseurs" className="text-sm text-primary hover:underline">Voir tout</Link>
            </div>
            {totalEchu > 0 && (
              <div className="mb-3 p-2 rounded-lg bg-destructive/10 text-destructive text-sm font-medium flex justify-between">
                <span>⚠ Montant échu</span>
                <span>{formatMontant(totalEchu)}</span>
              </div>
            )}
            <div className="mb-3 p-2 rounded-lg bg-muted/50 text-sm flex justify-between">
              <span className="text-muted-foreground">Total encours</span>
              <span className="font-semibold">{formatMontant(totalEncours)}</span>
            </div>
            <div className="space-y-2">
              {echeancesFournisseurs.slice(0, 6).map(({ cf, fourn, dateEch }) => {
                const echu = dateEch < now;
                const joursRestants = Math.round((dateEch.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <Link key={cf.id} to={`/commandes?search=${encodeURIComponent(cf.numero)}`} className="flex items-center justify-between py-2 border-b border-border last:border-0 hover:bg-muted/50 rounded-lg px-2 -mx-2 transition-colors cursor-pointer">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{fourn?.societe || '—'}</p>
                      <p className="text-xs text-muted-foreground">{cf.numero}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-semibold">{formatMontant(cf.totalTTC)}</p>
                      <p className={`text-xs font-medium ${echu ? 'text-destructive' : joursRestants <= 10 ? 'text-warning' : 'text-muted-foreground'}`}>
                        {echu ? `Échu depuis ${Math.abs(joursRestants)}j` : joursRestants === 0 ? `Aujourd'hui` : `Dans ${joursRestants}j — ${dateEch.toLocaleDateString('fr-FR')}`}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Quotes */}
        {!hidden.has('panel-derniers-devis') && (
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-lg">Derniers devis</h2>
            <Link to="/devis" className="text-sm text-primary hover:underline">Voir tout</Link>
          </div>
          <div className="space-y-3">
            {devis.slice(0, 5).map(d => {
              const client = clients.find(c => c.id === d.clientId);
              const total = calculerTotalDevis(d.lignes, d.fraisPortHT, d.fraisPortTVA);
              return (
                <Link key={d.id} to={`/devis?editDevis=${d.id}`} className="flex items-center justify-between py-2 border-b border-border last:border-0 hover:bg-muted/50 rounded-lg px-2 -mx-2 transition-colors cursor-pointer">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{d.numero}</p>
                    <p className="text-xs text-muted-foreground truncate">{client?.societe || client?.nom || 'Client inconnu'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statutColors[d.statut]}`}>
                      {d.statut}
                    </span>
                    <div className="text-right">
                      <span className="text-sm font-semibold whitespace-nowrap">{formatMontant(total.totalHT)}</span>
                      <span className="block text-[10px] text-muted-foreground">HT</span>
                    </div>
                  </div>
                </Link>
              );
            })}
            {devis.length === 0 && <p className="text-sm text-muted-foreground">Aucun devis</p>}
          </div>
        </div>
        )}

        {/* Low Stock Alerts */}
        {!hidden.has('panel-alertes-stock') && (
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-lg">Alertes stock</h2>
            <Link to="/stock" className="text-sm text-primary hover:underline">Voir tout</Link>
          </div>
          <div className="space-y-3">
            {produitsStockBas.slice(0, 5).map(p => (
              <Link key={p.id} to={`/produits?search=${encodeURIComponent(p.reference)}&highlight=${p.id}`} className="flex items-center justify-between py-2 border-b border-border last:border-0 hover:bg-muted/50 rounded-lg px-2 -mx-2 transition-colors cursor-pointer">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{p.description}</p>
                  <p className="text-xs text-muted-foreground">{p.reference}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-warning">{p.stock}</span>
                  <span className="text-xs text-muted-foreground">/ {p.stockMin} min</span>
                </div>
              </Link>
            ))}
            {produitsStockBas.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">✅ Stock OK</p>}
          </div>
        </div>
        )}

        {/* Veille Concurrence */}
        {!hidden.has('panel-veille') && (
        <div className="bg-card rounded-xl border border-rose-200 dark:border-rose-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
              <Eye className="w-5 h-5 text-rose-500" />
              Veille concurrence
            </h2>
            <Link to="/veille-concurrence" className="text-sm text-rose-500 hover:underline">Voir tout</Link>
          </div>
          {concurrentsList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <p className="text-sm text-muted-foreground text-center">Aucun concurrent suivi pour l'instant.</p>
              <Link to="/veille-concurrence">
                <Button size="sm" variant="outline" className="border-rose-300 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950">
                  <Eye className="w-4 h-4 mr-2" />
                  Ajouter un concurrent
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-3 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30">
                <span className="text-2xl font-bold font-heading text-rose-600">{concurrentsList.length}</span>
                <span className="text-sm text-rose-600/70">concurrent{concurrentsList.length > 1 ? 's' : ''} suivi{concurrentsList.length > 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-2">
                {concurrentNotes.slice(0, 4).map(n => {
                  const concurrent = concurrentsList.find(c => c.id === n.concurrentId);
                  return (
                    <Link key={n.id} to="/veille-concurrence" className="flex items-start gap-2 py-2 border-b border-border last:border-0 hover:bg-muted/50 rounded-lg px-2 -mx-2 transition-colors">
                      <Eye className="w-3.5 h-3.5 text-rose-400 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{n.titre}</p>
                        <p className="text-xs text-muted-foreground">
                          {concurrent?.nom || '—'} · {n.dateNote} · {formatCreateur(n.createdByEmail)}
                        </p>
                      </div>
                    </Link>
                  );
                })}
                {concurrentNotes.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Aucune note récente</p>
                )}
              </div>
            </>
          )}
        </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}

// ── Onglet « Prévisionnel devis » : devis avec % réussite, montant et montant pondéré ──
function PrevisionnelDevis({ devis, clients, produits }: { devis: ReturnType<typeof useCRM>['devis']; clients: ReturnType<typeof useCRM>['clients']; produits: ReturnType<typeof useCRM>['produits'] }) {
  const [filterStatut, setFilterStatut] = useState<string>('encours');
  const [filterPeriode, setFilterPeriode] = useState<string>('tous');
  const [groupByMois, setGroupByMois] = useState(false);

  const now = new Date();
  const moisKey = (iso?: string) => iso ? iso.slice(0, 7) : ''; // YYYY-MM
  const moisLabel = (key: string) => key ? new Date(key + '-01T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : 'Sans date de réalisation';

  const rows = useMemo(() => devis
    .filter(d => {
      // Statut
      if (filterStatut === 'encours') { if (['refusé', 'archivé', 'système'].includes(d.statut)) return false; }
      else if (filterStatut !== 'tous') { if (d.statut !== filterStatut) return false; }
      // Période de réalisation
      if (filterPeriode !== 'tous') {
        if (!d.dateRealisation) return false;
        const dr = new Date(d.dateRealisation + 'T00:00:00');
        if (filterPeriode === 'mois' && (dr.getMonth() !== now.getMonth() || dr.getFullYear() !== now.getFullYear())) return false;
        if (filterPeriode === 'trimestre' && (Math.floor(dr.getMonth() / 3) !== Math.floor(now.getMonth() / 3) || dr.getFullYear() !== now.getFullYear())) return false;
        if (filterPeriode === 'annee' && dr.getFullYear() !== now.getFullYear()) return false;
        if (filterPeriode === 'avenir' && dr < new Date(now.getFullYear(), now.getMonth(), now.getDate())) return false;
      }
      return true;
    })
    .map(d => {
      const client = clients.find(c => c.id === d.clientId);
      const montant = calculerTotalDevis(d.lignes, d.fraisPortHT, d.fraisPortTVA).totalHT;
      // Total achat (marge) — même calcul que la colonne Marge de Devis
      const totalAchat = d.lignes.reduce((acc, l) => {
        if (l.type && l.type !== 'ligne') return acc;
        if (!l.produitId) return acc + (l.prixAchatLigne ?? 0) * l.quantite;
        const prod = produits.find(p => p.id === l.produitId);
        if (!prod) return acc;
        return acc + getPrixPourQuantite(prod, l.quantite).prixAchat * l.quantite * (1 - (l.remise || 0) / 100);
      }, 0);
      const totalHTLignes = calculerTotalDevis(d.lignes, 0, 0).totalHT;
      const marge = totalHTLignes - totalAchat;
      const proba = d.probabiliteReussite ?? 0;
      return { d, client, montant, proba, pondere: montant * proba / 100, marge, margePondere: marge * proba / 100 };
    })
    .sort((a, b) => groupByMois
      ? (moisKey(a.d.dateRealisation) || '9999').localeCompare(moisKey(b.d.dateRealisation) || '9999') || b.pondere - a.pondere
      : b.pondere - a.pondere),
    [devis, clients, produits, filterStatut, filterPeriode, groupByMois]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalMontant = rows.reduce((s, r) => s + r.montant, 0);
  const totalPondere = rows.reduce((s, r) => s + r.pondere, 0);
  const totalMargePondere = rows.reduce((s, r) => s + r.margePondere, 0);

  function exportPrev() {
    exportToExcel(rows.map(r => ({
      'N°': r.d.numero,
      Client: r.client?.societe || r.client?.nom || '',
      Statut: r.d.statut,
      'Réalisation': r.d.dateRealisation || '',
      '% réussite': r.proba,
      'Montant HT': r.montant,
      'Montant pondéré': Math.round(r.pondere * 100) / 100,
      'Marge HT': Math.round(r.marge * 100) / 100,
      'Marge pondérée': Math.round(r.margePondere * 100) / 100,
    })), 'previsionnel_devis', 'Prévisionnel');
  }

  // Regroupement par mois de réalisation
  const groups = useMemo(() => {
    if (!groupByMois) return null;
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = moisKey(r.d.dateRealisation);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.entries()].sort((a, b) => (a[0] || '9999').localeCompare(b[0] || '9999'));
  }, [rows, groupByMois]);

  const statutOptions = [
    { v: 'encours', label: 'En cours (hors refusé/archivé)' },
    { v: 'tous', label: 'Tous' },
    { v: 'brouillon', label: 'Brouillon' },
    { v: 'envoyé', label: 'Envoyé' },
    { v: 'accepté', label: 'Accepté' },
  ];

  const renderRow = ({ d, client, montant, proba, pondere, margePondere }: typeof rows[number]) => (
    <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-2.5"><Link to={`/devis?editDevis=${d.id}`} className="font-medium text-primary hover:underline">{d.numero}</Link></td>
      <td className="px-4 py-2.5 truncate max-w-[200px]">{client?.societe || client?.nom || '—'}</td>
      <td className="px-4 py-2.5"><span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{d.statut}</span></td>
      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{d.dateRealisation ? formatDate(d.dateRealisation) : '—'}</td>
      <td className="px-4 py-2.5 text-right">
        <span className={`font-medium ${proba >= 75 ? 'text-success' : proba >= 50 ? 'text-warning' : proba > 0 ? 'text-orange-500' : 'text-muted-foreground'}`}>{proba}%</span>
      </td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatMontant(montant)}</td>
      <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap text-primary">{formatMontant(pondere)}</td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap text-emerald-600 dark:text-emerald-400">{formatMontant(margePondere)}</td>
    </tr>
  );

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} className="text-sm rounded-md border border-input bg-background px-3 py-1.5">
          {statutOptions.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        <select value={filterPeriode} onChange={e => setFilterPeriode(e.target.value)} className="text-sm rounded-md border border-input bg-background px-3 py-1.5">
          <option value="tous">Toutes réalisations</option>
          <option value="mois">Réalisation ce mois</option>
          <option value="trimestre">Réalisation ce trimestre</option>
          <option value="annee">Réalisation cette année</option>
          <option value="avenir">Réalisation à venir</option>
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={groupByMois} onChange={e => setGroupByMois(e.target.checked)} className="rounded border-input accent-primary" />
          Grouper par mois de réalisation
        </label>
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportPrev} disabled={rows.length === 0}>
          <Upload className="w-4 h-4 mr-1 rotate-180" /> Excel
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-xs text-muted-foreground">Montant total</p>
          <p className="text-2xl font-heading font-bold">{formatMontant(totalMontant)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground">Montant pondéré (× % réussite)</p>
          <p className="text-2xl font-heading font-bold text-primary">{formatMontant(totalPondere)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground">Marge pondérée prévisionnelle</p>
          <p className="text-2xl font-heading font-bold text-emerald-600 dark:text-emerald-400">{formatMontant(totalMargePondere)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground">Devis suivis</p>
          <p className="text-2xl font-heading font-bold">{rows.length}</p>
        </div>
      </div>

      {/* Tableau */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">N°</th>
                <th className="text-left px-4 py-2 font-medium">Client</th>
                <th className="text-left px-4 py-2 font-medium">Statut</th>
                <th className="text-left px-4 py-2 font-medium">Réalisation</th>
                <th className="text-right px-4 py-2 font-medium">% réussite</th>
                <th className="text-right px-4 py-2 font-medium">Montant HT</th>
                <th className="text-right px-4 py-2 font-medium">Montant pondéré</th>
                <th className="text-right px-4 py-2 font-medium">Marge pondérée</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Aucun devis</td></tr>
              )}
              {groups
                ? groups.map(([key, gr]) => {
                    const gMontant = gr.reduce((s, r) => s + r.montant, 0);
                    const gPondere = gr.reduce((s, r) => s + r.pondere, 0);
                    const gMargeP = gr.reduce((s, r) => s + r.margePondere, 0);
                    return (
                      <Fragment key={key || 'sans-date'}>
                        <tr className="bg-muted/40 border-b border-border">
                          <td colSpan={5} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{moisLabel(key)} · {gr.length} devis</td>
                          <td className="px-4 py-1.5 text-right text-xs font-semibold">{formatMontant(gMontant)}</td>
                          <td className="px-4 py-1.5 text-right text-xs font-semibold text-primary">{formatMontant(gPondere)}</td>
                          <td className="px-4 py-1.5 text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400">{formatMontant(gMargeP)}</td>
                        </tr>
                        {gr.map(renderRow)}
                      </Fragment>
                    );
                  })
                : rows.map(renderRow)}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                  <td colSpan={5} className="px-4 py-2.5 text-right">Total</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatMontant(totalMontant)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-primary">{formatMontant(totalPondere)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-emerald-600 dark:text-emerald-400">{formatMontant(totalMargePondere)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
