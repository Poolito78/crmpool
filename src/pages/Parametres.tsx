import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutDashboard, Eye, EyeOff, RotateCcw, Warehouse, Plus, Edit2, Trash2, MapPin, Star, FileText, LayoutList, Table2, BarChart3, ShieldCheck, ExternalLink } from 'lucide-react';
import VeilleCorrectionPanel from '@/components/VeilleCorrectionPanel';
import VeilleDisplayName from '@/components/VeilleDisplayName';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useEntrepots, type Entrepot } from '@/lib/store';
import { DEVIS_TABLE_COLS_DEF, DEFAULT_DEVIS_TABLE_COLS, type DevisTableColKey } from '@/lib/devisTableConfig';
import {
  DASHBOARD_TILES,
  type DashboardTileDef,
  useHiddenTiles,
  toggleTile,
  setHiddenTiles,
  showAllTiles,
} from '@/lib/dashboardSettings';

export default function Parametres() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'dashboard';
  const setActiveTab = (t: string) => setSearchParams(t === 'dashboard' ? {} : { tab: t }, { replace: true });
  const hidden = useHiddenTiles();
  const { entrepots, loading: loadingE, addEntrepot, updateEntrepot, deleteEntrepot } = useEntrepots();

  // ── Paramètres Devis ─────────────────────────────────────────────────────────
  const [devisView, setDevisViewState] = useState<'liste' | 'tableau'>(() => {
    try { return (localStorage.getItem('devis_view') as 'liste' | 'tableau') || 'liste'; } catch { return 'liste'; }
  });
  function setDevisView(v: 'liste' | 'tableau') {
    setDevisViewState(v);
    try { localStorage.setItem('devis_view', v); } catch {}
  }
  const [visDevisTableCols, setVisDevisTableColsState] = useState<Set<DevisTableColKey>>(() => {
    try {
      const s = localStorage.getItem('devis_table_cols');
      if (s) { const p = JSON.parse(s) as DevisTableColKey[]; if (Array.isArray(p) && p.length > 0) return new Set(p); }
    } catch {}
    return new Set(DEFAULT_DEVIS_TABLE_COLS);
  });
  function toggleDevisTableCol(k: DevisTableColKey) {
    setVisDevisTableColsState(prev => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      try { localStorage.setItem('devis_table_cols', JSON.stringify([...n])); } catch {}
      return n;
    });
  }
  function resetDevisTableCols() {
    const s = new Set(DEFAULT_DEVIS_TABLE_COLS);
    setVisDevisTableColsState(s);
    try { localStorage.setItem('devis_table_cols', JSON.stringify([...s])); } catch {}
  }

  // ── État dialog entrepôt ────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntrepot, setEditingEntrepot] = useState<Entrepot | null>(null);
  const [form, setForm] = useState({ nom: '', adresse: '', ville: '', codePostal: '', notes: '', estDefaut: false });
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditingEntrepot(null);
    setForm({ nom: '', adresse: '', ville: '', codePostal: '', notes: '', estDefaut: false });
    setDialogOpen(true);
  }

  function openEdit(e: Entrepot) {
    setEditingEntrepot(e);
    setForm({ nom: e.nom, adresse: e.adresse || '', ville: e.ville || '', codePostal: e.codePostal || '', notes: e.notes || '', estDefaut: e.estDefaut });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.nom.trim()) { toast.error('Le nom est requis'); return; }
    setSaving(true);
    if (editingEntrepot) {
      const err = await updateEntrepot({
        ...editingEntrepot, ...form,
        adresse: form.adresse || undefined, ville: form.ville || undefined,
        codePostal: form.codePostal || undefined, notes: form.notes || undefined,
      });
      if (err) { toast.error('Erreur : ' + err.message); setSaving(false); return; }
      toast.success('Entrepôt modifié');
    } else {
      const res = await addEntrepot({
        ...form,
        adresse: form.adresse || undefined, ville: form.ville || undefined,
        codePostal: form.codePostal || undefined, notes: form.notes || undefined,
      });
      if (!res) { toast.error('Erreur lors de la création'); setSaving(false); return; }
      toast.success('Entrepôt créé');
    }
    setSaving(false);
    setDialogOpen(false);
  }

  async function handleDelete(e: Entrepot) {
    if (!confirm(`Supprimer l'entrepôt "${e.nom}" ?`)) return;
    const err = await deleteEntrepot(e.id);
    if (err) { toast.error('Erreur : ' + err.message); return; }
    toast.success('Entrepôt supprimé');
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────
  const groups = DASHBOARD_TILES.reduce<Record<string, DashboardTileDef[]>>((acc, t) => {
    (acc[t.group] ||= []).push(t);
    return acc;
  }, {});
  const groupOrder = ['Indicateurs', 'Alertes', 'Encours fin de mois', 'Panneaux'];
  const visibleCount = DASHBOARD_TILES.length - hidden.size;

  return (
    <div className="max-w-3xl mx-auto">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto justify-start">
          <TabsTrigger value="dashboard">Tableau de bord</TabsTrigger>
          <TabsTrigger value="entrepots">Entrepôts</TabsTrigger>
          <TabsTrigger value="devis">Devis</TabsTrigger>
          <TabsTrigger value="veille">Veille Concurrence</TabsTrigger>
          <TabsTrigger value="administration">Administration</TabsTrigger>
        </TabsList>

        <TabsContent value="entrepots" className="space-y-6 mt-4">
      {/* ══ Section Entrepôts ════════════════════════════════════════════════ */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
              <Warehouse className="w-5 h-5 text-primary" />
              Entrepôts de stockage
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gérez vos entrepôts pour répartir et suivre vos stocks par emplacement.
            </p>
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1.5" /> Nouvel entrepôt
          </Button>
        </div>

        {loadingE ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : entrepots.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-8 text-center">
            <Warehouse className="w-9 h-9 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Aucun entrepôt configuré.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={openNew}>
              <Plus className="w-4 h-4 mr-1.5" /> Créer le premier entrepôt
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {entrepots.map(e => (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                {/* Icône */}
                <Warehouse className="w-4 h-4 text-primary shrink-0" />

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm flex items-center gap-2">
                    {e.nom}
                    {e.estDefaut && (
                      <span className="inline-flex items-center gap-0.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                        <Star className="w-2.5 h-2.5" /> Défaut
                      </span>
                    )}
                  </p>
                  {(e.ville || e.adresse) && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {[e.adresse, e.codePostal, e.ville].filter(Boolean).join(' ')}
                    </p>
                  )}
                  {e.notes && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5 italic truncate">{e.notes}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(e)}
                    title="Modifier"
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(e)}
                    title="Supprimer"
                    className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
        </TabsContent>

        <TabsContent value="devis" className="space-y-6 mt-4">
      {/* ══ Section Devis ════════════════════════════════════════════════════ */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div>
          <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Devis
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Vue par défaut et colonnes visibles en mode tableau.</p>
        </div>

        {/* Vue par défaut */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Vue par défaut</p>
          <div className="flex gap-2">
            <button
              onClick={() => setDevisView('liste')}
              className={cn('flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all', devisView === 'liste' ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:border-primary/50')}
            >
              <LayoutList className="w-4 h-4" /> Liste (cartes)
            </button>
            <button
              onClick={() => setDevisView('tableau')}
              className={cn('flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all', devisView === 'tableau' ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:border-primary/50')}
            >
              <Table2 className="w-4 h-4" /> Tableau (colonnes)
            </button>
          </div>
        </div>

        {/* Colonnes du tableau */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Colonnes du tableau</p>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={resetDevisTableCols}>
              <RotateCcw className="w-3 h-3 mr-1" /> Réinitialiser
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {DEVIS_TABLE_COLS_DEF.map(col => {
              const visible = visDevisTableCols.has(col.key);
              return (
                <label key={col.key} htmlFor={`dc-${col.key}`} className="flex items-center gap-2.5 py-2 px-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                  <Switch id={`dc-${col.key}`} checked={visible} onCheckedChange={() => toggleDevisTableCol(col.key)} />
                  <span className={`text-sm ${visible ? '' : 'text-muted-foreground'}`}>{col.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
        </TabsContent>

        <TabsContent value="veille" className="space-y-6 mt-4">
      {/* ══ Section Veille Concurrence ═══════════════════════════════════════ */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div>
          <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" /> Veille Concurrence
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Corrigez globalement les catégories et les noms d'informateurs : renommer une valeur l'applique sur <strong>tous</strong> les produits concernés (corrige fautes et variantes).
          </p>
        </div>
        <VeilleDisplayName />
        <div className="border-t border-border pt-4">
          <VeilleCorrectionPanel />
        </div>
      </div>
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-6 mt-4">
      {/* ══ Section Tableau de bord ══════════════════════════════════════════ */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-primary" />
            Tableau de bord
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setHiddenTiles(DASHBOARD_TILES.map(t => t.id))}>
              <EyeOff className="w-4 h-4 mr-1.5" /> Tout masquer
            </Button>
            <Button variant="outline" size="sm" onClick={showAllTiles}>
              <RotateCcw className="w-4 h-4 mr-1.5" /> Tout afficher
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Choisissez les tuiles à afficher sur le tableau de bord.{' '}
          <span className="font-medium text-foreground">{visibleCount}</span> / {DASHBOARD_TILES.length} visibles.
        </p>
      </div>

      {/* Groupes de tuiles */}
      {groupOrder.filter(g => groups[g]).map(group => (
        <div key={group} className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{group}</h3>
          <div className="space-y-1">
            {groups[group].map(tile => {
              const visible = !hidden.has(tile.id);
              return (
                <label
                  key={tile.id}
                  htmlFor={`tile-${tile.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-2.5 text-sm">
                    {visible
                      ? <Eye className="w-4 h-4 text-primary shrink-0" />
                      : <EyeOff className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <span className={visible ? '' : 'text-muted-foreground'}>{tile.label}</span>
                  </span>
                  <Switch
                    id={`tile-${tile.id}`}
                    checked={visible}
                    onCheckedChange={() => toggleTile(tile.id)}
                  />
                </label>
              );
            })}
          </div>
        </div>
      ))}
        </TabsContent>
        <TabsContent value="administration" className="space-y-4 mt-4">
          <div className="bg-card rounded-xl border border-border p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary" /> Administration Veille
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Gérez les utilisateurs et les accès CRM depuis le panel d'administration de l'application Veille.
                </p>
              </div>
              <a
                href="https://veille-alpha.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Ouvrir dans un nouvel onglet
              </a>
            </div>
          </div>
          <div className="rounded-xl border border-border overflow-hidden" style={{ height: 'calc(100vh - 260px)' }}>
            <iframe
              src="https://veille-alpha.vercel.app"
              className="w-full h-full"
              title="Administration Veille"
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* ══ Dialog créer / modifier entrepôt ════════════════════════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingEntrepot ? 'Modifier l\'entrepôt' : 'Nouvel entrepôt'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>Nom *</Label>
              <Input
                value={form.nom}
                onChange={e => setForm(p => ({ ...p, nom: e.target.value }))}
                placeholder="Ex : Entrepôt principal"
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            </div>
            <div>
              <Label>Adresse</Label>
              <Input
                value={form.adresse}
                onChange={e => setForm(p => ({ ...p, adresse: e.target.value }))}
                placeholder="Rue, numéro…"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label>Ville</Label>
                <Input
                  value={form.ville}
                  onChange={e => setForm(p => ({ ...p, ville: e.target.value }))}
                />
              </div>
              <div>
                <Label>Code postal</Label>
                <Input
                  value={form.codePostal}
                  onChange={e => setForm(p => ({ ...p, codePostal: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Informations complémentaires…"
              />
            </div>
            <label className={cn('flex items-center gap-2.5 cursor-pointer select-none rounded-lg px-3 py-2.5 border transition-colors', form.estDefaut ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50')}>
              <input
                type="checkbox"
                checked={form.estDefaut}
                onChange={e => setForm(p => ({ ...p, estDefaut: e.target.checked }))}
                className="rounded accent-primary"
              />
              <span className="text-sm">
                <span className="font-medium">Entrepôt par défaut</span>
                <span className="block text-xs text-muted-foreground">Sélectionné automatiquement dans Stock</span>
              </span>
            </label>
          </div>
          <div className="flex justify-between gap-2 pt-2">
            {editingEntrepot && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => { handleDelete(editingEntrepot); setDialogOpen(false); }}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Supprimer
              </Button>
            )}
            <div className={cn('flex gap-2', !editingEntrepot && 'ml-auto')}>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Annuler</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Enregistrement…' : editingEntrepot ? 'Modifier' : 'Créer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
