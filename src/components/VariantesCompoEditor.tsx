import { Plus, Trash } from 'lucide-react';
import { Input } from '@/components/ui/input';
import ProduitCombobox from '@/components/ProduitCombobox';
import { designationProduit, formatMontant, generateId, type LigneKit, type Produit } from '@/lib/store';
import { prixVarianteCompo, type VarianteCompo } from '@/lib/variantesCompo';

/**
 * Les VARIANTES COMPOSÉES d'un article : chacune est une combinaison de
 * produits, proposée à la saisie de l'article dans un devis (avant les
 * options). Choisie, elle devient UNE ligne : « article de base — nom de la
 * variante », au prix de la somme de ses composants.
 */
interface Props {
  actif: boolean;
  onActif: (v: boolean) => void;
  variantes: VarianteCompo[];
  onChange: (fn: (prev: VarianteCompo[]) => VarianteCompo[]) => void;
  produits: Produit[];
}

const composantVide = (): LigneKit => ({ description: '', quantite: 1, unite: 'pièce', prixUnitaireHT: 0, remise: 0 });

export default function VariantesCompoEditor({ actif, onActif, variantes, onChange, produits }: Props) {
  const majVariante = (id: string, patch: Partial<VarianteCompo>) =>
    onChange(prev => prev.map(v => (v.id === id ? { ...v, ...patch } : v)));
  const majComposant = (id: string, idx: number, patch: Partial<LigneKit>) =>
    onChange(prev => prev.map(v => v.id !== id ? v : {
      ...v, composants: v.composants.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));

  return (
    <div className="border border-border rounded-lg bg-muted/30">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={actif} onChange={e => onActif(e.target.checked)} className="rounded border-border" />
          <span className="text-sm font-semibold">Variantes (combinaisons de produits)</span>
        </label>
        {actif && (
          <button
            type="button"
            onClick={() => onChange(prev => [...prev, { id: generateId(), nom: '', composants: [composantVide()] }])}
            className="text-xs text-primary hover:underline flex items-center gap-1 px-2 py-1 rounded border border-primary/30 hover:bg-primary/5 transition-colors"
          >
            <Plus className="w-3 h-3" /> Ajouter une variante
          </button>
        )}
      </div>
      <div className="p-3 space-y-3">
        {!actif && (
          <p className="text-xs text-muted-foreground">
            Cochez pour proposer des variantes à la saisie de l'article dans un devis : chacune est une combinaison de produits, sur une seule ligne.
          </p>
        )}
        {actif && variantes.length === 0 && (
          <p className="text-xs text-muted-foreground">Aucune variante — l'article se saisit tel quel.</p>
        )}
        {actif && variantes.map(v => (
          <div key={v.id} className="rounded-lg border border-border bg-background/60 p-2 space-y-2">
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-0.5 flex-1">
                <span className="text-xs text-muted-foreground">Nom de la variante (complète la désignation de l'article)</span>
                <Input value={v.nom} onChange={e => majVariante(v.id, { nom: e.target.value })} placeholder="Ex : avec primaire et finition" className="h-8 text-xs" />
              </div>
              <span className="text-xs text-muted-foreground pb-2">Total : <strong className="text-foreground">{formatMontant(prixVarianteCompo(v))} HT</strong></span>
              <button
                type="button" title="Supprimer cette variante"
                onClick={() => onChange(prev => prev.filter(x => x.id !== v.id))}
                className="p-1.5 hover:bg-destructive/10 rounded text-destructive mb-0.5"
              ><Trash className="w-3.5 h-3.5" /></button>
            </div>

            {v.composants.map((c, idx) => (
              <div key={idx} className="flex flex-wrap gap-1.5 items-end">
                <div className="flex flex-col gap-0.5 min-w-[200px] flex-1">
                  <span className="text-xs text-muted-foreground">Produit</span>
                  <ProduitCombobox
                    produits={produits.filter(p => !p.typeKit)}
                    value={c.produitId || ''}
                    onSelect={produitId => {
                      const p = produits.find(pr => pr.id === produitId);
                      majComposant(v.id, idx, {
                        produitId: produitId || undefined,
                        description: p ? designationProduit(p) : c.description,
                        unite: p ? p.unite : c.unite,
                        prixUnitaireHT: p ? p.prixHT : c.prixUnitaireHT,
                      });
                    }}
                  />
                </div>
                <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
                  <span className="text-xs text-muted-foreground">Description</span>
                  <Input value={c.description} onChange={e => majComposant(v.id, idx, { description: e.target.value })} className="text-xs h-7" />
                </div>
                <div className="flex flex-col gap-0.5 w-14">
                  <span className="text-xs text-muted-foreground">Qté</span>
                  <Input type="number" min={0.01} step={0.01} value={c.quantite}
                    onChange={e => majComposant(v.id, idx, { quantite: parseFloat(e.target.value) || 1 })} className="text-xs h-7" />
                </div>
                <div className="flex flex-col gap-0.5 w-16">
                  <span className="text-xs text-muted-foreground">Unité</span>
                  <Input value={c.unite} onChange={e => majComposant(v.id, idx, { unite: e.target.value })} className="text-xs h-7" />
                </div>
                <div className="flex flex-col gap-0.5 w-20">
                  <span className="text-xs text-muted-foreground">Prix HT</span>
                  <Input type="number" min={0} step={0.01} value={c.prixUnitaireHT}
                    onChange={e => majComposant(v.id, idx, { prixUnitaireHT: parseFloat(e.target.value) || 0 })} className="text-xs h-7" />
                </div>
                <div className="flex flex-col gap-0.5 w-14">
                  <span className="text-xs text-muted-foreground">Rem%</span>
                  <Input type="number" min={0} max={100} step={1} value={c.remise}
                    onChange={e => majComposant(v.id, idx, { remise: parseFloat(e.target.value) || 0 })} className="text-xs h-7" />
                </div>
                <button
                  type="button" title="Retirer ce composant"
                  onClick={() => majVariante(v.id, { composants: v.composants.filter((_, i) => i !== idx) })}
                  className="p-1 hover:bg-destructive/10 rounded text-destructive"
                ><Trash className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => majVariante(v.id, { composants: [...v.composants, composantVide()] })}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            ><Plus className="w-3 h-3" /> Ajouter un composant</button>
          </div>
        ))}
      </div>
    </div>
  );
}
