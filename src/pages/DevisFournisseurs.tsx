import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import PageHeaderSlot from '@/components/PageHeaderSlot';
import RowActionsMenu from '@/components/RowActionsMenu';
import { useCRM } from '@/lib/StoreContext';
import { useCurrentUser } from '@/hooks/useAuth';
import { formatMontant, formatDate } from '@/lib/store';
import {
  useDevisFournisseur, STATUT_DEVIS_FOURNISSEUR, type DevisFournisseur,
} from '@/lib/devisFournisseur';
import { exportToExcel } from '@/lib/exportExcel';
import {
  Search, ChevronRight, ChevronDown, AlertCircle, FileSearch, Trash2,
  Archive, CheckCircle2, Download, Loader2,
} from 'lucide-react';

/**
 * Les offres de prix reçues des fournisseurs.
 *
 * Une page de consultation, pas de saisie : ces devis entrent par l'analyse de
 * document, qui sait lire un PDF et en tirer les lignes. Ce qu'on vient
 * chercher ici, c'est ce qu'on a reçu et ce qu'on en a fait — un tarif lu mais
 * non appliqué est justement ce qui ne se voyait nulle part.
 */

/** Ce que la ligne dit de son sort. */
const ETIQUETTE_ACTION: Record<string, { label: string; color: string }> = {
  actualiser: { label: 'Prix modifié',   color: 'bg-warning/10 text-warning' },
  rattacher:  { label: 'À rattacher',    color: 'bg-info/10 text-info' },
  inchange:   { label: 'Inchangé',       color: 'bg-muted text-muted-foreground' },
  absent:     { label: 'Hors catalogue', color: 'bg-destructive/10 text-destructive' },
  sans_prix:  { label: 'Sans prix',      color: 'bg-muted text-muted-foreground' },
};

export default function DevisFournisseurs() {
  const { fournisseurs, produits } = useCRM();
  const { canAchat } = useCurrentUser();
  const { devis, chargement, erreur, recharger, supprimer, changerStatut } = useDevisFournisseur();

  const [search, setSearch] = useState('');
  const [filtreStatut, setFiltreStatut] = useState<'tous' | DevisFournisseur['statut']>('tous');
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());

  const nomFournisseur = (d: DevisFournisseur) =>
    fournisseurs.find(f => f.id === d.fournisseurId)?.nom || d.fournisseurNom || '—';

  const produitParId = useMemo(() => {
    const m = new Map(produits.map(p => [p.id, p]));
    return (id?: string) => (id ? m.get(id) : undefined);
  }, [produits]);

  const filtres = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devis
      .filter(d => filtreStatut === 'tous' || d.statut === filtreStatut)
      .filter(d => !q || [
        nomFournisseur(d), d.numero, d.reference,
        ...d.lignes.map(l => `${l.reference || ''} ${l.designation || ''}`),
      ].some(v => (v || '').toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devis, search, filtreStatut, fournisseurs]);

  const basculer = (id: string) => setOuverts(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  const exporter = () => exportToExcel(
    filtres.flatMap(d => d.lignes.map(l => ({
      Fournisseur: nomFournisseur(d),
      Devis: d.numero || '',
      Date: d.dateDocument ? formatDate(d.dateDocument) : '',
      Référence: l.reference || '',
      Désignation: l.designation || '',
      Quantité: l.quantite ?? '',
      'Prix achat': l.prixAchat ?? '',
      Article: produitParId(l.produitId)?.reference || '',
      Sort: ETIQUETTE_ACTION[l.action || '']?.label || '',
      Appliqué: l.applique ? 'oui' : 'non',
    }))),
    'devis-fournisseurs',
  );

  const compte = (s: DevisFournisseur['statut']) => devis.filter(d => d.statut === s).length;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <PageHeaderSlot>
        <div className="relative w-32 sm:w-48 md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Fournisseur, n°, article…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Button onClick={exporter} size="sm" variant="outline" className="ml-auto shrink-0" disabled={!filtres.length}>
          <Download className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Excel</span>
        </Button>
      </PageHeaderSlot>

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFiltreStatut('tous')}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filtreStatut === 'tous' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
        >
          Tous ({devis.length})
        </button>
        {(Object.keys(STATUT_DEVIS_FOURNISSEUR) as DevisFournisseur['statut'][]).map(s => (
          <button
            key={s}
            onClick={() => setFiltreStatut(s)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filtreStatut === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
          >
            {STATUT_DEVIS_FOURNISSEUR[s].label} ({compte(s)})
          </button>
        ))}
      </div>

      {/* Une lecture en échec ne doit pas ressembler à une liste vide. */}
      {erreur && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-destructive">Les devis fournisseur n'ont pas pu être lus.</p>
            <p className="text-muted-foreground text-xs mt-0.5">{erreur}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void recharger()}>Réessayer</Button>
        </div>
      )}

      <div className="md:flex md:flex-col flex-1 min-h-0 bg-card rounded-xl border overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="sticky top-0 z-10 bg-muted w-8" />
                <th className="sticky top-0 z-10 bg-muted text-left font-medium px-3 py-2">Fournisseur</th>
                <th className="sticky top-0 z-10 bg-muted text-left font-medium px-3 py-2">N°</th>
                <th className="sticky top-0 z-10 bg-muted text-left font-medium px-3 py-2 hidden sm:table-cell">Date</th>
                <th className="sticky top-0 z-10 bg-muted text-right font-medium px-3 py-2">Articles</th>
                <th className="sticky top-0 z-10 bg-muted text-right font-medium px-3 py-2 hidden md:table-cell">Appliqués</th>
                {canAchat && <th className="sticky top-0 z-10 bg-muted text-right font-medium px-3 py-2 hidden sm:table-cell">Total HT</th>}
                <th className="sticky top-0 z-10 bg-muted text-left font-medium px-3 py-2">Statut</th>
                <th className="sticky top-0 z-10 bg-muted w-10" />
              </tr>
            </thead>
            <tbody>
              {chargement && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Chargement…
                </td></tr>
              )}

              {!chargement && !filtres.length && (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                  <FileSearch className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  {devis.length
                    ? 'Aucun devis ne correspond à cette recherche.'
                    : "Aucun devis fournisseur. Ils arrivent par l'analyse de document."}
                </td></tr>
              )}

              {filtres.map(d => {
                const ouvert = ouverts.has(d.id);
                const appliquees = d.lignes.filter(l => l.applique).length;
                return [
                  <tr
                    key={d.id}
                    className="border-b hover:bg-muted/40 cursor-pointer"
                    onClick={() => basculer(d.id)}
                  >
                    <td className="px-2 py-2 text-muted-foreground">
                      {ouvert ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </td>
                    <td className="px-3 py-2 font-medium">{nomFournisseur(d)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{d.numero || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">
                      {d.dateDocument ? formatDate(d.dateDocument) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.lignes.length}</td>
                    <td className="px-3 py-2 text-right tabular-nums hidden md:table-cell">
                      <span className={appliquees ? '' : 'text-muted-foreground'}>
                        {appliquees}/{d.lignes.length}
                      </span>
                    </td>
                    {canAchat && (
                      <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">
                        {d.totalHT != null ? formatMontant(d.totalHT) : '—'}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUT_DEVIS_FOURNISSEUR[d.statut].color}`}>
                        {STATUT_DEVIS_FOURNISSEUR[d.statut].label}
                      </span>
                    </td>
                    <td className="px-1 py-2" onClick={e => e.stopPropagation()}>
                      <RowActionsMenu actions={[
                        {
                          icon: <Archive className="w-4 h-4" />, label: 'Archiver',
                          hidden: d.statut === 'archive',
                          onClick: () => void changerStatut(d.id, 'archive'),
                        },
                        {
                          icon: <CheckCircle2 className="w-4 h-4" />, label: 'Remettre en reçu',
                          hidden: d.statut !== 'archive',
                          onClick: () => void changerStatut(d.id, 'recu'),
                        },
                        {
                          icon: <Trash2 className="w-4 h-4" />, label: 'Supprimer', danger: true,
                          onClick: () => {
                            if (confirm(`Supprimer ce devis fournisseur et ses ${d.lignes.length} ligne(s) ?`)) {
                              void supprimer(d.id);
                            }
                          },
                        },
                      ]} />
                    </td>
                  </tr>,

                  ouvert && (
                    <tr key={`${d.id}-lignes`} className="border-b bg-muted/20">
                      <td colSpan={9} className="px-3 py-3">
                        {!d.lignes.length ? (
                          <p className="text-muted-foreground text-xs">Ce devis ne porte aucune ligne.</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="text-left font-medium py-1 pr-3">Réf. fournisseur</th>
                                <th className="text-left font-medium py-1 pr-3">Désignation</th>
                                <th className="text-right font-medium py-1 pr-3">Qté</th>
                                {canAchat && <th className="text-right font-medium py-1 pr-3">Prix achat</th>}
                                <th className="text-left font-medium py-1 pr-3">Article MonCRM</th>
                                <th className="text-left font-medium py-1">Sort</th>
                              </tr>
                            </thead>
                            <tbody>
                              {d.lignes.map(l => {
                                const article = produitParId(l.produitId);
                                const etiquette = ETIQUETTE_ACTION[l.action || ''];
                                return (
                                  <tr key={l.id} className="border-t border-border/50">
                                    <td className="py-1 pr-3 font-mono">{l.reference || '—'}</td>
                                    <td className="py-1 pr-3">{l.designation || '—'}</td>
                                    <td className="py-1 pr-3 text-right tabular-nums">{l.quantite ?? '—'}</td>
                                    {canAchat && (
                                      <td className="py-1 pr-3 text-right tabular-nums">
                                        {l.prixAchat != null ? formatMontant(l.prixAchat) : '—'}
                                      </td>
                                    )}
                                    <td className="py-1 pr-3">
                                      {article
                                        ? <span title={article.description}>{article.reference}</span>
                                        : <span className="text-muted-foreground">non rattaché</span>}
                                    </td>
                                    <td className="py-1">
                                      <div className="flex items-center gap-1.5">
                                        {etiquette && (
                                          <span className={`px-1.5 py-0.5 rounded ${etiquette.color}`}>
                                            {etiquette.label}
                                          </span>
                                        )}
                                        {l.applique && (
                                          <span className="text-success inline-flex items-center gap-0.5">
                                            <CheckCircle2 className="w-3 h-3" />
                                            appliqué{l.appliqueLe ? ` le ${formatDate(l.appliqueLe)}` : ''}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
