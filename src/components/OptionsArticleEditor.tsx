import { Plus, Trash } from 'lucide-react';
import { Input } from '@/components/ui/input';
import ProduitCombobox from '@/components/ProduitCombobox';
import { designationProduit, type LigneKit, type Produit } from '@/lib/store';

/**
 * Les OPTIONS d'un article : des produits proposés quand l'article est saisi
 * dans un devis. À la différence d'un kit, rien n'est inséré d'office — le
 * devis ouvre une liste à cocher (voir `OptionsArticleDialog`).
 */
interface Props {
  actif: boolean;
  onActif: (v: boolean) => void;
  lignes: LigneKit[];
  onChange: (fn: (prev: LigneKit[]) => LigneKit[]) => void;
  produits: Produit[];
}

const vide = (): LigneKit => ({ description: '', quantite: 1, unite: 'pièce', prixUnitaireHT: 0, remise: 0 });

export default function OptionsArticleEditor({ actif, onActif, lignes, onChange, produits }: Props) {
  const maj = (idx: number, patch: Partial<LigneKit>) =>
    onChange(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  return (
    <div className="border border-border rounded-lg bg-muted/30">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={actif} onChange={e => onActif(e.target.checked)} className="rounded border-border" />
          <span className="text-sm font-semibold">Options (produits proposés en option)</span>
        </label>
        {actif && (
          <button
            type="button"
            onClick={() => onChange(prev => [...prev, vide()])}
            className="text-xs text-primary hover:underline flex items-center gap-1 px-2 py-1 rounded border border-primary/30 hover:bg-primary/5 transition-colors"
          >
            <Plus className="w-3 h-3" /> Ajouter une option
          </button>
        )}
      </div>
      <div className="p-3 space-y-3">
        {!actif && (
          <p className="text-xs text-muted-foreground">
            Cochez pour proposer des produits en option : à la saisie de l'article dans un devis, ils sont proposés à cocher.
          </p>
        )}
        {actif && lignes.length === 0 && (
          <p className="text-xs text-muted-foreground">Aucune option — rien ne sera proposé dans le devis.</p>
        )}
        {actif && lignes.map((lk, idx) => (
          <div key={idx} className="flex flex-wrap gap-1.5 items-end rounded-lg p-1">
            <div className="flex flex-col gap-0.5 min-w-[200px] flex-1">
              <span className="text-xs text-muted-foreground">Produit</span>
              <ProduitCombobox
                produits={produits.filter(p => !p.typeKit)}
                value={lk.produitId || ''}
                onSelect={produitId => {
                  const p = produits.find(pr => pr.id === produitId);
                  maj(idx, {
                    produitId: produitId || undefined,
                    description: p ? designationProduit(p) : lk.description,
                    unite: p ? p.unite : lk.unite,
                    prixUnitaireHT: p ? p.prixHT : lk.prixUnitaireHT,
                    consommation: p?.consommation ?? lk.consommation,
                  });
                }}
              />
            </div>
            <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
              <span className="text-xs text-muted-foreground">Description</span>
              <Input value={lk.description} onChange={e => maj(idx, { description: e.target.value })} placeholder="Description…" className="text-xs h-7" />
            </div>
            <div className="flex flex-col gap-0.5 w-14">
              <span className="text-xs text-muted-foreground">Qté</span>
              <Input type="number" min={0.01} step={0.01} value={lk.quantite}
                onChange={e => maj(idx, { quantite: parseFloat(e.target.value) || 1 })} className="text-xs h-7" />
            </div>
            <div className="flex flex-col gap-0.5 w-16">
              <span className="text-xs text-muted-foreground">Unité</span>
              <Input value={lk.unite} onChange={e => maj(idx, { unite: e.target.value })} className="text-xs h-7" />
            </div>
            <div className="flex flex-col gap-0.5 w-20">
              <span className="text-xs text-muted-foreground">Prix HT</span>
              <Input type="number" min={0} step={0.01} value={lk.prixUnitaireHT}
                onChange={e => maj(idx, { prixUnitaireHT: parseFloat(e.target.value) || 0 })} className="text-xs h-7" />
            </div>
            <div className="flex flex-col gap-0.5 w-14">
              <span className="text-xs text-muted-foreground">Rem%</span>
              <Input type="number" min={0} max={100} step={1} value={lk.remise}
                onChange={e => maj(idx, { remise: parseFloat(e.target.value) || 0 })} className="text-xs h-7" />
            </div>
            <button
              type="button"
              onClick={() => onChange(prev => prev.filter((_, i) => i !== idx))}
              className="p-1 hover:bg-destructive/10 rounded text-destructive"
              title="Supprimer cette option"
            >
              <Trash className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
