import { useState } from 'react';
import { TrendingUp, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { formatMontant } from '@/lib/store';
import { useCaOdoo, CA_ODOO_URL, type CaMarque, type CaMois, type CaMois2025, type CaMoisEnCours } from '@/lib/caOdoo';

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

function EcartMontant({ a, b }: { a: number; b: number }) {
  const d = a - b;
  return (
    <span className={d >= 0 ? 'text-green-600' : 'text-destructive'}>
      {d >= 0 ? '+' : ''}{formatMontant(d)}
      {b !== 0 && <span className="block text-[10.5px]">{formatPct(d / Math.abs(b))}</span>}
    </span>
  );
}

const NOM_MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

/**
 * Détail mensuel du réalisé 2026, affiché d'office sous le tableau des marques.
 *
 * ⚠️ Les colonnes « dont » (ISOFLOOR sous ISOMARK, STI et RTE sous ISOSIGN)
 * sont DÉJÀ COMPRISES dans leur marque : ISOMARK + ISOSIGN = Total, les
 * sous-détails ne s'y ajoutent pas.
 *
 * Le total 2025 de chaque mois vient du fichier du rapport commercial, STI
 * compris, pas d'Odoo (voir `CaMois2025`). Le mois en cours n'a pas d'écart : face au
 * mois 2025 complet il serait faux, le N-1 à même date est dans le bloc suivant.
 */
function DetailMensuel({ mois, mois2025, cutoff }: { mois: CaMois[]; mois2025: CaMois2025[]; cutoff: string | null }) {
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

  const n1 = new Map(mois2025.map(m => [m.mois, m]));
  const avecN1 = n1.size > 0;
  // Mois clos : tout mois affiché sauf celui de l'arrêté, encore en cours.
  const clos = mois.filter(m => m.mois !== dernierMois && n1.has(m.mois));
  const clos26 = clos.reduce((a, m) => a + m.total, 0);
  const clos25 = clos.reduce((a, m) => a + (n1.get(m.mois)?.total ?? 0), 0);

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
              {avecN1 && <th className="py-2 pl-3 font-medium text-right">Total 2025</th>}
              {avecN1 && <th className="py-2 pl-3 font-medium text-right">Écart</th>}
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
                {avecN1 && (
                  <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground">
                    {n1.has(m.mois) ? formatMontant(n1.get(m.mois)!.total) : '—'}
                  </td>
                )}
                {avecN1 && (
                  <td className="py-2 pl-3 text-right tabular-nums">
                    {m.mois === dernierMois || !n1.has(m.mois)
                      ? <span className="text-xs italic text-muted-foreground">en cours</span>
                      : <EcartMontant a={m.total} b={n1.get(m.mois)!.total} />}
                  </td>
                )}
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
              {avecN1 && <td />}
              {avecN1 && <td />}
            </tr>
            {avecN1 && clos.length > 0 && (
              <tr className="font-semibold border-t border-border">
                <td className="py-2 pr-3 whitespace-nowrap">
                  Cumul mois clos{' '}
                  <span className="text-xs text-muted-foreground font-normal">
                    ({NOM_MOIS[clos[0].mois - 1]?.toLowerCase()} → {NOM_MOIS[clos[clos.length - 1].mois - 1]?.toLowerCase()})
                  </span>
                </td>
                <td colSpan={5} />
                <td className="py-2 pl-3 text-right tabular-nums">{formatMontant(clos26)}</td>
                <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground">{formatMontant(clos25)}</td>
                <td className="py-2 pl-3 text-right tabular-nums"><EcartMontant a={clos26} b={clos25} /></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Les colonnes en italique sont <b className="text-foreground">déjà comprises</b> dans leur
        marque : ISOMARK + ISOSIGN donne le total, les sous-détails ne s'y ajoutent pas.{' '}
        {avecN1 ? (
          <>
            Le <b className="text-foreground">total 2025</b> est celui du rapport commercial (fichier
            « CA ISOSIGN 2025 y compris STI »), STI compris — pas celui d'Odoo, faux sur le STI 2025.
            Le mois en cours se compare à même date dans le bloc ci-dessous.
          </>
        ) : (
          <>Le comparatif 2025 apparaîtra à la prochaine actualisation.</>
        )}
      </p>
    </div>
  );
}

type Colonnes = { isomark: number; isofloor: number | null; isosign: number; sti: number | null; rte: number | null; total: number };
const COLS = ['isomark', 'isofloor', 'isosign', 'sti', 'rte', 'total'] as const;
const DONT = new Set(['isofloor', 'sti', 'rte']);

const STATUT_CDE: Record<string, string> = {
  dans_le_mois: 'prévue ce mois',
  retard: 'en retard',
  au_dela: 'prévue après le mois',
  sans_date: 'sans date',
  retard_ancien: 'retard ancien',
};

function celluleClasse(k: string, extra = '') {
  return `py-1.5 px-3 text-right tabular-nums ${DONT.has(k) ? 'text-xs italic text-muted-foreground' : ''} ${extra}`;
}

function LigneMontants({ libelle, m, horsSti, className = '' }: {
  libelle: React.ReactNode; m: Colonnes; horsSti?: boolean; className?: string;
}) {
  return (
    <tr className={`border-b border-border/50 ${className}`}>
      <td className="py-1.5 pr-3 whitespace-nowrap">{libelle}</td>
      {COLS.map(k => (
        <td key={k} className={celluleClasse(k)}>
          {m[k] === null ? <span className="text-xs italic">n.c.</span> : formatMontant(m[k] as number)}
          {horsSti && (k === 'isosign' || k === 'total') && <sup>*</sup>}
        </td>
      ))}
    </tr>
  );
}

function LigneEcart({ libelle, a, b }: { libelle: React.ReactNode; a: Colonnes; b: Colonnes }) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-1.5 pr-3 whitespace-nowrap">{libelle}</td>
      {COLS.map(k => {
        const x = a[k], y = b[k];
        if (x === null || y === null) {
          return <td key={k} className={celluleClasse(k)}><span className="text-xs italic">n.c.</span></td>;
        }
        const d = x - y;
        return (
          <td key={k} className={celluleClasse(k, d >= 0 ? '!text-green-600' : '!text-destructive')}>
            {d >= 0 ? '+' : ''}{formatMontant(d)}
            {y !== 0 && <div className="text-[10.5px]">{formatPct(d / Math.abs(y))}</div>}
          </td>
        );
      })}
    </tr>
  );
}

/**
 * Mois en cours : facturé 2026 à date, face au même mois 2025 à la même date,
 * puis estimation de fin de mois (prêt à facturer + commandes à livrer).
 *
 * ⚠️ Le STI 2025 d'Odoo est faux : la fonction ne le publie pas. ISOSIGN et le
 * total 2025 arrivent HORS STI, et le 2026 est ramené hors STI pour les écarts —
 * jamais un STI 2026 réel contre un STI 2025 faux.
 */
function MoisEnCours({ mec }: { mec: CaMoisEnCours }) {
  const nom = NOM_MOIS[mec.mois - 1] ?? String(mec.mois);
  const horsSti = (m: CaMois): Colonnes => ({ ...m, isosign: m.isosign - m.sti, total: m.total - m.sti, sti: null });
  const e = mec.estimation;
  const fin = 'fin_mois' in e ? Number(e.fin_mois.slice(8, 10)) : null;
  // Depuis que la fonction publie le STI réel mensuel, le mois 2025 complet le
  // porte : l'estimation s'y compare alors STI compris. Jeu plus ancien : hors STI.
  const completHorsSti = mec.mois25_complet.sti === null;

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">
        {nom} 2026 en cours{' '}
        <span className="font-normal text-muted-foreground text-xs">
          — comparaison N-1 au {mec.jour} et estimation de fin de mois
        </span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="py-2 pr-3 font-medium" />
              <th className="py-2 px-3 font-medium text-right">ISOMARK</th>
              <th className="py-2 px-3 font-medium text-right text-xs italic">dont ISOFLOOR</th>
              <th className="py-2 px-3 font-medium text-right">ISOSIGN</th>
              <th className="py-2 px-3 font-medium text-right text-xs italic">dont STI</th>
              <th className="py-2 px-3 font-medium text-right text-xs italic">dont RTE</th>
              <th className="py-2 px-3 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <LigneMontants libelle={`Facturé ${nom} 2026 au ${mec.jour}`} m={mec.mtd26} className="font-medium" />
            <LigneMontants libelle={`Facturé ${nom} 2025 au ${mec.jour}`} m={mec.mtd25} horsSti className="text-muted-foreground" />
            <LigneEcart libelle="Écart vs N-1 à même date*" a={horsSti(mec.mtd26)} b={mec.mtd25} />
            {'erreur' in e ? (
              <tr>
                <td colSpan={7} className="py-2 text-destructive text-xs">
                  Estimation de fin de mois indisponible : {e.erreur}
                </td>
              </tr>
            ) : (
              <>
                <LigneMontants libelle="+ Prêt à facturer (livré, non facturé)" m={e.pret_a_facturer} />
                <LigneMontants libelle={`+ Commandes à livrer d'ici le ${fin}`} m={e.a_livrer_fin_mois} />
                <LigneMontants libelle={`= Estimation fin ${nom.toLowerCase()}`} m={e.estimation} className="font-bold bg-muted/40" />
                <LigneMontants
                  libelle={completHorsSti ? `${nom} 2025 complet` : `${nom} 2025 complet (rapport commercial)`}
                  m={mec.mois25_complet} horsSti={completHorsSti} className="text-muted-foreground"
                />
                <LigneEcart
                  libelle={`Estimation vs ${nom.toLowerCase()} 2025${completHorsSti ? '*' : ''}`}
                  a={completHorsSti ? horsSti(e.estimation) : e.estimation} b={mec.mois25_complet}
                />
              </>
            )}
          </tbody>
        </table>
      </div>
      {!('erreur' in e) && (
        <>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <b className="text-foreground">Estimation</b> = facturé à date + prêt à facturer (lignes de
            commande livrées non facturées) + reste des commandes confirmées prévues au plus tard le {fin}
            {e.dont_retard ? ` (dont ${formatMontant(e.dont_retard)} en retard)` : ''}.{' '}
            <b className="text-foreground">Hors estimation</b> : {formatMontant(e.hors_estimation.au_dela_du_mois)} prévus
            après le mois, {formatMontant(e.hors_estimation.sans_date)} sans date,{' '}
            {formatMontant(e.hors_estimation.retard_ancien)} en retard de plus de {e.hors_estimation.retard_max_jours} jours
            (à vérifier). {e.nb_commandes} commandes en cours, montants HT.
            <br />* ISOSIGN et total 2025 sont <b className="text-foreground">hors STI</b> (le STI 2025 d'Odoo est faux, et
            le réel n'existe qu'au mois, pas au jour) ; ces écarts se calculent hors STI des deux côtés.
          </p>
          {e.commandes.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer font-medium py-1">
                Commandes prises en compte ({e.commandes.length})
              </summary>
              <div className="overflow-x-auto mt-1">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-left">
                      <th className="py-1.5 pr-2 font-medium">Commande</th>
                      <th className="py-1.5 px-2 font-medium">Client</th>
                      <th className="py-1.5 px-2 font-medium text-right">Date prévue</th>
                      <th className="py-1.5 px-2 font-medium text-right">Prêt à facturer</th>
                      <th className="py-1.5 px-2 font-medium text-right">À livrer ce mois</th>
                      <th className="py-1.5 px-2 font-medium text-right">Hors estimation</th>
                      <th className="py-1.5 pl-2 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.commandes.map(c => (
                      <tr key={c.commande} className="border-b border-border/50">
                        <td className="py-1 pr-2 whitespace-nowrap">{c.commande}</td>
                        <td className="py-1 px-2">{c.client}</td>
                        <td className="py-1 px-2 text-right tabular-nums">{c.date ? c.date.split('-').reverse().join('/') : '—'}</td>
                        <td className="py-1 px-2 text-right tabular-nums">{formatMontant(c.pret)}</td>
                        <td className="py-1 px-2 text-right tabular-nums">{formatMontant(c.a_livrer)}</td>
                        <td className="py-1 px-2 text-right tabular-nums">{formatMontant(c.reste)}</td>
                        <td className="py-1 pl-2 whitespace-nowrap text-muted-foreground">{STATUT_CDE[c.statut] ?? c.statut}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </div>
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

      {/* Réalisé mensuel affiché d'office sous le tableau des marques (plus de
          fenêtre à ouvrir) : c'est ce qu'on vient consulter, il doit se lire
          sans clic. Le mois en cours suit, avec son N-1 et son estimation. */}
      <section className="space-y-3 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">
          Réalisé mensuel 2026{' '}
          <span className="font-normal text-muted-foreground text-xs">
            — du 01/01 au {formatJour(data.cutoff)}, source Odoo, avoirs déduits
          </span>
        </h3>
        <DetailMensuel mois={data.mois} mois2025={data.mois2025} cutoff={data.cutoff} />
        {data.moisEnCours && <MoisEnCours mec={data.moisEnCours} />}
      </section>

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
              <b className="text-foreground">Actualisation.</b> Les chiffres proviennent de la dernière
              actualisation (bouton « Actualiser » du tableau de bord « Détail par client »)
              {data.publieLe ? ` — publiée le ${new Date(data.publieLe).toLocaleString('fr-FR')}` : ''}.
              Ils ne se rafraîchissent pas tout seuls.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
