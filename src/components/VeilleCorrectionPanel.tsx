import { useState } from 'react';
import { Check, X, Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useConcurrents } from '@/lib/concurrents';

// Correction globale des catégories / informateurs de la Veille Concurrence.
// Renomme une valeur sur TOUS les produits concernés (corrige fautes/variantes).
// Affiché dans Paramètres.
export default function VeilleCorrectionPanel() {
  const { produits, updateProduit, loading } = useConcurrents();

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <RenameGroup
        title="Catégories"
        values={[...new Set(produits.map(p => p.categorie).filter(Boolean) as string[])].sort()}
        count={(v) => produits.filter(p => p.categorie === v).length}
        onRename={async (oldV, newV) => {
          const targets = produits.filter(p => p.categorie === oldV);
          for (const p of targets) await updateProduit({ ...p, categorie: newV || undefined });
          toast.success(`${targets.length} produit(s) — catégorie « ${oldV} » → « ${newV} »`);
        }}
      />
      <RenameGroup
        title="Informateurs (saisi par)"
        values={[...new Set(produits.map(p => p.informateur).filter(Boolean) as string[])].sort()}
        count={(v) => produits.filter(p => p.informateur === v).length}
        onRename={async (oldV, newV) => {
          const targets = produits.filter(p => p.informateur === oldV);
          for (const p of targets) await updateProduit({ ...p, informateur: newV || undefined });
          toast.success(`${targets.length} produit(s) — informateur « ${oldV} » → « ${newV} »`);
        }}
      />
    </div>
  );
}

// ── Sous-composant : renommage global d'une valeur (catégorie / informateur) ──
function RenameGroup({ title, values, count, onRename }: {
  title: string;
  values: string[];
  count: (v: string) => number;
  onRename: (oldV: string, newV: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{title}</p>
      {values.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune valeur.</p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {values.map(v => (
            <div key={v} className="flex items-center gap-2 text-sm">
              {editing === v ? (
                <>
                  <Input value={val} onChange={e => setVal(e.target.value)} className="h-7 text-sm flex-1" autoFocus onKeyDown={e => { if (e.key === 'Escape') setEditing(null); }} />
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" disabled={busy || !val.trim() || val.trim() === v} onClick={async () => { setBusy(true); await onRename(v, val.trim()); setBusy(false); setEditing(null); }} title="Appliquer">
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => setEditing(null)} title="Annuler"><X className="w-3.5 h-3.5" /></Button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate">{v}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{count(v)}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { setEditing(v); setVal(v); }} title="Renommer"><Pencil className="w-3.5 h-3.5" /></Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
