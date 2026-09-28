import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import PageHeaderSlot from '@/components/PageHeaderSlot';
import RowActionsMenu from '@/components/RowActionsMenu';
import { useCRM } from '@/lib/StoreContext';
import { useCurrentUser } from '@/hooks/useAuth';
import { formatMontant, formatDate, generateId } from '@/lib/store';
import {
  proposerPrix, appliquerPrix, articleDepuisLigne, coefficientVente, prixVenteDepuisAchat,
  referencePrise, referenceLibre, type CibleEcriture,
} from '@/lib/prixAchatFournisseur';
import ProduitCombobox from '@/components/ProduitCombobox';
import { toast } from 'sonner';
import {
  useDevisFournisseur, STATUT_DEVIS_FOURNISSEUR, type DevisFournisseur,
} from '@/lib/devisFournisseur';
import { exportToExcel } from '@/lib/exportExcel';
import {
  Search, ChevronRight, ChevronDown, AlertCircle, FileSearch, Trash2,
  Archive, CheckCircle2, Download, Loader2, Check, Pencil, X, PlusCircle, Unlink,
} from 'lucide-react';

/**
 * Les offres de prix reçues des fournisseurs.
 *
 * Une page de consultation, pas de saisie : ces devis entrent par l'analyse de
 * document, qui sait lire un PDF et en tirer les lignes. Ce qu'on vient
 * chercher ici, c'est ce qu'on a reçu et ce qu'on en a fait — un tarif lu mais
 * non appliqué est justement ce qui ne se voyait nulle part.
 */

const horodateJour = () => new Date().toISOString().split('T')[0];

/** Ce que la ligne dit de son sort. */
const ETIQUETTE_ACTION: Record<string, { label: string; color: string }> = {
  actualiser: { label: 'Prix modifié',   color: 'bg-warning/10 text-warning' },
  rattacher:  { label: 'À rattacher',    color: 'bg-info/10 text-info' },
  inchange:   { label: 'Inchangé',       color: 'bg-muted text-muted-foreground' },
  absent:     { label: 'Hors catalogue', color: 'bg-destructive/10 text-destructive' },
  sans_prix:  { label: 'Sans prix',      color: 'bg-muted text-muted-foreground' },
};

export default function DevisFournisseurs() {
  const {
    fournisseurs, produits, produitFournisseurs,
    updateProduits, updateProduitFournisseurs, creerProduits,
  } = useCRM();
  const { canAchat } = useCurrentUser();
  const {
    devis, chargement, erreur, recharger, supprimer, changerStatut, marquerAppliquees,
    rattacherLigne,
  } = useDevisFournisseur();

  const [search, setSearch] = useState('');
  const [filtreStatut, setFiltreStatut] = useState<'tous' | DevisFournisseur['statut']>('tous');
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  /** Lignes cochées, par identifiant de ligne. */
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  /** Destination choisie, par devis. La fiche article reste à décocher. */
  const [versLien, setVersLien] = useState<Record<string, boolean>>({});
  const [versArticle, setVersArticle] = useState<Record<string, boolean>>({});
  const [enCours, setEnCours] = useState<string | null>(null);
  /** La ligne dont on corrige l'article, une à la fois. */
  const [edition, setEdition] = useState<string | null>(null);
  /** Ce qu'on saisit pour créer l'article de la ligne en cours d'édition. */
  const [nouvel, setNouvel] = useState<{ reference: string; designation: string; categorie: string }>(
    { reference: '', designation: '', categorie: '' });

  /** Les catégories du catalogue, pour la saisie d'un article neuf. */
  const categories = useMemo(
    () => [...new Set(produits.map(p => p.categorie).filter(Boolean) as string[])].sort(),
    [produits]);

  const editer = (l: DevisFournisseur['lignes'][number]) => {
    if (edition === l.id) { setEdition(null); return; }
    setEdition(l.id);
    setNouvel({
      reference: l.reference || '',
      designation: l.designation || '',
      /* La catégorie de l'article retenu à tort n'est pas une indication : on
         part de rien plutôt que de reconduire l'erreur. */
      categorie: '',
    });
  };

  /** Rattache la ligne à un article existant, ou la détache. */
  async function changerArticle(
    d: DevisFournisseur, l: DevisFournisseur['lignes'][number], produitId?: string, reference?: string,
  ) {
    const erreurRattache = await rattacherLigne(d.id, l.id, produitId);
    if (erreurRattache) { toast.error(`Rattachement refusé : ${erreurRattache}`); return; }
    setSelection(prev => ({ ...prev, [l.id]: !!produitId && l.prixAchat != null && l.prixAchat > 0 }));
    setEdition(null);
    const ref = reference ?? produitParId(produitId)?.reference;
    toast.success(produitId ? `Ligne rattachée à ${ref ?? "l'article"}.` : 'Ligne détachée.');
  }

  /** Crée l'article de la ligne, puis l'y rattache. */
  async function creerArticle(d: DevisFournisseur, l: DevisFournisseur['lignes'][number]) {
    if (!(l.prixAchat != null && l.prixAchat > 0)) { toast.error('La ligne ne porte pas de prix.'); return; }
    if (!nouvel.designation.trim()) { toast.error('Donnez une désignation.'); return; }

    /* LA RÉFÉRENCE EST UNIQUE EN BASE. Saisie à la main et déjà prise, c'est
       sans doute l'article qu'on cherchait : on le dit, et on propose de s'y
       rattacher plutôt que de créer un doublon. Déduite (référence fournisseur
       ou désignation), on la rend libre d'un suffixe. */
    const saisie = nouvel.reference.trim();
    const existant = saisie ? referencePrise(saisie, produits) : undefined;
    if (existant) {
      toast.error(`La référence ${existant.reference} existe déjà`, {
        description: existant.description,
        action: { label: 'Rattacher à cet article', onClick: () => { void changerArticle(d, l, existant.id); } },
      });
      return;
    }
    const neuf = articleDepuisLigne({
      id: generateId(),
      reference: saisie || referenceLibre(
        (l.reference || '').trim() || nouvel.designation.trim().slice(0, 40), produits),
      referenceFournisseur: l.reference,
      designation: nouvel.designation,
      prixAchat: l.prixAchat,
      categorie: nouvel.categorie,
      fournisseurId: d.fournisseurId,
      produits,
      horodate: new Date().toISOString(),
      aujourdhui: horodateJour(),
    });
    /* L'article d'abord, ATTENDU : la ligne le désigne par une clé étrangère. */
    const refus = await creerProduits([neuf]);
    if (refus) { toast.error(`Article refusé : ${refus}`); return; }
    await changerArticle(d, l, neuf.id, neuf.reference);
  }

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

  /* La colonne « Total HT » n'existe que pour le périmètre Achat. */
  const nbColonnes = canAchat ? 9 : 8;

  /**
   * Ce que deviendrait chaque ligne si on l'appliquait MAINTENANT.
   *
   * Le champ `action` gardé en base dit ce qui était vrai le jour de la
   * lecture. Six mois plus tard le prix a pu bouger — par une autre offre, par
   * une reprise Odoo — et c'est l'état d'aujourd'hui qui décide de ce qu'un
   * clic ferait. On le recalcule donc, sans toucher à ce que la base retient.
   */
  const propositionDe = (d: DevisFournisseur, l: DevisFournisseur['lignes'][number]) =>
    proposerPrix({
      indice: l.ordre,
      prixLu: l.prixAchat,
      produit: produitParId(l.produitId),
      fournisseurId: d.fournisseurId,
      liens: produitFournisseurs,
      produits,
    });

  /** Une ligne applicable : un article connu et un prix. */
  const applicable = (l: DevisFournisseur['lignes'][number]) =>
    !!l.produitId && l.prixAchat != null && l.prixAchat > 0;

  /* Au dépliage, on présélectionne ce qui reste à faire : les lignes
     applicables non encore appliquées. Rien de plus — reproposer une ligne
     déjà appliquée invite à la réappliquer sans raison. */
  const ouvrir = (d: DevisFournisseur) => {
    setVersLien(prev => (d.id in prev ? prev : { ...prev, [d.id]: true }));
    setSelection(prev => {
      const suite = { ...prev };
      for (const l of d.lignes) {
        if (!(l.id in suite)) suite[l.id] = applicable(l) && !l.applique;
      }
      return suite;
    });
  };

  async function appliquer(d: DevisFournisseur) {
    if (!d.fournisseurId) {
      toast.error("Ce devis n'est rattaché à aucun fournisseur.");
      return;
    }
    const auLien = versLien[d.id] ?? true;
    const auxArticles = !!versArticle[d.id];
    if (!auLien && !auxArticles) {
      toast.error('Choisissez au moins une destination.');
      return;
    }

    const retenues = d.lignes.filter(l => selection[l.id] && applicable(l));
    if (!retenues.length) { toast.error('Aucune ligne applicable sélectionnée.'); return; }

    setEnCours(d.id);
    const horodate = new Date().toISOString();
    const cibles: CibleEcriture[] = retenues.map(l => ({
      produitId: l.produitId!,
      prix: l.prixAchat!,
      reference: l.reference,
      versLien: auLien,
      versArticle: auxArticles,
      designation: l.designation, quantite: l.quantite, unite: l.unite,
    }));

    if (auxArticles) {
      updateProduits(prev => appliquerPrix({
        cibles, fournisseurId: d.fournisseurId!, liens: produitFournisseurs,
        produits: prev, horodate, nouvelId: generateId,
      }).produits);
    }
    if (auLien) {
      updateProduitFournisseurs(prev => appliquerPrix({
        cibles, fournisseurId: d.fournisseurId!, liens: prev,
        produits: [], horodate, nouvelId: generateId,
      }).liens);
    }

    await marquerAppliquees(d.id, retenues.map(l => l.id));
    setEnCours(null);
    const ou = [auLien ? 'fiche fournisseur' : null, auxArticles ? 'fiche article' : null]
      .filter(Boolean).join(' et ');
    toast.success(`${retenues.length} prix appliqué${retenues.length > 1 ? 's' : ''} sur la ${ou}.`);
  }


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

      <datalist id="df-categories">
        {categories.map(c => <option key={c} value={c} />)}
      </datalist>

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
                <tr><td colSpan={nbColonnes} className="px-3 py-8 text-center text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Chargement…
                </td></tr>
              )}

              {!chargement && !filtres.length && (
                <tr><td colSpan={nbColonnes} className="px-3 py-10 text-center text-muted-foreground">
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
                    onClick={() => { ouvrir(d); basculer(d.id); }}
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
                      <td colSpan={nbColonnes} className="px-3 py-3">
                        {!d.lignes.length ? (
                          <p className="text-muted-foreground text-xs">Ce devis ne porte aucune ligne.</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="w-6 py-1">
                                  <input
                                    type="checkbox"
                                    className="rounded"
                                    title="Tout sélectionner"
                                    checked={d.lignes.filter(applicable).every(x => selection[x.id])
                                             && d.lignes.some(applicable)}
                                    onChange={e => setSelection(prev => {
                                      const suite = { ...prev };
                                      for (const x of d.lignes) {
                                        if (applicable(x)) suite[x.id] = e.target.checked;
                                      }
                                      return suite;
                                    })}
                                  />
                                </th>
                                <th className="text-left font-medium py-1 pr-3">Réf. fournisseur</th>
                                <th className="text-left font-medium py-1 pr-3">Désignation</th>
                                <th className="text-right font-medium py-1 pr-3">Qté</th>
                                {canAchat && <th className="text-right font-medium py-1 pr-3">Prix du devis</th>}
                                {canAchat && <th className="text-right font-medium py-1 pr-3">Aujourd'hui</th>}
                                <th className="text-left font-medium py-1 pr-3">Article MonCRM</th>
                                <th className="text-left font-medium py-1">Sort</th>
                              </tr>
                            </thead>
                            <tbody>
                              {d.lignes.map(l => {
                                const article = produitParId(l.produitId);
                                const prop = d.fournisseurId ? propositionDe(d, l) : undefined;
                                /* Le sort d'aujourd'hui quand on peut le calculer,
                                   celui gardé en base sinon. */
                                const etiquette = ETIQUETTE_ACTION[prop?.action || l.action || ''];
                                const actuel = prop?.prixLien ?? prop?.prixArticle;
                                const ecart = prop?.ecartLien ?? prop?.ecartArticle;
                                return [
                                  <tr key={l.id} className="border-t border-border/50">
                                    <td className="py-1">
                                      <input
                                        type="checkbox"
                                        className="rounded"
                                        disabled={!applicable(l)}
                                        checked={!!selection[l.id]}
                                        onChange={e =>
                                          setSelection(prev => ({ ...prev, [l.id]: e.target.checked }))}
                                      />
                                    </td>
                                    <td className="py-1 pr-3 font-mono">{l.reference || '—'}</td>
                                    <td className="py-1 pr-3">{l.designation || '—'}</td>
                                    <td className="py-1 pr-3 text-right tabular-nums">{l.quantite ?? '—'}</td>
                                    {canAchat && (
                                      <td className="py-1 pr-3 text-right tabular-nums">
                                        {l.prixAchat != null ? formatMontant(l.prixAchat) : '—'}
                                      </td>
                                    )}
                                    {canAchat && (
                                      <td className="py-1 pr-3 text-right tabular-nums">
                                        {actuel != null ? (
                                          <>
                                            <div>{formatMontant(actuel)}</div>
                                            {ecart != null && Math.abs(ecart) >= 0.5 && (
                                              <div className={ecart > 0 ? 'text-destructive' : 'text-success'}>
                                                {ecart > 0 ? '+' : ''}{ecart.toFixed(1)} %
                                              </div>
                                            )}
                                          </>
                                        ) : <span className="text-muted-foreground">—</span>}
                                      </td>
                                    )}
                                    <td className="py-1 pr-3">
                                      <div className="flex items-center gap-1">
                                        {article
                                          ? <span title={article.description}>{article.reference}</span>
                                          : <span className="text-muted-foreground">non rattaché</span>}
                                        {/* LE RAPPROCHEMENT SE CORRIGE ICI : autre
                                            article, détacher, ou créer l'article. */}
                                        <button
                                          type="button"
                                          className="p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-muted"
                                          title={article ? "Changer d'article, détacher ou créer l'article" : "Rattacher ou créer l'article"}
                                          onClick={() => editer(l)}
                                        >
                                          {edition === l.id ? <X className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                                        </button>
                                      </div>
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
                                  </tr>,
                                  edition === l.id && (() => {
                                    const coef = nouvel.categorie.trim()
                                      ? coefficientVente(produits, nouvel.categorie.trim()) : null;
                                    const vente = l.prixAchat ? prixVenteDepuisAchat(l.prixAchat, coef) : undefined;
                                    return (
                                      <tr key={`${l.id}-edition`} className="bg-background">
                                        <td />
                                        <td colSpan={canAchat ? 7 : 5} className="py-2 pr-3">
                                          <div className="rounded-lg border p-2 space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="text-muted-foreground shrink-0">Rattacher à :</span>
                                              <div className="w-80 max-w-full">
                                                <ProduitCombobox
                                                  produits={produits}
                                                  value={l.produitId || ''}
                                                  onSelect={id => void changerArticle(d, l, id)}
                                                />
                                              </div>
                                              {article && (
                                                <Button size="sm" variant="outline" className="h-7 text-xs"
                                                  onClick={() => void changerArticle(d, l, undefined)}>
                                                  <Unlink className="w-3 h-3 mr-1" />Détacher de {article.reference}
                                                </Button>
                                              )}
                                            </div>
                                            <div className="flex flex-wrap items-end gap-2 border-t pt-2">
                                              <span className="text-muted-foreground shrink-0 self-center">ou créer l'article :</span>
                                              <label className="space-y-0.5">
                                                <span className="block text-[10px] text-muted-foreground">Référence</span>
                                                <Input className="h-7 w-40 text-xs" value={nouvel.reference}
                                                  placeholder={l.reference || 'référence MonCRM'}
                                                  onChange={e => setNouvel(n => ({ ...n, reference: e.target.value }))} />
                                              </label>
                                              <label className="space-y-0.5 flex-1 min-w-[16rem]">
                                                <span className="block text-[10px] text-muted-foreground">Désignation</span>
                                                <Input className="h-7 text-xs" value={nouvel.designation}
                                                  onChange={e => setNouvel(n => ({ ...n, designation: e.target.value }))} />
                                              </label>
                                              <label className="space-y-0.5">
                                                <span className="block text-[10px] text-muted-foreground">Catégorie</span>
                                                <Input className="h-7 w-56 text-xs" value={nouvel.categorie}
                                                  list="df-categories" placeholder="ex. ISOMARK / H2"
                                                  onChange={e => setNouvel(n => ({ ...n, categorie: e.target.value }))} />
                                              </label>
                                              <Button size="sm" className="h-7 text-xs" onClick={() => void creerArticle(d, l)}>
                                                <PlusCircle className="w-3 h-3 mr-1" />Créer et rattacher
                                              </Button>
                                            </div>
                                            {canAchat && l.prixAchat != null && (
                                              <p className="text-[11px] text-muted-foreground">
                                                Achat {formatMontant(l.prixAchat)} ·{' '}
                                                {vente != null
                                                  ? <>vente proposée {formatMontant(vente)} (coef. {coef!.coef.toFixed(2)} mesuré sur {coef!.effectif} articles « {coef!.categorie} »)</>
                                                  : <span className="text-warning">pas de prix de vente : {nouvel.categorie.trim()
                                                      ? 'la catégorie ne donne pas de coefficient fiable'
                                                      : 'choisissez une catégorie'} — à saisir sur la fiche</span>}
                                              </p>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })(),
                                ];
                              })}
                            </tbody>
                          </table>
                        )}

                        {/* Réappliquer plus tard : le devis reste la source, et
                            ce qu'on paie aujourd'hui a pu changer depuis. */}
                        {canAchat && !!d.lignes.length && (
                          <div className="mt-3 pt-3 border-t flex flex-wrap items-center gap-3">
                            {!d.fournisseurId ? (
                              <p className="text-xs text-warning inline-flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                Ce devis n'est rattaché à aucun fournisseur : ses prix ne peuvent pas
                                être appliqués.
                              </p>
                            ) : (
                              <>
                                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="rounded"
                                    checked={versLien[d.id] ?? true}
                                    onChange={e =>
                                      setVersLien(prev => ({ ...prev, [d.id]: e.target.checked }))}
                                  />
                                  Fiche fournisseur
                                </label>
                                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="rounded"
                                    checked={!!versArticle[d.id]}
                                    onChange={e =>
                                      setVersArticle(prev => ({ ...prev, [d.id]: e.target.checked }))}
                                  />
                                  Fiche article <span className="text-muted-foreground">(commande les marges)</span>
                                </label>
                                <Button
                                  size="sm"
                                  className="ml-auto"
                                  disabled={enCours === d.id
                                    || !d.lignes.some(x => selection[x.id] && applicable(x))}
                                  onClick={() => void appliquer(d)}
                                >
                                  {enCours === d.id
                                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Application…</>
                                    : <><Check className="w-3.5 h-3.5 mr-1.5" />
                                        Appliquer {d.lignes.filter(x => selection[x.id] && applicable(x)).length} prix
                                      </>}
                                </Button>
                              </>
                            )}
                          </div>
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
