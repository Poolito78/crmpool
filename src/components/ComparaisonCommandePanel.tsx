import { Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useAuth';
import { designationProduit, formatMontant } from '@/lib/store';
import { reportDuKit, type ComparaisonCommande, type KitCompare, type LigneComparee } from '@/lib/comparaisonCommande';

/**
 * La commande reçue comparée aux prix du CRM : les kits d'abord (leurs parties
 * dessous), les autres lignes, puis le total. L'écart se lit document − CRM :
 * positif, le fournisseur est plus cher que ce que le CRM croit. Une seule écriture,
 * au clic : le coût lu d'un kit sur sa fiche. Coûts d'achat : réservé au droit Achat.
 */
function Ecart({ ecart, pct }: { ecart?: number; pct?: number }) {
  if (ecart === undefined) return <span className="text-muted-foreground">—</span>;
  if (Math.abs(ecart) <= 0.005) return <span className="text-muted-foreground">conforme</span>;
  return (
    <span className={ecart > 0 ? 'text-destructive font-medium' : 'text-emerald-600 dark:text-emerald-400 font-medium'}>
      {ecart > 0 ? '+' : ''}{formatMontant(ecart)}{pct !== undefined ? ` (${pct > 0 ? '+' : ''}${pct.toLocaleString('fr-FR')} %)` : ''}
    </span>
  );
}

const prix = (v?: number) => (v !== undefined ? formatMontant(v) : '—');

function Ligne({ l, partie }: { l: LigneComparee; partie?: boolean }) {
  return (
    <tr className="border-t border-border align-top">
      <td className={`px-2 py-1 ${partie ? 'pl-5 text-muted-foreground' : ''}`}>
        <div>{l.description}</div>
        <div className="text-[10px] text-muted-foreground">
          {l.produit
            ? <>{l.produit.reference}{l.reference && l.reference !== l.produit.reference ? ` · réf. fournisseur ${l.reference}` : ''}</>
            : <span className="text-warning">Article non rapproché : hors comparaison</span>}
          {l.prixLien !== undefined ? ` · lien fournisseur ${formatMontant(l.prixLien)}` : ''}
        </div>
      </td>
      <td className="px-2 py-1 text-right tabular-nums">{l.quantite}</td>
      <td className="px-2 py-1 text-right tabular-nums">{prix(l.prixDoc)}</td>
      <td className="px-2 py-1 text-right tabular-nums">{prix(l.prixCRM)}</td>
      <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap"><Ecart ecart={l.ecart} pct={l.ecartPct} /></td>
    </tr>
  );
}

export default function ComparaisonCommandePanel({ comparaison: c, onReporterKit }: {
  comparaison: ComparaisonCommande;
  onReporterKit: (k: KitCompare, prix: number) => void;
}) {
  const { canAchat } = useCurrentUser();
  if (!canAchat) return null;
  const ecartMarchandises = c.horsComparaison < c.kits.length + c.lignes.length ? c.compareesDoc - c.compareesCRM : undefined;
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Scale className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">Comparaison avec les prix du CRM</span>
      </div>

      <div className="overflow-x-auto rounded border border-border bg-background">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left bg-muted">
              <th className="px-2 py-1 font-medium">Article</th>
              <th className="px-2 py-1 font-medium text-right">Qté</th>
              <th className="px-2 py-1 font-medium text-right whitespace-nowrap">Prix document</th>
              <th className="px-2 py-1 font-medium text-right whitespace-nowrap">Prix d'achat CRM</th>
              <th className="px-2 py-1 font-medium text-right">Écart</th>
            </tr>
          </thead>
          <tbody>
            {c.kits.map(k => (
              <FragmentKit key={k.kit.id} k={k} onReporter={onReporterKit} />
            ))}
            {c.lignes.map(l => <Ligne key={l.indice} l={l} />)}
          </tbody>
        </table>
      </div>

      <div className="ml-auto w-full sm:w-96 space-y-0.5 text-xs">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-muted-foreground">
          <span />
          <span className="text-right">Document</span>
          <span className="text-right">CRM</span>
          <span className="text-right">Écart</span>

          <span>Marchandises</span>
          <span className="text-right tabular-nums text-foreground">{formatMontant(c.marchandisesDoc)}</span>
          <span className="text-right tabular-nums text-foreground">{formatMontant(c.compareesCRM)}</span>
          <span className="text-right tabular-nums"><Ecart ecart={ecartMarchandises} /></span>

          <span>Transport</span>
          <span className="text-right tabular-nums text-foreground">{formatMontant(c.portDoc)}</span>
          <span className="text-right tabular-nums text-foreground">{prix(c.portFiche)}</span>
          <span className="text-right tabular-nums"><Ecart ecart={c.portFiche !== undefined ? c.portDoc - c.portFiche : undefined} /></span>

          {c.totalCRM !== undefined && (<>
            <span className="font-semibold text-foreground border-t border-border pt-0.5">Total HT</span>
            <span className="text-right tabular-nums font-semibold text-foreground border-t border-border pt-0.5">{formatMontant(c.totalDoc)}</span>
            <span className="text-right tabular-nums font-semibold text-foreground border-t border-border pt-0.5">{formatMontant(c.totalCRM)}</span>
            <span className="text-right tabular-nums border-t border-border pt-0.5"><Ecart ecart={c.totalDoc - c.totalCRM} /></span>
          </>)}
        </div>
      </div>

      {c.horsComparaison > 0 && (
        <p className="text-[11px] text-warning">
          {c.horsComparaison} ligne(s) sans prix comparable : le montant CRM ne porte que sur le reste, et le total n'est pas annoncé.
        </p>
      )}
      {c.portFiche === undefined && c.portDoc > 0 && c.totalCRM !== undefined && (
        <p className="text-[11px] text-muted-foreground">La fiche ne prévoit pas ce transport : le total CRM reprend celui du document.</p>
      )}
      {c.ecartTotalEcrit !== undefined && (
        <p className="text-[11px] text-warning">
          Le total HT écrit sur le document diffère de {formatMontant(c.ecartTotalEcrit)} des lignes lues (éco-contribution, remise, ligne non lue…).
        </p>
      )}
    </div>
  );
}

function FragmentKit({ k, onReporter }: { k: KitCompare; onReporter: (k: KitCompare, prix: number) => void }) {
  const report = reportDuKit(k);
  return (
    <>
      <tr className="border-t border-border align-top bg-primary/5">
        <td className="px-2 py-1">
          <div className="font-semibold">Kit {designationProduit(k.kit)}</div>
          <div className="text-[10px] text-muted-foreground">
            {k.kit.reference} · {k.origine === 'composants' ? 'composants de la fiche' : 'parties annoncées par son libellé'}
            {k.sommePartiesCRM !== undefined ? ` · parties au CRM : ${formatMontant(k.sommePartiesCRM)}` : ''}
            {k.prixLien !== undefined ? ` · lien fournisseur ${formatMontant(k.prixLien)}` : ''}
          </div>
          {report?.prix !== undefined && (
            <Button type="button" variant="outline" size="sm" className="h-6 mt-1 px-2 text-[11px]" onClick={() => onReporter(k, report.prix!)}>
              Reporter {formatMontant(report.prix)} sur la fiche du kit
            </Button>
          )}
          {report?.raison && <div className="text-[10px] text-muted-foreground mt-0.5">{report.raison}</div>}
        </td>
        <td className="px-2 py-1 text-right tabular-nums font-semibold">{k.nombre}</td>
        <td className="px-2 py-1 text-right tabular-nums font-semibold">{prix(k.prixDoc)}</td>
        <td className="px-2 py-1 text-right tabular-nums font-semibold">{prix(k.prixCRM)}</td>
        <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap"><Ecart ecart={k.ecart} pct={k.ecartPct} /></td>
      </tr>
      {k.lignes.map(l => <Ligne key={l.indice} l={l} partie />)}
    </>
  );
}
