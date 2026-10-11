import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatMontant, type LigneKit, type Produit } from '@/lib/store';

/**
 * Les options de l'article qu'on vient de saisir dans un devis : à cocher.
 * Rien n'est coché d'office — une option est un choix du client, pas une
 * ligne du devis. Les lignes cochées sont insérées sous l'article.
 */
interface Props {
  produit: Produit | null;
  onConfirm: (choisies: LigneKit[]) => void;
  onCancel: () => void;
}

export default function OptionsArticleDialog({ produit, onConfirm, onCancel }: Props) {
  const options = produit?.lignesOptions ?? [];
  const [cochees, setCochees] = useState<Set<number>>(new Set());
  /* Le mode de chaque option : celui de la fiche article, modifiable ici. */
  const [inclus, setInclus] = useState<Set<number>>(new Set());
  useEffect(() => {
    setCochees(new Set());
    setInclus(new Set((produit?.lignesOptions ?? []).flatMap((o, i) => (o.inclusALaLigne ? [i] : []))));
  }, [produit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const bascule = (i: number) =>
    setCochees(prev => { const s = new Set(prev); if (s.has(i)) s.delete(i); else s.add(i); return s; });

  return (
    <Dialog open={!!produit} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Options proposées — {produit?.reference}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
          {options.map((o, i) => (
            <label key={i} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-muted/50">
              <input type="checkbox" checked={cochees.has(i)} onChange={() => bascule(i)} className="rounded" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{o.description || 'Option'}</span>
                <span className="block text-xs text-muted-foreground">
                  {inclus.has(i) ? 'incluse à la ligne, non chiffrée' : `${o.quantite} ${o.unite} · ${formatMontant(o.prixUnitaireHT)} HT${o.remise ? ` · remise ${o.remise} %` : ''}`}
                </span>
              </span>
              {cochees.has(i) && (
                <button
                  type="button"
                  onClick={e => { e.preventDefault(); setInclus(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; }); }}
                  className="text-[11px] rounded-full border border-primary/40 bg-primary/10 text-primary px-2 py-0.5 shrink-0"
                  title="Basculer entre ligne en plus (chiffrée) et incluse à la ligne (non chiffrée)"
                >{inclus.has(i) ? 'Incluse' : 'Ligne en plus'}</button>
              )}
            </label>
          ))}
        </div>
        <div className="flex justify-between gap-2 pt-1">
          <Button variant="outline" onClick={onCancel}>Sans option</Button>
          <Button onClick={() => onConfirm(options.flatMap((o, i) => (cochees.has(i) ? [{ ...o, inclusALaLigne: inclus.has(i) ? true : undefined }] : [])))} disabled={cochees.size === 0}>
            Ajouter {cochees.size > 0 ? `${cochees.size} option${cochees.size > 1 ? 's' : ''}` : 'les options'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
