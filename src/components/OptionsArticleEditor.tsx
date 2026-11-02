import { ExternalLink, Plus, Trash } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { InputNombre } from '@/components/InputNombre';
import ProduitCombobox from '@/components/ProduitCombobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BoutonsOrdre from '@/components/BoutonsOrdre';
import { deplacer } from '@/lib/ordre';
import { designationProduit, type LigneKit, type Produit } from '@/lib/store';
import { resumeQuantiteOption, type QteTeinte } from '@/lib/optionsQuantite';

/**
 * Les OPTIONS d'un article : des produits proposés quand l'article est saisi
 * dans un devis. À la différence d'un kit, rien n'est inséré d'office — le
 * devis ouvre une liste à cocher (voir `OptionsArticleDialog`).
 *
 * Chaque option dit en clair ce qu'elle ajoute au devis : sa quantité, fixe
 * ou PAR KIT de l'article (la ligne suit alors sa quantité), et les teintes
 * qui en demandent une autre (pigment : 1 kg par kit, 2 kg en RAL 1023).
 */
interface Props {
  actif: boolean;
  onActif: (v: boolean) => void;
  lignes: LigneKit[];
  onChange: (fn: (prev: LigneKit[]) => LigneKit[]) => void;
  produits: Produit[];
  /** Ouvre la fiche d'un article proposé en option (clic sur l'icône). */
  onOpen?: (produitId: string) => void;
}

const vide = (): LigneKit => ({ description: '', quantite: 1, unite: 'pièce', prixUnitaireHT: 0, remise: 0 });

export default function OptionsArticleEditor({ actif, onActif, lignes, onChange, produits, onOpen }: Props) {
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
        {actif && lignes.map((lk, idx) => {
          const teintes = lk.quantitesParTeinte ?? [];
          const majTeinte = (k: number, patch: Partial<QteTeinte>) =>
            maj(idx, { quantitesParTeinte: teintes.map((t, j) => (j === k ? { ...t, ...patch } : t)) });
          return (
          <div key={idx} className="rounded-lg border border-border bg-background p-2 space-y-2">
            {/* 1. L'article proposé et son prix. */}
            <div className="flex flex-wrap gap-1.5 items-end">
            <span className="mb-0.5"><BoutonsOrdre index={idx} total={lignes.length} onMove={d => onChange(prev => deplacer(prev, idx, d))} /></span>
            <div className="flex flex-col gap-0.5 min-w-[200px] flex-1">
              <span className="text-xs text-muted-foreground">Article proposé</span>
              <div className="flex items-center gap-1">
              <div className="flex-1 min-w-0"><ProduitCombobox
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
              /></div>
              {lk.produitId && onOpen && (
              <button type="button" onClick={() => onOpen(lk.produitId!)} title="Ouvrir la fiche de l'article"
                className="p-1.5 rounded hover:bg-primary/10 text-primary/60 hover:text-primary shrink-0">
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
              <span className="text-xs text-muted-foreground">Libellé au devis</span>
              <Input value={lk.description} onChange={e => maj(idx, { description: e.target.value })} placeholder="Description…" className="text-xs h-7" />
            </div>
            <div className="flex flex-col gap-0.5 w-44">
              <span className="text-xs text-muted-foreground">Dans le devis</span>
              <Select value={lk.inclusALaLigne ? 'inclus' : 'ligne'} onValueChange={v => maj(idx, { inclusALaLigne: v === 'inclus' ? true : undefined })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ligne">Ligne en plus (chiffrée)</SelectItem>
                  <SelectItem value="inclus">Incluse à la ligne (non chiffrée)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-0.5 w-24">
              <span className="text-xs text-muted-foreground">Prix unit. HT</span>
              <InputNombre decimales={2} value={lk.prixUnitaireHT}
                onChange={n => maj(idx, { prixUnitaireHT: n })} className="text-xs h-7" />
            </div>
            <div className="flex flex-col gap-0.5 w-16">
              <span className="text-xs text-muted-foreground">Remise %</span>
              <InputNombre decimales={2} value={lk.remise}
                onChange={n => maj(idx, { remise: n })} className="text-xs h-7" />
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

            {/* 2. La quantité : par kit de l'article ou fixe, et ses exceptions par teinte (optionsQuantite.ts). */}
            {!lk.inclusALaLigne && (
            <div className="pl-6 space-y-1.5">
              <div className="flex flex-wrap gap-1.5 items-end">
                <div className="flex flex-col gap-0.5 w-20">
                  <span className="text-xs text-muted-foreground">Quantité</span>
                  {/* InputNombre : un champ vidé ne retombe plus à 1 — on peut effacer puis retaper. */}
                  <InputNombre decimales={3} value={lk.quantite}
                    onChange={n => maj(idx, { quantite: n })} className="text-xs h-7" />
                </div>
                <div className="flex flex-col gap-0.5 w-16">
                  <span className="text-xs text-muted-foreground">Unité</span>
                  <Input value={lk.unite} onChange={e => maj(idx, { unite: e.target.value })} className="text-xs h-7" />
                </div>
                <div className="flex flex-col gap-0.5 w-60">
                  <span className="text-xs text-muted-foreground">Quantité comptée</span>
                  <Select value={lk.parUnite ? 'kit' : 'fixe'} onValueChange={v => maj(idx, { parUnite: v === 'kit' ? true : undefined })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kit">Par kit de l'article (suit sa quantité)</SelectItem>
                      <SelectItem value="fixe">En tout (quantité fixe)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <button type="button" onClick={() => maj(idx, { quantitesParTeinte: [...teintes, { teinte: '', quantite: lk.quantite }] })}
                  className="mb-1 text-xs text-primary hover:underline flex items-center gap-1"
                  title="Une quantité différente pour une teinte précise (le jaune RAL 1023 demande plus de pigment)">
                  <Plus className="h-3 w-3" /> Quantité pour une teinte
                </button>
              </div>
              {teintes.map((t, k) => (
                <div key={k} className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Teinte</span>
                  <Input value={t.teinte} onChange={e => majTeinte(k, { teinte: e.target.value })} placeholder="RAL 1023" className="text-xs h-7 w-32" />
                  <span className="text-muted-foreground">:</span>
                  <div className="w-20"><InputNombre decimales={3} value={t.quantite} onChange={n => majTeinte(k, { quantite: n })} className="text-xs h-7" /></div>
                  <span className="text-muted-foreground">{lk.unite}{lk.parUnite ? ' par kit' : ''}</span>
                  <button type="button" title="Retirer cette teinte" onClick={() => maj(idx, { quantitesParTeinte: teintes.filter((_, j) => j !== k) })}
                    className="text-muted-foreground hover:text-destructive"><Trash className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Au devis : <span className="font-medium text-foreground">{resumeQuantiteOption(lk)}</span>
                {lk.parUnite ? ' — ex. 5 kits de l\'article donnent ' + resumeQuantiteOption({ ...lk, parUnite: undefined, quantite: lk.quantite * 5, quantitesParTeinte: teintes.map(t => ({ ...t, quantite: t.quantite * 5 })) }) : ''}
                . La teinte choisie à l'ajout de l'option fixe la quantité ; on peut toujours la forcer sur la ligne du devis.
              </p>
            </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
