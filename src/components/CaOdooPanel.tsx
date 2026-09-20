import { useState } from 'react';
import { TrendingUp, ExternalLink, ChevronDown, ChevronRight, CalendarDays } from 'lucide-react';
import { formatMontant } from '@/lib/store';
import { useCaOdoo, CA_ODOO_URL, type CaMarque, type CaMois } from '@/lib/caOdoo';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

// ─── Tuile « CA Odoo » du tableau de bord ────────────────────────────────────
//
// Résumé du tableau de bord CA par client : 2026 à date face à 2025 à date, et
// la projection fin d'année — au total puis par marque.
//
// ⚠️ Les sous-lignes « dont … » sont DÉJÀ COMPRISES dans le total de leur
// marque (ISOFLOOR dans ISOMARK ; STI et RTE dans ISOSIGN). Elles s'affichent en
// retrait, en italique : ne jamais les additionner au-dessus.
//
// ⚠️ La tuile ne s'affiche pas du tout sans le droit « Accès CA » — la requête
// ne renvoie alors aucune ligne (RLS), et `autorise` est faux.

function pct(avant: number, apres: number) {
  if (!avant) return apres > 0 ? 1 : 0;
  return (apres - avant) / avant;
}

function formatPct(v: number) {
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1).replace('.', ',')} %`;
}

function formatJour(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function Evolution({ avant, apres }: { avant: number; apres: number }) {
  const p = pct(avant, apres);
  return (
    <span className={p >= 0 ? 'text-green-600' : 'text-destructive'}>{formatPct(p)}</span>
  );
}

function LigneMarque({ m }: { m: CaMarque }) {
  return (
    <>
      <tr className="border-b border-border/50">
        <td className="py-2 pr-3 font-medium">{m.label}</td>
        <td className="py-2 px-3 text-right tabular-nums">{formatMontant(m.ca26)}</td>
        <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{formatMontant(m.ca25)}</td>
        <td className="py-2 px-3 text-right tabular-nums font-medium"><Evolution avant={m.ca25} apres={m.ca26} /></td>
        <td className="py-2 pl-3 text-right tabular-nums font-semibold">{formatMontant(m.projection)}</td>
      </tr>
      {m.donts
        .filter(d => d.ca26 !== 0 || d.ca25 !== 0 || d.projection !== 0)
        .map(d => (
          <tr key={d.key} className="border-b border-border/50 text-xs italic text-muted-foreground">
            <td className="py-1.5 pr-3 pl-4">{d.label}</td>
            <td className="py-1.5 px-3 text-right tabular-nums">{formatMontant(d.ca26)}</td>
            <td className="py-1.5 px-3 text-right tabular-nums">{formatMontant(d.ca25)}</td>
            <td className="py-1.5 px-3 text-right tabular-nums"><Evolution avant={d.ca25} apres={d.ca26} /></td>
            <td className="py-1.5 pl-3 text-right tabular-nums">{formatMontant(d.projection)}</td>
          </tr>
        ))}
    </>
  );
}

const NOM_MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

/**
 * Détail mensuel du réalisé 2026, ouvert au clic sur la carte « CA 2026 à date ».
 *
 * ⚠️ Les colonnes « dont » (ISOFLOOR sous ISOMARK, STI et RTE sous ISOSIGN)
 * sont DÉJÀ COMPRISES dans leur marque : ISOMARK + ISOSIGN = Total, les
 * sous-détails ne s'y ajoutent pas.
 */
function DetailMensuel({ mois, cutoff }: { mois: CaMois[]; cutoff: string | null }) {
  if (!mois.length) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Le détail mensuel n'est pas encore disponible : il apparaîtra après la prochaine
        actualisation des données.
      </p>
    );
  }

  const cumul = mois.reduce(
    (a, m) => ({
      isomark: a.isomark + m.isomark, isofloor: a.isofloor + m.isofloor,
      isosign: a.isosign + m.isosign, sti: a.sti + m.sti, rte: a.rte + m.rte,
      total: a.total + m.total,
    }),
    { isomark: 0, isofloor: 0, isosign: 0, sti: 0, rte: 0, total: 0 },
  );

  const dernierMois = mois[mois.length - 1]?.mois;
  const jour = cutoff ? Number(cutoff.slice(8, 10)) : null;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="py-2 pr-3 font-medium">Mois</th>
              <th className="py-2 px-3 font-medium text-right">ISOMARK</th>
              <th className="py-2 px-3 font-medium text-right text-xs italic">dont ISOFLOOR</th>
              <th className="py-2 px-3 font-medium text-right">ISOSIGN</th>
              <th className="py-2 px-3 font-medium text-right text-xs italic">dont STI</th>
              <th className="py-2 px-3 font-medium text-right text-xs italic">dont RTE</th>
              <th className="py-2 pl-3 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {mois.map(m => (
              <tr key={m.mois} className="border-b border-border/50">
                <td className="py-2 pr-3 font-medium whitespace-nowrap">
                  {NOM_MOIS[m.mois - 1] ?? m.mois}
                  {m.mois === dernierMois && jour && (
                    <span className="text-xs text-muted-foreground font-normal"> (au {jour})</span>
                  )}
                </td>
                <td className="py-2 px-3 text-right tabular-nums">{formatMontant(m.isomark)}</td>
                <td className="py-2 px-3 text-right tabular-nums text-xs italic text-muted-foreground">{formatMontant(m.isofloor)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{formatMontant(m.isosign)}</td>
                <td className="py-2 px-3 text-right tabular-nums text-xs italic text-muted-foreground">{formatMontant(m.sti)}</td>
                <td className="py-2 px-3 text-right tabular-nums text-xs italic text-muted-foreground">{formatMontant(m.rte)}</td>
                <td className="py-2 pl-3 text-right tabular-nums font-medium">{formatMontant(m.total)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2 pr-3">Cumul</td>
              <td className="py-2 px-3 text-right tabular-nums">{formatMontant(cumul.isomark)}</td>
              <td className="py-2 px-3 text-right tabular-nums text-xs italic">{formatMontant(cumul.isofloor)}</td>
              <td className="py-2 px-3 text-right tabular-nums">{formatMontant(cumul.isosign)}</td>
              <td className="py-2 px-3 text-right tabular-nums text-xs italic">{formatMontant(cumul.sti)}</td>
              <td className="py-2 px-3 text-right tabular-nums text-xs italic">{formatMontant(cumul.rte)}</td>
              <td className="py-2 pl-3 text-right tabular-nums">{formatMontant(cumul.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Les colonnes en italique sont <b className="text-foreground">déjà comprises</b> dans leur
        marque : ISOMARK + ISOSIGN donne le total, les sous-détails ne s'y ajoutent pas.
        Le mensuel ne couvre que <b className="text-foreground">2026</b> : le CA 2025 du STI est figé
        au niveau de l'année sur le fichier client, il n'existe pas mois par mois — en afficher un
        découpage reviendrait à publier les chiffres d'Odoo, ceux qu'on corrige justement.
      </p>
    </div>
  );
}

export default function CaOdooPanel() {
  const { data, loading, autorise } = useCaOdoo();
  const [methodeOuverte, setMethodeOuverte] = useState(false);
  const [mensuelOuvert, setMensuelOuvert] = useState(false);

  if (loading || !autorise || !data) return null;

  const periode = `01/01 → ${formatJour(data.cutoff)}`;

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" /> CA Odoo — facturé par marque
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {periode} · 2026 vs 2025 à date · {data.nbClients} clients · source Odoo, avoirs déduits
          </p>
        </div>
        <a
          href={CA_ODOO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Détail par client
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Cliquable : ouvre le détail mensuel. C'est un <button> et non une
            <div> avec onClick, pour rester atteignable au clavier. */}
        <button
          type="button"
          onClick={() => setMensuelOuvert(true)}
          title="Voir le détail mois par mois"
          className="rounded-lg border border-border p-3 text-left hover:border-primary/50 hover:bg-muted/40 transition-colors group"
        >
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1.5">
            CA 2026 à date
            <CalendarDays className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
          </p>
          <p className="text-xl font-semibold tabular-nums mt-1">{formatMontant(data.ca26)}</p>
          <p className="text-xs mt-0.5"><Evolution avant={data.ca25ytd} apres={data.ca26} /> vs 2025</p>
        </button>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">CA 2025 à date</p>
          <p className="text-xl font-semibold tabular-nums mt-1 text-muted-foreground">{formatMontant(data.ca25ytd)}</p>
          <p className="text-xs mt-0.5 text-muted-foreground">année pleine : {formatMontant(data.ca25full)}</p>
        </div>
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Projection fin 2026</p>
          <p className="text-xl font-semibold tabular-nums mt-1 text-primary">{formatMontant(data.projection)}</p>
          <p className="text-xs mt-0.5"><Evolution avant={data.ca25full} apres={data.projection} /> vs 2025 pleine</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="py-2 pr-3 font-medium">Marque</th>
              <th className="py-2 px-3 font-medium text-right">CA 2026</th>
              <th className="py-2 px-3 font-medium text-right">CA 2025</th>
              <th className="py-2 px-3 font-medium text-right">Écart</th>
              <th className="py-2 pl-3 font-medium text-right">Projection FY26</th>
            </tr>
          </thead>
          <tbody>
            {data.marques.map(m => <LigneMarque key={m.key} m={m} />)}
            <tr className="font-semibold">
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 px-3 text-right tabular-nums">{formatMontant(data.ca26)}</td>
              <td className="py-2 px-3 text-right tabular-nums">{formatMontant(data.ca25ytd)}</td>
              <td className="py-2 px-3 text-right tabular-nums"><Evolution avant={data.ca25ytd} apres={data.ca26} /></td>
              <td className="py-2 pl-3 text-right tabular-nums">{formatMontant(data.projection)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Méthode repliée par défaut : elle est longue, et on ne la relit pas
          tous les jours — mais elle doit rester à un clic, sans quoi les
          chiffres deviennent des chiffres qu'on ne sait plus interpréter. */}
      <div className="rounded-lg border border-border bg-muted/30">
        <button
          type="button"
          onClick={() => setMethodeOuverte(o => !o)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-left hover:bg-muted/50 rounded-lg transition-colors"
        >
          {methodeOuverte
            ? <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
            : <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />}
          Méthode de calcul
        </button>
        {methodeOuverte && (
          <div className="px-3 pb-3 pt-1 text-xs text-muted-foreground leading-relaxed space-y-2">
            <p>
              <b className="text-foreground">Périmètre.</b> CA 2026 relevé en temps réel via l'API Odoo,
              avoirs et notes de crédit déduits, vendeur = François MOUHOT. Le CA STI 2025 reste figé sur
              les données réelles (rapport commercial + fichier client) car Odoo sous-estime fortement le
              STI sur cette période.
            </p>
            <p>
              <b className="text-foreground">Marques.</b> ISOMARK = catégorie Odoo « ISOMARK » +
              sous-catégorie « FLOORING » (résine ISOFLOOR). ISOSIGN regroupe la signalisation verticale,
              le transport et les lignes hors catégorie, la gamme plastique STI et le RTE. Les sous-lignes
              « dont … » sont <b className="text-foreground">déjà comprises</b> dans le total de leur
              marque — ne pas les additionner : ce qui reste d'ISOSIGN une fois STI et RTE retirés est la
              signalisation verticale elle-même.
            </p>
            <p>
              <b className="text-foreground">Projection.</b> Calculée par client : CA 2026 à date + reste à
              courir estimé (CA 2025 année pleine − CA 2025 à date, jamais négatif, avec la pondération
              mensuelle propre à chaque client), ajusté par un taux de croissance mixte combinant
              l'évolution du client à date — pondérée par sa crédibilité selon son historique 2025 — et le
              taux de croissance global observé ({formatPct(data.tauxCroissance)}), borné pour rester
              réaliste. Jamais en-dessous du CA déjà facturé. La projection par marque répartit le reste à
              courir du client au prorata de celui de chaque marque, pour que la somme retombe exactement
              sur la projection globale.
            </p>
            <p>
              <b className="text-foreground">Actualisation.</b> Les chiffres proviennent du dernier
              ACTUALISER.bat lancé sur le poste du bureau
              {data.publieLe ? ` (publié le ${new Date(data.publieLe).toLocaleString('fr-FR')})` : ''}.
              Ils ne se rafraîchissent pas tout seuls.
            </p>
          </div>
        )}
      </div>

      <Dialog open={mensuelOuvert} onOpenChange={setMensuelOuvert}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Réalisé mensuel 2026</DialogTitle>
            <DialogDescription>
              CA facturé mois par mois, du 01/01 au {formatJour(data.cutoff)} — source Odoo,
              avoirs déduits.
            </DialogDescription>
          </DialogHeader>
          <DetailMensuel mois={data.mois} cutoff={data.cutoff} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
