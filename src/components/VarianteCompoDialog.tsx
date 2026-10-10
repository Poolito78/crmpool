import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { designationProduit, formatMontant, type Produit } from '@/lib/store';
import { prixVarianteCompo, type VarianteCompo } from '@/lib/variantesCompo';

/**
 * Choix à la saisie d'un article qui a des VARIANTES composées, avant les
 * options. Trois façons de le prendre :
 *  - l'article seul (la ligne reste telle quelle) ;
 *  - l'article ET la variante : la ligne de l'article reste, la variante
 *    s'ajoute en dessous sur sa propre ligne ;
 *  - la variante seule : elle remplace l'article sur la ligne.
 */
export type ModeVariante = 'seul' | 'article+variante' | 'variante';

export interface ChoixVariante {
  mode: ModeVariante;
  variante?: VarianteCompo;
}

interface Props {
  produit: Produit | null;
  onChoix: (choix: ChoixVariante) => void;
}

const MODES: { mode: ModeVariante; libelle: string }[] = [
  { mode: 'seul', libelle: 'Article seul' },
  { mode: 'article+variante', libelle: 'Article + variante' },
  { mode: 'variante', libelle: 'Variante seulement' },
];

export default function VarianteCompoDialog({ produit, onChoix }: Props) {
  const variantes = produit?.variantesCompo ?? [];
  const [mode, setMode] = useState<ModeVariante>('seul');
  const [choisie, setChoisie] = useState('');
  useEffect(() => { setMode('seul'); setChoisie(''); }, [produit?.id]);

  const avecVariante = mode !== 'seul';
  const variante = variantes.find(v => v.id === choisie);

  return (
    <Dialog open={!!produit} onOpenChange={o => { if (!o) onChoix({ mode: 'seul' }); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Variantes — {produit ? designationProduit(produit) : ''}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1.5 flex-wrap">
          {MODES.map(m => (
            <button
              key={m.mode} type="button" onClick={() => setMode(m.mode)}
              className={`px-3 py-1.5 rounded-full text-xs border ${mode === m.mode ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
            >{m.libelle}</button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          {mode === 'seul' && `La ligne reste l'article seul${produit ? ` (${formatMontant(produit.prixHT)} HT)` : ''}.`}
          {mode === 'article+variante' && 'La ligne de l\'article reste, la variante s\'ajoute en dessous sur sa propre ligne.'}
          {mode === 'variante' && 'La variante remplace l\'article : une seule ligne, « article — variante ».'}
        </p>

        {avecVariante && (
          <div className="space-y-1.5 max-h-[45vh] overflow-y-auto">
            {variantes.map(v => (
              <label key={v.id} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-muted/50">
                <input type="radio" name="variante" className="mt-1" checked={choisie === v.id} onChange={() => setChoisie(v.id)} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium">{v.nom || 'Variante'}</span>
                  <span className="block text-xs text-muted-foreground">
                    {v.composants.map(c => `${c.quantite} × ${c.description || 'produit'}`).join(' + ')}
                  </span>
                </span>
                <span className="text-xs font-medium shrink-0">{formatMontant(prixVarianteCompo(v))} HT</span>
              </label>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button disabled={avecVariante && !variante} onClick={() => onChoix({ mode, variante })}>Valider</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
