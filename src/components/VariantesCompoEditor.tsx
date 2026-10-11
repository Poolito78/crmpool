import { ExternalLink, Plus, Trash } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { InputNombre } from '@/components/InputNombre';
import ProduitCombobox from '@/components/ProduitCombobox';
import BoutonsOrdre from '@/components/BoutonsOrdre';
import { deplacer } from '@/lib/ordre';
import { designationProduit, formatMontant, generateId, type LigneKit, type Produit } from '@/lib/store';
import { prixComposant, prixVarianteCompo, type ResoudrePrix, type VarianteCompo } from '@/lib/variantesCompo';

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
  /** Ouvre la fiche d'un article composant (clic sur l'icône). */
  onOpen?: (produitId: string) => void;
}

const composantVide = (): LigneKit => ({ description: '', quantite: 1, unite: 'pièce', prixUnitaireHT: 0, remise: 0 });

export default function VariantesCompoEditor({ actif, onActif, variantes, onChange, produits, onOpen }: Props) {
  /* Prix courant de l'article du composant (tarif public de sa fiche). */
  const resoudre: ResoudrePrix = c => produits.find(p => p.id === c.produitId)?.prixHT;
  /* Au devis d'un client REVENDEUR, c'est le prix revendeur de l'article qui s'applique : on le montre à côté. */
  const resoudreRevendeur: ResoudrePrix = c => produits.find(p => p.id === c.produitId)?.prixRevendeur;
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
        {actif && variantes.map((v, vIdx) => (
          <div key={v.id} className="rounded-lg border border-border bg-background/60 p-2 space-y-2">
            <div className="flex items-end gap-2">
              <span className="mb-1"><BoutonsOrdre index={vIdx} total={variantes.length} onMove={d => onChange(prev => deplacer(prev, vIdx, d))} /></span>
              <div className="flex flex-col gap-0.5 flex-1">
                <span className="text-xs text-muted-foreground">Nom de la variante (complète la désignation de l'article)</span>
                <Input value={v.nom} onChange={e => majVariante(v.id, { nom: e.target.value })} placeholder="Ex : avec primaire et finition" className="h-8 text-xs" />
              </div>
              <span className="text-xs text-muted-foreground pb-2">Public : <strong className="text-foreground">{formatMontant(prixVarianteCompo(v, resoudre))}</strong> · Revendeur : <strong className="text-foreground">{formatMontant(prixVarianteCompo(v, resoudreRevendeur))}</strong> HT</span>
              <button
                type="button" title="Supprimer cette variante"
                onClick={() => onChange(prev => prev.filter(x => x.id !== v.id))}
                className="p-1.5 hover:bg-destructive/10 rounded text-destructive mb-0.5"
              ><Trash className="w-3.5 h-3.5" /></button>
            </div>

            {v.composants.map((c, idx) => (
              <div key={idx} className="flex flex-wrap gap-1.5 items-end">
                <span className="mb-0.5"><BoutonsOrdre index={idx} total={v.composants.length} onMove={d => majVariante(v.id, { composants: deplacer(v.composants, idx, d) })} /></span>
                <div className="flex flex-col gap-0.5 min-w-[200px] flex-1">
                  <span className="text-xs text-muted-foreground">Produit</span>
                  <div className="flex items-center gap-1">
                  <div className="flex-1 min-w-0"><ProduitCombobox
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
                  /></div>
                  {c.produitId && onOpen && (
                  <button type="button" onClick={() => onOpen(c.produitId!)} title="Ouvrir la fiche de l'article"
                    className="p-1.5 rounded hover:bg-primary/10 text-primary/60 hover:text-primary shrink-0">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
                  <span className="text-xs text-muted-foreground">Description</span>
                  <Input value={c.description} onChange={e => majComposant(v.id, idx, { description: e.target.value })} className="text-xs h-7" />
                </div>
                <div className="flex flex-col gap-0.5 w-14">
                  <span className="text-xs text-muted-foreground">Qté</span>
                  {/* InputNombre : un champ vidé ne retombe plus à 1 — on peut effacer puis retaper. */}
                  <InputNombre decimales={3} value={c.quantite}
                    onChange={n => majComposant(v.id, idx, { quantite: n })} className="text-xs h-7" />
                </div>
                <div className="flex flex-col gap-0.5 w-16">
                  <span className="text-xs text-muted-foreground">Unité</span>
                  <Input value={c.unite} onChange={e => majComposant(v.id, idx, { unite: e.target.value })} className="text-xs h-7" />
                </div>
                <div className="flex flex-col gap-0.5 w-24">
                  <span className="text-xs text-muted-foreground flex items-center justify-between">
                    Prix HT
                    {c.produitId && (
                      <button
                        type="button"
                        className="underline text-[10px] hover:text-foreground"
                        title={c.prixFige ? 'Le prix est saisi à la main — cliquer pour suivre à nouveau le prix de l\'article' : 'Le prix suit celui de l\'article — cliquer pour le saisir à la main'}
                        onClick={() => majComposant(v.id, idx, c.prixFige
                          ? { prixFige: false }
                          : { prixFige: true, prixUnitaireHT: prixComposant(c, resoudre) })}
                      >{c.prixFige ? 'manuel' : 'auto'}</button>
                    )}
                  </span>
                  <InputNombre
                    decimales={2}
                    value={c.produitId && !c.prixFige ? prixComposant(c, resoudre) : c.prixUnitaireHT}
                    readOnly={!!c.produitId && !c.prixFige}
                    onChange={n => majComposant(v.id, idx, { prixUnitaireHT: n })}
                    className={`text-xs h-7 ${c.produitId && !c.prixFige ? 'bg-muted/50 text-muted-foreground' : ''}`}
                  />
                </div>
                <div className="flex flex-col gap-0.5 w-14">
                  <span className="text-xs text-muted-foreground">Rem%</span>
                  <InputNombre decimales={2} value={c.remise}
                    onChange={n => majComposant(v.id, idx, { remise: n })} className="text-xs h-7" />
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
