import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import VarianteSelect from '@/components/VarianteSelect';
import { designationProduit, type Produit } from '@/lib/store';
import type { DimensionDeComposant } from '@/lib/variantesCompo';

/**
 * Teinte (ou autre dimension) d'un COMPOSANT de la variante retenue — le
 * pigment d'un kit 319R —, demandée après la variante et avant les options.
 *
 * Rien n'est choisi d'office : « Plus tard » laisse la ligne sans teinte
 * plutôt que de lui inventer la première des 220 (on ne devine pas une donnée
 * métier). La teinte se reprend ensuite sur la ligne.
 */
interface Props {
  ouvert: boolean;
  /** Désignation de l'article de la ligne, pour le titre. */
  article: string;
  groupes: DimensionDeComposant<Produit>[];
  /** Choix déjà portés par la ligne (dimension → libellé). */
  valeurs: Record<string, string>;
  onValider: (choix: Record<string, string>) => void;
  onPlusTard: () => void;
}

export default function TeintesCompoDialog({ ouvert, article, groupes, valeurs, onValider, onPlusTard }: Props) {
  // Un choix par groupe (par nom de dimension), appliqué à chacune de ses dimensions.
  const [choix, setChoix] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!ouvert) return;
    setChoix(Object.fromEntries(groupes.flatMap(g => {
      const deja = g.dimensions.map(d => valeurs[d.id]).find(Boolean);
      return deja ? [[g.nom, deja]] : [];
    })));
  }, [ouvert]); // eslint-disable-line react-hooks/exhaustive-deps

  const complet = groupes.every(g => choix[g.nom]);

  return (
    <Dialog open={ouvert} onOpenChange={o => { if (!o) onPlusTard(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Teinte — {article}</DialogTitle>
          <p className="text-xs text-muted-foreground">La variante retenue contient un composant à choisir avant les options.</p>
        </DialogHeader>
        <div className="space-y-3">
          {groupes.map(g => (
            <div key={g.nom} className="space-y-1">
              <div className="text-xs text-muted-foreground">
                {g.nom} <span className="opacity-70">— {g.produits.map(p => designationProduit(p)).join(', ')}</span>
              </div>
              {/* Les libellés sont les mêmes d'un pigment à l'autre : la première dimension sert de liste. */}
              <VarianteSelect
                dimension={g.dimensions[0]}
                value={choix[g.nom] ?? ''}
                vide="— à choisir —"
                onChange={label => setChoix(prev => ({ ...prev, [g.nom]: label }))}
              />
              {!choix[g.nom] && <p className="text-[11px] text-amber-600">À choisir — tapez les premiers chiffres du RAL dans la liste.</p>}
            </div>
          ))}
        </div>
        <div className="flex justify-between gap-2 pt-2">
          <Button variant="outline" onClick={onPlusTard}>Plus tard</Button>
          <Button disabled={!complet} onClick={() => {
            // Chaque dimension du groupe reçoit le choix (deux pigments, une teinte).
            const sortie: Record<string, string> = {};
            for (const g of groupes) {
              const label = choix[g.nom];
              if (!label) continue;
              for (const d of g.dimensions) sortie[d.id] = label;
            }
            onValider(sortie);
          }}>Valider</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
