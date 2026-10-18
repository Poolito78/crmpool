import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatMontant, type LigneKit, type Produit, type VarianteDimension } from '@/lib/store';
import { getRalInfo } from '@/lib/ralColors';
import { cn } from '@/lib/utils';

/**
 * Les options de l'article qu'on vient de saisir dans un devis : à cocher.
 * Rien n'est coché d'office — une option est un choix du client, pas une
 * ligne du devis. Les lignes cochées sont insérées sous l'article.
 *
 * LES VARIANTES DE L'OPTION SE DEMANDENT ICI. Le pigment proposé sous un
 * FLOWFAST 319 porte la dimension « Teinte » et ses 220 RAL : sans elle,
 * l'option partait au devis sans teinte et rien ne la demandait. Une option
 * cochée dont l'article a des dimensions affiche donc leurs sélecteurs.
 * Rien n'est choisi d'office (on ne devine pas une teinte) : une dimension
 * laissée vide se signale et se reprend sur la ligne du devis.
 */
export type OptionChoisie = LigneKit & { variantesChoisies?: Record<string, string> };

/**
 * Choix d'une dimension À PLAT dans la fenêtre : un champ où taper le RAL et
 * la grille des teintes juste dessous, filtrée à la frappe. Un menu déroulant
 * s'ouvrait DANS la liste des options, qui défile : il y était coupé et l'on
 * ne voyait qu'un rang de pastilles. Entrée retient la première teinte
 * restante.
 */
function ChoixDimension({ dimension, valeur, onChoix }: {
  dimension: VarianteDimension; valeur: string; onChoix: (label: string) => void;
}) {
  const [saisie, setSaisie] = useState('');
  const visibles = useMemo(() => {
    const q = saisie.trim().toLowerCase().replace(/^ral\s*/, '');
    if (!q) return dimension.options;
    return dimension.options.filter(o =>
      getRalInfo(o.label)?.num.startsWith(q) || o.label.toLowerCase().includes(q));
  }, [saisie, dimension.options]);

  return (
    <div className="space-y-1.5">
      <Input
        value={saisie}
        onChange={e => setSaisie(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && visibles[0]) { e.preventDefault(); onChoix(visibles[0].label); setSaisie(''); }
        }}
        placeholder="Tapez le RAL (ex. 7037) ou un nom de teinte…"
        className="h-8 text-sm"
      />
      <div className="grid gap-1 max-h-60 overflow-y-auto rounded border border-border p-1.5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))' }}>
        {visibles.map(o => {
          const ral = getRalInfo(o.label);
          const fond = o.couleur || ral?.hex;
          return (
            <button
              key={o.id}
              type="button"
              title={o.label}
              onClick={() => { onChoix(o.label); setSaisie(''); }}
              className={cn('flex flex-col items-center gap-0.5 rounded p-1 text-center hover:bg-accent',
                o.label === valeur && 'ring-2 ring-primary bg-accent/60')}
            >
              {o.imageUrl
                ? <img src={o.imageUrl} alt={o.label} className="h-10 w-10 rounded object-cover border border-black/10"
                    style={fond ? { backgroundColor: fond } : undefined}
                    onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                : <span className="h-10 w-10 rounded border border-black/10" style={{ backgroundColor: fond ?? 'transparent' }} />}
              <span className="text-[10px] leading-tight line-clamp-2 w-full">
                {ral ? `RAL ${ral.num}` : o.label}
                {o.prixDiff ? <span className="text-muted-foreground"> ({o.prixDiff > 0 ? '+' : ''}{o.prixDiff}€)</span> : null}
              </span>
            </button>
          );
        })}
        {visibles.length === 0 && <p className="col-span-full py-2 text-center text-xs text-muted-foreground">Aucune teinte ne correspond</p>}
      </div>
    </div>
  );
}

interface Props {
  produit: Produit | null;
  /** L'article d'une option, pour en lire les dimensions (Teinte…). */
  trouver: (id: string) => Produit | undefined;
  onConfirm: (choisies: OptionChoisie[]) => void;
  onCancel: () => void;
}

export default function OptionsArticleDialog({ produit, trouver, onConfirm, onCancel }: Props) {
  const options = produit?.lignesOptions ?? [];
  const [cochees, setCochees] = useState<Set<number>>(new Set());
  /* Le mode de chaque option : celui de la fiche article, modifiable ici. */
  const [inclus, setInclus] = useState<Set<number>>(new Set());
  /** Choix des dimensions, par option : rang de l'option → (dimension → libellé). */
  const [variantes, setVariantes] = useState<Record<number, Record<string, string>>>({});
  useEffect(() => {
    setCochees(new Set());
    setVariantes({});
    setInclus(new Set((produit?.lignesOptions ?? []).flatMap((o, i) => (o.inclusALaLigne ? [i] : []))));
  }, [produit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const bascule = (i: number) =>
    setCochees(prev => { const s = new Set(prev); if (s.has(i)) s.delete(i); else s.add(i); return s; });

  const dimensionsDe = (o: LigneKit) =>
    (o.produitId ? trouver(o.produitId)?.variantes ?? [] : []).filter(d => d.options.length > 0);

  return (
    <Dialog open={!!produit} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Options proposées — {produit?.reference}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5 max-h-[75vh] overflow-y-auto">
          {options.map((o, i) => {
            const dims = cochees.has(i) ? dimensionsDe(o) : [];
            return (
              <div key={i} className="rounded-lg border border-border">
                <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50">
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
                {dims.length > 0 && (
                  <div className="space-y-2 px-3 pb-2 pl-9">
                    {dims.map(d => {
                      const valeur = variantes[i]?.[d.id] ?? '';
                      return (
                        <div key={d.id} className="space-y-1">
                          <div className="text-xs text-muted-foreground">
                            {d.nom || 'Variante'} :{' '}
                            {valeur
                              ? <span className="font-medium text-foreground">{valeur}</span>
                              : <span className="text-amber-600">à choisir</span>}
                          </div>
                          <ChoixDimension
                            dimension={d}
                            valeur={valeur}
                            onChoix={label => setVariantes(prev => ({ ...prev, [i]: { ...(prev[i] ?? {}), [d.id]: label } }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between gap-2 pt-1">
          <Button variant="outline" onClick={onCancel}>Sans option</Button>
          <Button onClick={() => onConfirm(options.flatMap((o, i) => {
            if (!cochees.has(i)) return [];
            const vc = Object.fromEntries(Object.entries(variantes[i] ?? {}).filter(([, v]) => v));
            return [{
              ...o,
              inclusALaLigne: inclus.has(i) ? true : undefined,
              ...(Object.keys(vc).length ? { variantesChoisies: vc } : {}),
            }];
          }))} disabled={cochees.size === 0}>
            Ajouter {cochees.size > 0 ? `${cochees.size} option${cochees.size > 1 ? 's' : ''}` : 'les options'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
