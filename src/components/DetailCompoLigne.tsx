import { Copy, RotateCcw, Trash2 } from 'lucide-react';
import { InputNombre } from '@/components/InputNombre';
import ProduitCombobox from '@/components/ProduitCombobox';
import VarianteSelect from '@/components/VarianteSelect';
import { designationProduit, formatMontant, type Produit } from '@/lib/store';
import {
  aPlat, avecComposants, composantsPersonnalises, detailCompo, prixDetailCompo, prixForces,
  type ComposantLigne, type ResoudrePrix, type VarianteCompo,
} from '@/lib/variantesCompo';

/**
 * Le détail d'une ligne à variante composée, DÉPLIÉ dans l'éditeur du devis :
 * chaque composant comme si on l'avait saisi seul — produit, teinte, quantité,
 * poids, prix de vente, prix d'achat, coefficient.
 *
 * TOUT SE RETOUCHE, ET LA PREMIÈRE RETOUCHE DONNE À LA LIGNE SA PROPRE
 * COMPOSITION (`__composants`, variantesCompo.ts) : quantité, produit (SNLR11 →
 * SNLR5), composant dupliqué pour mêler deux RAL, supprimé, prix ou coefficient
 * forcé. Le prix de la ligne est la somme de ce détail — le calcul de
 * `getPrixLigne`. « Rétablir » rend la composition de la fiche article.
 *
 * Le coefficient se lit sur le prix d'achat de l'article : sans prix d'achat
 * renseigné, il n'est pas proposé (on ne calcule pas une marge sur un zéro).
 */
interface Props {
  variante: VarianteCompo;
  /** Quantité de la ligne : les quantités et totaux affichés en tiennent compte. */
  quantiteLigne: number;
  variantesChoisies?: Record<string, string>;
  resoudre: ResoudrePrix;
  trouver: (id: string) => Produit | undefined;
  /** Catalogue entier, pour changer le produit d'un composant. */
  produits: Produit[];
  /** Droit Achat : prix d'achat et coefficients. */
  canAchat: boolean;
  onChange: (variantesChoisies: Record<string, string>) => void;
}

const fmtQ = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',');

export default function DetailCompoLigne({ variante, quantiteLigne, variantesChoisies, resoudre, trouver, produits, canAchat, onChange }: Props) {
  const detail = detailCompo(variante, resoudre, trouver, variantesChoisies, prixForces(variantesChoisies));
  const perso = composantsPersonnalises(variantesChoisies);
  const qL = quantiteLigne || 0;
  const totalUnite = prixDetailCompo(detail);
  const achatUnite = detail.length > 0 && detail.every(d => (d.produit?.prixAchat ?? 0) > 0)
    ? detail.reduce((s, d) => s + d.quantite * (d.produit!.prixAchat), 0) : null;

  /** Toute retouche passe par ici : la composition de la ligne, à plat, modifiée. */
  const modifier = (fn: (rows: ComposantLigne[]) => ComposantLigne[]) => {
    const rows = perso ?? aPlat(variante, resoudre, trouver, variantesChoisies);
    onChange(avecComposants(variantesChoisies, fn(rows.map(r => ({ ...r })))));
  };
  const majRow = (i: number, patch: Partial<ComposantLigne>) => modifier(rows => rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <div className="mt-1 ml-9 rounded-md border border-border bg-background/70 text-xs overflow-x-auto">
      {perso && (
        <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-border bg-orange-50 dark:bg-orange-950/20">
          <span className="text-orange-700 dark:text-orange-400">Composition propre à cette ligne — elle ne suit plus la variante de la fiche article.</span>
          <button type="button" onClick={() => onChange(avecComposants(variantesChoisies, null))}
            className="inline-flex items-center gap-1 text-primary hover:underline shrink-0">
            <RotateCcw className="w-3 h-3" /> Rétablir la composition de l'article
          </button>
        </div>
      )}
      <table className="w-full min-w-[860px]">
        <thead>
          <tr className="text-muted-foreground border-b border-border">
            <th className="text-left font-medium px-2 py-1">Composant</th>
            <th className="text-right font-medium px-2 py-1 w-24" title="Pour la quantité de la ligne">Qté</th>
            <th className="text-right font-medium px-2 py-1 w-20">Poids kg</th>
            <th className="text-right font-medium px-2 py-1 w-28">PU vente HT</th>
            <th className="text-right font-medium px-2 py-1 w-14">Rem.</th>
            {canAchat && <th className="text-right font-medium px-2 py-1 w-20">PU achat</th>}
            {canAchat && <th className="text-right font-medium px-2 py-1 w-20">Coeff</th>}
            <th className="text-right font-medium px-2 py-1 w-24">Total HT</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody>
          {detail.map((d, i) => {
            const qte = d.quantite * qL;
            const poids = d.produit?.poids ? d.produit.poids * qte : null;
            const achat = d.produit?.prixAchat && d.produit.prixAchat > 0 ? d.produit.prixAchat : null;
            const coeff = achat ? d.prixUnitaire * d.facteurRemise / achat : null;
            const dims = (d.produit?.variantes ?? []).filter(x => x.options.length > 0);
            const teinteRow = (d.composant as ComposantLigne).teinte;
            return (
              <tr key={d.cle} className="border-b border-border/50 last:border-0 align-top">
                <td className="px-2 py-1" style={{ paddingLeft: 8 + d.profondeur * 14 }}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="w-56 shrink-0">
                      <ProduitCombobox produits={produits} value={d.composant.produitId || ''}
                        onSelect={id => {
                          const p = id ? trouver(id) : undefined;
                          majRow(i, p
                            ? { produitId: p.id, description: designationProduit(p), unite: p.unite, prixUnitaireHT: p.prixHT, prixFige: false, teinte: undefined }
                            : { produitId: undefined });
                        }} />
                    </div>
                    {!d.produit && <span className="text-muted-foreground">{d.composant.description || 'Composant libre'}</span>}
                    {/* Teinte du composant : sans choix propre, celle de la ligne. Deux lignes dupliquées = deux RAL. */}
                    {dims.map(dim => {
                      const deLaLigne = variantesChoisies?.[dim.id];
                      return (
                        <div key={dim.id} className="w-36 shrink-0" title={teinteRow ? `${dim.nom} propre à ce composant` : `${dim.nom} de la ligne`}>
                          <VarianteSelect dimension={dim} value={teinteRow || deLaLigne || ''}
                            vide={`— ${dim.nom.toLowerCase()} à choisir —`}
                            onChange={label => majRow(i, { teinte: label })} />
                        </div>
                      );
                    })}
                  </div>
                </td>
                <td className="px-2 py-1">
                  {qL > 0 ? (
                    <div className="flex items-center justify-end gap-1">
                      <InputNombre decimales={3} value={Math.round(qte * 1000) / 1000}
                        // La quantité saisie vaut pour la ligne ; on garde la quantité par ensemble.
                        onChange={n => majRow(i, { quantite: Math.round(n / qL * 1e6) / 1e6 })}
                        className="h-6 w-16 text-xs text-right" title="Quantité pour la quantité de la ligne" />
                      <span className="text-muted-foreground">{d.composant.unite}</span>
                    </div>
                  ) : <span className="block text-right text-muted-foreground" title="Saisir d'abord la quantité de la ligne">—</span>}
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{poids != null ? fmtQ(poids) : '—'}</td>
                <td className="px-2 py-1">
                  <div className="flex items-center justify-end gap-1">
                    <InputNombre decimales={2} value={d.prixUnitaire} onChange={n => majRow(i, { prixFige: true, prixUnitaireHT: n })}
                      className={`h-6 w-20 text-xs text-right ${d.force ? 'border-orange-400 text-orange-600' : ''}`}
                      title={d.force ? `Prix forcé à la main (calculé : ${formatMontant(d.prixCalcule)})` : 'Prix de l\'article au tarif du devis — le saisir le force'} />
                    {d.force && (
                      <button type="button" onClick={() => majRow(i, { prixFige: false })} title={`Revenir au prix calculé (${formatMontant(d.prixCalcule)})`}
                        className="text-muted-foreground hover:text-foreground"><RotateCcw className="w-3 h-3" /></button>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1 text-right text-muted-foreground">{d.facteurRemise < 1 ? `${Math.round((1 - d.facteurRemise) * 1000) / 10} %` : '—'}</td>
                {canAchat && <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{achat != null ? formatMontant(achat) : '—'}</td>}
                {canAchat && (
                  <td className="px-2 py-1">
                    {achat != null && coeff != null ? (
                      <InputNombre decimales={2} value={Math.round(coeff * 100) / 100}
                        // Coefficient saisi → prix de vente = achat × coeff (remise du composant ramenée).
                        onChange={k => { if (k > 0) majRow(i, { prixFige: true, prixUnitaireHT: Math.round(achat * k / (d.facteurRemise || 1) * 100) / 100 }); }}
                        className={`h-6 w-16 text-xs text-right ml-auto ${coeff < 1.43 ? 'text-destructive' : coeff < 1.6 ? 'text-orange-500' : 'text-emerald-600'}`}
                        title="Coefficient vente / achat — le saisir force le prix de vente" />
                    ) : <span className="block text-right text-muted-foreground" title="Prix d'achat de l'article non renseigné">—</span>}
                  </td>
                )}
                <td className="px-2 py-1 text-right tabular-nums font-medium">{formatMontant(qte * d.prixUnitaire * d.facteurRemise)}</td>
                <td className="px-1 py-1">
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" title="Dupliquer ce composant (par exemple pour un second RAL ou un autre SNLR)"
                      onClick={() => modifier(rows => [...rows.slice(0, i + 1), { ...rows[i] }, ...rows.slice(i + 1)])}
                      className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                    <button type="button" title="Retirer ce composant de la ligne" disabled={detail.length <= 1}
                      onClick={() => modifier(rows => rows.filter((_, k) => k !== i))}
                      className="text-destructive hover:text-destructive/80 disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border text-muted-foreground">
            <td className="px-2 py-1" colSpan={3}>Prix d'un ensemble : <strong className="text-foreground">{formatMontant(totalUnite)}</strong>
              {canAchat && achatUnite != null && <> · achat {formatMontant(achatUnite)} · coeff {(totalUnite / achatUnite).toFixed(2)}</>}
              {canAchat && achatUnite == null && <> · coût d'achat incomplet (un composant sans prix d'achat)</>}
            </td>
            <td colSpan={canAchat ? 4 : 2} />
            <td className="px-2 py-1 text-right font-semibold text-foreground tabular-nums">{formatMontant(totalUnite * qL)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
