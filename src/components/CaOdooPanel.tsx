import { useState } from 'react';
import { TrendingUp, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { formatMontant } from '@/lib/store';
import { useCaOdoo, CA_ODOO_URL, type CaMarque } from '@/lib/caOdoo';

// ─── Tuile « CA Odoo » du tableau de bord ────────────────────────────────────
//
// Résumé du tableau de bord CA par client : 2026 à date face à 2025 à date, et
// la projection fin d'année — au total puis par marque.
//
// ⚠️ Les sous-lignes « dont … » sont DÉJÀ COMPRISES dans le total de leur
// marque (ISOFLOOR dans ISOMARK, STI dans ISOSIGN). Elles s'affichent en
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
      {m.dont && (m.dont.ca26 !== 0 || m.dont.ca25 !== 0) && (
        <tr className="border-b border-border/50 text-xs italic text-muted-foreground">
          <td className="py-1.5 pr-3 pl-4">{m.dont.label}</td>
          <td className="py-1.5 px-3 text-right tabular-nums">{formatMontant(m.dont.ca26)}</td>
          <td className="py-1.5 px-3 text-right tabular-nums">{formatMontant(m.dont.ca25)}</td>
          <td className="py-1.5 px-3 text-right tabular-nums"><Evolution avant={m.dont.ca25} apres={m.dont.ca26} /></td>
          <td className="py-1.5 pl-3 text-right tabular-nums">{formatMontant(m.dont.projection)}</td>
        </tr>
      )}
    </>
  );
}

export default function CaOdooPanel() {
  const { data, loading, autorise } = useCaOdoo();
  const [methodeOuverte, setMethodeOuverte] = useState(false);

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
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">CA 2026 à date</p>
          <p className="text-xl font-semibold tabular-nums mt-1">{formatMontant(data.ca26)}</p>
          <p className="text-xs mt-0.5"><Evolution avant={data.ca25ytd} apres={data.ca26} /> vs 2025</p>
        </div>
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
              marque — ne pas les additionner.
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
    </div>
  );
}
