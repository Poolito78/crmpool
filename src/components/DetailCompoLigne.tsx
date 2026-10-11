import { RotateCcw } from 'lucide-react';
import { InputNombre } from '@/components/InputNombre';
import { designationProduit, formatMontant, type Produit } from '@/lib/store';
import {
  avecPrixForce, detailCompo, prixDetailCompo, prixForces, type ResoudrePrix, type VarianteCompo,
} from '@/lib/variantesCompo';

/**
 * Le détail d'une ligne à variante composée, DÉPLIÉ dans l'éditeur du devis :
 * chaque composant comme si on l'avait saisi seul — quantité, poids, prix de
 * vente, prix d'achat, coefficient. Le prix de vente et le coefficient se
 * forcent à la main ; le prix de la ligne est la somme de ce détail
 * (`prixDetailCompo`, le même calcul que `getPrixLigne`).
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
  /** Droit Achat : prix d'achat et coefficients. */
  canAchat: boolean;
  onChange: (variantesChoisies: Record<string, string>) => void;
}

const fmtQ = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',');

export default function DetailCompoLigne({ variante, quantiteLigne, variantesChoisies, resoudre, trouver, canAchat, onChange }: Props) {
  const detail = detailCompo(variante, resoudre, trouver, variantesChoisies, prixForces(variantesChoisies));
  const qL = quantiteLigne || 0;
  const totalUnite = prixDetailCompo(detail);
  const achatUnite = detail.every(d => (d.produit?.prixAchat ?? 0) > 0)
    ? detail.reduce((s, d) => s + d.quantite * (d.produit!.prixAchat), 0) : null;
  const forcer = (cle: string, prix: number | null) => onChange(avecPrixForce(variantesChoisies, cle, prix));

  return (
    <div className="mt-1 ml-9 rounded-md border border-border bg-background/70 text-xs overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead>
          <tr className="text-muted-foreground border-b border-border">
            <th className="text-left font-medium px-2 py-1">Composant</th>
            <th className="text-right font-medium px-2 py-1 w-20" title="Pour la quantité de la ligne">Qté</th>
            <th className="text-right font-medium px-2 py-1 w-20">Poids kg</th>
            <th className="text-right font-medium px-2 py-1 w-28">PU vente HT</th>
            <th className="text-right font-medium px-2 py-1 w-14">Rem.</th>
            {canAchat && <th className="text-right font-medium px-2 py-1 w-20">PU achat</th>}
            {canAchat && <th className="text-right font-medium px-2 py-1 w-20">Coeff</th>}
            <th className="text-right font-medium px-2 py-1 w-24">Total HT</th>
          </tr>
        </thead>
        <tbody>
          {detail.map(d => {
            const qte = d.quantite * qL;
            const poids = d.produit?.poids ? d.produit.poids * qte : null;
            const achat = d.produit?.prixAchat && d.produit.prixAchat > 0 ? d.produit.prixAchat : null;
            const coeff = achat ? d.prixUnitaire * d.facteurRemise / achat : null;
            return (
              <tr key={d.cle} className="border-b border-border/50 last:border-0">
                <td className="px-2 py-1" style={{ paddingLeft: 8 + d.profondeur * 14 }}>
                  {d.produit && <span className="font-mono text-[11px] text-muted-foreground mr-1.5">{d.produit.reference}</span>}
                  <span className="text-foreground">{d.produit ? designationProduit(d.produit) : (d.composant.description || 'Composant libre')}</span>
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtQ(qte)} <span className="text-muted-foreground">{d.composant.unite}</span></td>
                <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{poids != null ? fmtQ(poids) : '—'}</td>
                <td className="px-2 py-1">
                  <div className="flex items-center justify-end gap-1">
                    <InputNombre decimales={2} value={d.prixUnitaire} onChange={n => forcer(d.cle, n)}
                      className={`h-6 w-20 text-xs text-right ${d.force ? 'border-orange-400 text-orange-600' : ''}`}
                      title={d.force ? `Prix forcé à la main (calculé : ${formatMontant(d.prixCalcule)})` : 'Prix de l\'article au tarif du devis — le saisir le force'} />
                    {d.force && (
                      <button type="button" onClick={() => forcer(d.cle, null)} title={`Revenir au prix calculé (${formatMontant(d.prixCalcule)})`}
                        className="text-muted-foreground hover:text-foreground"><RotateCcw className="w-3 h-3" /></button>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1 text-right text-muted-foreground">{d.composant.remise ? `${d.composant.remise} %` : '—'}</td>
                {canAchat && <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{achat != null ? formatMontant(achat) : '—'}</td>}
                {canAchat && (
                  <td className="px-2 py-1">
                    {achat != null && coeff != null ? (
                      <InputNombre decimales={2} value={Math.round(coeff * 100) / 100}
                        // Coefficient saisi → prix de vente = achat × coeff (remise du composant ramenée).
                        onChange={k => { if (k > 0) forcer(d.cle, Math.round(achat * k / (d.facteurRemise || 1) * 100) / 100); }}
                        className={`h-6 w-16 text-xs text-right ml-auto ${coeff < 1.43 ? 'text-destructive' : coeff < 1.6 ? 'text-orange-500' : 'text-emerald-600'}`}
                        title="Coefficient vente / achat — le saisir force le prix de vente" />
                    ) : <span className="block text-right text-muted-foreground" title="Prix d'achat de l'article non renseigné">—</span>}
                  </td>
                )}
                <td className="px-2 py-1 text-right tabular-nums font-medium">{formatMontant(qte * d.prixUnitaire * d.facteurRemise)}</td>
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
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
