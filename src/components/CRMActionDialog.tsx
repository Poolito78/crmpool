import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CrmAction, TypeCrmAction, StatutCrmAction, PrioriteCrmAction,
  TYPE_CRM_ACTION, STATUT_CRM_ACTION, Client,
} from '@/lib/store';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  action?: CrmAction | null;
  clients: Client[];
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
});

export default function CRMActionDialog({ open, onOpenChange, action, clients, defaultClientId, defaultDevisId, onSave }: Props) {
  const [form, setForm] = useState<Omit<CrmAction, 'id' | 'createdAt'>>(empty());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (action) {
        const { id, createdAt, ...rest } = action;
        setForm(rest);
      } else {
        setForm({ ...empty(), clientId: defaultClientId, devisId: defaultDevisId });
      }
    }
  }, [open, action, defaultClientId, defaultDevisId]);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function handleSave() {
    if (!form.titre.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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
