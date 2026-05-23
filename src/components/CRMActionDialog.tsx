import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, TrendingDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  CrmAction, CrmActionConcurrent, TypeCrmAction, StatutCrmAction, PrioriteCrmAction,
  TYPE_CRM_ACTION, STATUT_CRM_ACTION, Client,
} from '@/lib/store';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  action?: CrmAction | null;
  clients: Client[];
  produits?: { id: string; reference: string; description: string }[];
  defaultClientId?: string;
  defaultDevisId?: string;
  onSave: (a: Omit<CrmAction, 'id' | 'createdAt'>) => Promise<any>;
}

const TYPES: TypeCrmAction[] = ['visite', 'appel', 'email', 'tache', 'rdv'];
const PRIORITES: { value: PrioriteCrmAction; label: string; color: string }[] = [
  { value: 'basse',   label: 'Basse',   color: 'bg-muted text-muted-foreground' },
  { value: 'normale', label: 'Normale', color: 'bg-info/10 text-info' },
  { value: 'haute',   label: 'Haute',   color: 'bg-destructive/10 text-destructive' },
];
const STATUTS: StatutCrmAction[] = ['planifiee', 'realisee', 'annulee'];

// Types for which competitor info is especially relevant
const TYPES_AVEC_CONCURRENTS: TypeCrmAction[] = ['visite', 'appel', 'rdv'];

const empty = (): Omit<CrmAction, 'id' | 'createdAt'> => ({
  type: 'tache',
  titre: '',
  description: '',
  datePlanifiee: new Date().toISOString().split('T')[0],
  dateRealisee: undefined,
  statut: 'planifiee',
  priorite: 'normale',
  clientId: undefined,
  devisId: undefined,
  concurrents: undefined,
});

export default function CRMActionDialog({ open, onOpenChange, action, clients, produits = [], defaultClientId, defaultDevisId, onSave }: Props) {
  const [form, setForm] = useState<Omit<CrmAction, 'id' | 'createdAt'>>(empty());
  const [saving, setSaving] = useState(false);
  const [concurrentsOpen, setConcurrentsOpen] = useState(false);

  useEffect(() => {
    if (open) {
      if (action) {
        const { id, createdAt, ...rest } = action;
        setForm(rest);
        setConcurrentsOpen(!!(rest.concurrents && rest.concurrents.length > 0));
      } else {
        const initial = { ...empty(), clientId: defaultClientId, devisId: defaultDevisId };
        setForm(initial);
        // Auto-open concurrents section for visit/call/rdv types
        setConcurrentsOpen(TYPES_AVEC_CONCURRENTS.includes(initial.type));
      }
    }
  }, [open, action, defaultClientId, defaultDevisId]);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
    // Auto-open concurrents section when switching to relevant type
    if (k === 'type' && TYPES_AVEC_CONCURRENTS.includes(v as TypeCrmAction)) {
      setConcurrentsOpen(true);
    }
  }

  function addConcurrent() {
    setForm(prev => ({
      ...prev,
      concurrents: [...(prev.concurrents || []), { nomConcurrent: '', produitRef: '', tarif: undefined, delai: undefined, note: '' }],
    }));
  }

  function updateConcurrent(idx: number, patch: Partial<CrmActionConcurrent>) {
    setForm(prev => ({
      ...prev,
      concurrents: (prev.concurrents || []).map((c, i) => i === idx ? { ...c, ...patch } : c),
    }));
  }

  function removeConcurrent(idx: number) {
    setForm(prev => ({
      ...prev,
      concurrents: (prev.concurrents || []).filter((_, i) => i !== idx),
    }));
  }

  async function handleSave() {
    if (!form.titre.trim()) return;
    setSaving(true);
    // Clean empty concurrents
    const cleaned = {
      ...form,
      concurrents: form.concurrents?.filter(c => c.nomConcurrent?.trim()) || undefined,
    };
    await onSave(cleaned);
    setSaving(false);
    onOpenChange(false);
  }

  const hasConcurrents = (form.concurrents?.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{action ? 'Modifier l\'action' : 'Nouvelle action commerciale'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground mb-2 block">Type</Label>
            <div className="flex flex-wrap gap-2">
              {TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => set('type', t)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                    form.type === t
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  <span>{TYPE_CRM_ACTION[t].icon}</span>
                  {TYPE_CRM_ACTION[t].label}
                </button>
              ))}
            </div>
          </div>

          {/* Titre */}
          <div>
            <Label htmlFor="titre" className="text-xs font-semibold text-muted-foreground">Titre *</Label>
            <Input
              id="titre"
              value={form.titre}
              onChange={e => set('titre', e.target.value)}
              placeholder="Objet de l'action..."
              className="mt-1"
              autoFocus
            />
          </div>

          {/* Client */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Client / Prospect</Label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-9"
              value={form.clientId || ''}
              onChange={e => set('clientId', e.target.value || undefined)}
            >
              <option value="">— Aucun client —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.societe || c.nom}</option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Date planifiée</Label>
              <Input
                type="date"
                value={form.datePlanifiee || ''}
                onChange={e => set('datePlanifiee', e.target.value || undefined)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Date réalisée</Label>
              <Input
                type="date"
                value={form.dateRealisee || ''}
                onChange={e => set('dateRealisee', e.target.value || undefined)}
                className="mt-1"
              />
            </div>
          </div>

          {/* Statut + Priorité */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground mb-2 block">Statut</Label>
              <div className="flex flex-col gap-1.5">
                {STATUTS.map(s => (
                  <button
                    key={s}
                    onClick={() => set('statut', s)}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all text-left',
                      form.statut === s
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    <span className={cn('w-2 h-2 rounded-full', {
                      'bg-info': s === 'planifiee',
                      'bg-emerald-500': s === 'realisee',
                      'bg-muted-foreground': s === 'annulee',
                    })} />
                    {STATUT_CRM_ACTION[s].label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground mb-2 block">Priorité</Label>
              <div className="flex flex-col gap-1.5">
                {PRIORITES.map(p => (
                  <button
                    key={p.value}
                    onClick={() => set('priorite', p.value)}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all text-left',
                      form.priorite === p.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    <span className={cn('w-2 h-2 rounded-full', {
                      'bg-muted-foreground': p.value === 'basse',
                      'bg-info': p.value === 'normale',
                      'bg-destructive': p.value === 'haute',
                    })} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Description / Notes</Label>
            <Textarea
              value={form.description || ''}
              onChange={e => set('description', e.target.value || undefined)}
              placeholder="Détails de l'action..."
              rows={3}
              className="mt-1 text-sm resize-none"
            />
          </div>

          {/* ── Infos concurrence ──────────────────────────────────────── */}
          <div className="border border-border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setConcurrentsOpen(v => !v)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/30 transition-colors',
                concurrentsOpen ? 'bg-muted/20' : ''
              )}
            >
              <span className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-muted-foreground" />
                Infos concurrence
                {hasConcurrents && (
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                    {form.concurrents!.filter(c => c.nomConcurrent?.trim()).length}
                  </span>
                )}
              </span>
              {concurrentsOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {concurrentsOpen && (
              <div className="px-3 pb-3 pt-2 space-y-2 border-t border-border bg-muted/5">
                <p className="text-xs text-muted-foreground">
                  Renseignez les tarifs et délais observés chez la concurrence lors de cette action.
                </p>

                {(form.concurrents || []).map((c, i) => (
                  <div key={i} className="rounded-md border border-border bg-background p-2 space-y-2">
                    <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                      <Input
                        placeholder="Nom du concurrent *"
                        value={c.nomConcurrent || ''}
                        onChange={e => updateConcurrent(i, { nomConcurrent: e.target.value })}
                        className="h-8 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeConcurrent(i)}
                        className="p-1.5 hover:text-destructive text-muted-foreground"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {produits.length > 0 ? (
                        <select
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm col-span-1"
                          value={c.produitRef || ''}
                          onChange={e => updateConcurrent(i, { produitRef: e.target.value || undefined })}
                        >
                          <option value="">Produit…</option>
                          {produits.map(p => (
                            <option key={p.id} value={p.reference}>{p.reference} — {p.description}</option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          placeholder="Produit / Réf."
                          value={c.produitRef || ''}
                          onChange={e => updateConcurrent(i, { produitRef: e.target.value || undefined })}
                          className="h-8 text-sm"
                        />
                      )}
                      <Input
                        placeholder="Tarif €"
                        type="number"
                        value={c.tarif ?? ''}
                        onChange={e => updateConcurrent(i, { tarif: e.target.value ? Number(e.target.value) : undefined })}
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder="Délai (j)"
                        type="number"
                        value={c.delai ?? ''}
                        onChange={e => updateConcurrent(i, { delai: e.target.value ? Number(e.target.value) : undefined })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <Input
                      placeholder="Note (optionnel)..."
                      value={c.note || ''}
                      onChange={e => updateConcurrent(i, { note: e.target.value || undefined })}
                      className="h-7 text-xs"
                    />
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addConcurrent}
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <Plus className="w-3 h-3" /> Ajouter un concurrent
                </button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving || !form.titre.trim()}>
            {saving ? 'Enregistrement…' : (action ? 'Modifier' : 'Créer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
