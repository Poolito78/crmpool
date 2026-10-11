import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { designationProduit, formatMontant, type Produit } from '@/lib/store';
import { prixVarianteCompo, type VarianteCompo } from '@/lib/variantesCompo';

/**
 * Choix d'une VARIANTE composée à la saisie d'un article dans un devis,
 * avant les options. « Article seul » garde la ligne telle qu'elle est.
 */
interface Props {
  produit: Produit | null;
  onChoix: (variante: VarianteCompo | null) => void;
  /** Prix HT courant d'une variante, au tarif du devis. */
  prixDe?: (v: VarianteCompo) => number;
  /** Choix en cascade : l'article dont `produit` est un composant (« dans 319R »). */
  dans?: string;
}

export default function VarianteCompoDialog({ produit, onChoix, prixDe, dans }: Props) {
  const variantes = produit?.variantesCompo ?? [];
  const [choisie, setChoisie] = useState<string>('');
  useEffect(() => { setChoisie(''); }, [produit?.id]);

  return (
    <Dialog open={!!produit} onOpenChange={o => { if (!o) onChoix(null); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Variantes — {produit ? designationProduit(produit) : ''}</DialogTitle>
          {dans && <p className="text-xs text-muted-foreground">Composant de {dans} : la variante retenue entre dans son prix et son intitulé.</p>}
        </DialogHeader>
        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
          <label className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-muted/50">
            <input type="radio" name="variante" checked={choisie === ''} onChange={() => setChoisie('')} />
            <span className="flex-1 text-sm font-medium">Article seul</span>
            {produit && <span className="text-xs text-muted-foreground">{formatMontant(produit.prixHT)} HT</span>}
          </label>
          {variantes.map(v => (
            <label key={v.id} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-muted/50">
              <input type="radio" name="variante" className="mt-1" checked={choisie === v.id} onChange={() => setChoisie(v.id)} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium">{v.nom || 'Variante'}</span>
                <span className="block text-xs text-muted-foreground">
                  {v.composants.map(c => `${c.quantite} × ${c.description || 'produit'}`).join(' + ')}
                </span>
              </span>
              <span className="text-xs font-medium shrink-0">{formatMontant(prixDe ? prixDe(v) : prixVarianteCompo(v))} HT</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={() => onChoix(variantes.find(v => v.id === choisie) ?? null)}>Valider</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
