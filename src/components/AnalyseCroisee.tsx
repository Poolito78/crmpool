/**
 * Analyse croisée — l'écran du tableau croisé dynamique (vue pivot d'Odoo).
 *
 * Monté dans Devis, Commandes Client, Factures Client (une source chacun), dans
 * l'onglet Ventes de la fiche client (`clientId`) et
 * dans le Tableau de bord (les trois au choix). Le calcul vit dans
 * `analyseCroisee.ts` ; ici, seulement le réglage et l'affichage :
 * mesures cochées, niveaux de lignes (Catégorie › Article…), dimension de
 * colonne (Mois…), filtres période / statut / texte, dépliage « + / − »,
 * tri par un clic sur l'en-tête d'une mesure, inversion des axes, export Excel.
 *
 * Le périmètre est celui des pages : un non-admin ne voit que ses documents.
 * Le réglage est mémorisé par écran (`localStorage`, clé `analyse_croisee_<cle>`).
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useCRM } from '@/lib/StoreContext';
import { useCurrentUser } from '@/hooks/useAuth';
import { useCommercials } from '@/hooks/useCommercials';
import { produitParId } from '@/lib/indexProduits';
import { exportToExcel } from '@/lib/exportExcel';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { lireVentesOdoo, importerVentesOdoo, normaliserNom } from '@/lib/ventesOdoo';
import {
  DIMENSIONS, MESURES, LIBELLE_SOURCE, dimension,
  construirePivot, trierParMesure, lignesVisibles, cheminsDepliables, valeurMesure, formaterMesure,
  faitsDevis, faitsCommandes, faitsFactures, faitsVentesOdoo, estSourceOdoo,
  type DimensionId, type MesureId, type SourceAnalyse, type FaitVente, type NoeudPivot,
} from '@/lib/analyseCroisee';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ArrowDown, ArrowLeftRight, ArrowUp, BarChart3, ChevronDown, CloudDownload, List, Loader2, Download, MinusSquare, PlusSquare, Plus, Search, X, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';

interface Reglage {
  source: SourceAnalyse;
  lignes: DimensionId[];
  colonne: DimensionId | null;
  mesures: MesureId[];
  statutsExclus: Partial<Record<SourceAnalyse, string[]>>;
  du: string;
  au: string;
}

const REGLAGE_DEFAUT: Omit<Reglage, 'source'> = {
  lignes: ['categorie', 'article'],
  colonne: 'mois',
  mesures: ['totalHT', 'quantite'],
  // Une facture annulée n'est pas une vente.
  statutsExclus: { factures: ['Annulée'] },
  du: '',
  au: '',
};

/**
 * Dans une fiche client, la dimension Client ne dit rien : elle est retirée.
 * Et les commandes FACTURÉES ou PAYÉES sont exclues d'office : elles sont
 * déjà dans les factures — la fiche montre les commandes EN COURS.
 */
const REGLAGE_FICHE_CLIENT: Partial<Omit<Reglage, 'source'>> = {
  statutsExclus: { factures: ['Annulée'], commandes: ['Facturé', 'Payée'], commandesOdoo: ['Facturée'] },
};

function lireReglage(cle: string, sources: SourceAnalyse[], ficheClient: boolean): Reglage {
  const defaut: Reglage = { ...REGLAGE_DEFAUT, ...(ficheClient ? REGLAGE_FICHE_CLIENT : {}), source: sources[0] };
  try {
    const brut = localStorage.getItem(`analyse_croisee_${cle}`);
    if (!brut) return defaut;
    const r = { ...defaut, ...JSON.parse(brut) } as Reglage;
    // Valeurs relues d'une version précédente : on ne garde que ce qui existe encore.
    const ids = new Set(DIMENSIONS.map(d => d.id).filter(d => !(ficheClient && d === 'client')));
    r.lignes = (r.lignes || []).filter(d => ids.has(d));
    if (r.colonne && !ids.has(r.colonne)) r.colonne = null;
    r.mesures = (r.mesures || []).filter(m => MESURES.some(x => x.id === m));
    if (!r.mesures.length) r.mesures = ['totalHT'];
    if (!sources.includes(r.source)) r.source = sources[0];
    return r;
  } catch { return defaut; }
}

type Tri = { mesure: MesureId; colonne: string | null; sens: 'asc' | 'desc' } | null;

/**
 * Liste ↔ analyse d'une page. ⚠️ NON mémorisé : la page s'ouvre TOUJOURS sur
 * sa liste. Mémorisé, l'analyse revenait à la visite suivante et l'on ne
 * trouvait plus ses commandes (11/11/2026). `cle` reste pour l'appelant.
 */
export function useVueAnalyse(cle: string) {
  return useState(false);
}

/** Bouton d'en-tête de page : bascule entre la liste et l'analyse croisée. */
export function BoutonAnalyse({ actif, onClick }: { actif: boolean; onClick: () => void }) {
  return (
    <Button size="sm" variant={actif ? 'default' : 'outline'} onClick={onClick} className="gap-1 shrink-0"
      title={actif ? 'Revenir à la liste' : 'Analyse croisée (tableau croisé dynamique)'}>
      {actif ? <List className="w-4 h-4" /> : <BarChart3 className="w-4 h-4" />}
      <span className="hidden sm:inline">{actif ? 'Liste' : 'Analyse'}</span>
    </Button>
  );
}

/**
 * `clientId` : analyse limitée aux documents d'un client (onglet Ventes de la
 * fiche client) ; la dimension Client disparaît des choix.
 */
export default function AnalyseCroisee({ sources, cle, clientId }: { sources: SourceAnalyse[]; cle: string; clientId?: string }) {
  const { devis, commandesClient, facturesClient, clients, produits, updateClients } = useCRM();
  const { isAdmin, userId } = useCurrentUser();
  const { commercials } = useCommercials();

  const [reglage, setReglage] = useState<Reglage>(() => lireReglage(cle, sources, !!clientId));
  useEffect(() => { try { localStorage.setItem(`analyse_croisee_${cle}`, JSON.stringify(reglage)); } catch { /* ignore */ } }, [cle, reglage]);
  const maj = (p: Partial<Reglage>) => setReglage(r => ({ ...r, ...p }));

  const [recherche, setRecherche] = useState('');
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [tri, setTri] = useState<Tri>(null);

  const { source, lignes, colonne, mesures } = reglage;

  // ── Copie Odoo (`ventes_odoo`), lue seulement si une source Odoo est offerte ──
  const queryClient = useQueryClient();
  const avecOdoo = sources.some(estSourceOdoo);
  const ventesOdoo = useQuery({ queryKey: ['ventes_odoo'], queryFn: lireVentesOdoo, enabled: avecOdoo, staleTime: 5 * 60_000 });
  const [anneeImport, setAnneeImport] = useState(() => new Date().getFullYear());
  const [importEnCours, setImportEnCours] = useState(false);
  const dernierImport = useMemo(() => (ventesOdoo.data ?? []).reduce((m, l) => (l.importe_le && l.importe_le > m ? l.importe_le : m), ''), [ventesOdoo.data]);
  const importer = async () => {
    setImportEnCours(true);
    try {
      const b = await importerVentesOdoo(anneeImport, 'flooring', clients, nouveaux => updateClients(prev => [...prev, ...nouveaux]));
      await queryClient.invalidateQueries({ queryKey: ['ventes_odoo'] });
      toast.success(`Flooring ${anneeImport} importé d'Odoo : ${b.factures} factures/avoirs, ${b.commandes} commandes`, {
        description: `${b.clientsRattaches} client(s) rattaché(s), ${b.clientsCrees} fiche(s) client créée(s).`,
      });
    } catch (e) {
      toast.error(`Import Odoo impossible : ${(e as Error).message}`);
    } finally {
      setImportEnCours(false);
    }
  };
  const statutsExclus = useMemo(() => new Set(reglage.statutsExclus[source] || []), [reglage.statutsExclus, source]);

  // ── Faits de la source, dans le périmètre du commercial ──────────────────
  const faitsSource = useMemo<FaitVente[]>(() => {
    const clientsParId = new Map(clients.map(c => [c.id, c]));
    const ctx = {
      clientParId: (id: string) => clientsParId.get(id),
      produitParId: (id?: string) => produitParId(produits, id),
      nomCommercial: (u?: string) => (u ? commercials.find(c => c.userId === u)?.name ?? '—' : '—'),
    };
    const dansPerimetre = <T extends { userId?: string; clientId: string }>(d: T) =>
      (!clientId || d.clientId === clientId) && (isAdmin || !d.userId || d.userId === userId);
    if (estSourceOdoo(source)) {
      /* Odoo ne connaît pas l'utilisateur MonCRM : un non-admin voit les
         lignes dont le commercial Odoo porte son nom d'affichage. */
      const moi = normaliserNom(commercials.find(c => c.userId === userId)?.name || '');
      return faitsVentesOdoo((ventesOdoo.data ?? []).filter(l =>
        (!clientId || l.client_id === clientId) && (isAdmin || (!!moi && normaliserNom(l.commercial || '') === moi))), source, ctx);
    }
    if (source === 'devis') return faitsDevis(devis.filter(dansPerimetre), ctx);
    if (source === 'commandes') return faitsCommandes(commandesClient.filter(dansPerimetre), ctx);
    return faitsFactures(facturesClient.filter(dansPerimetre), ctx);
  }, [source, devis, commandesClient, facturesClient, clients, produits, commercials, isAdmin, userId, clientId, ventesOdoo.data]);

  const statutsDispo = useMemo(() => [...new Set(faitsSource.map(f => f.statut))].sort((a, b) => a.localeCompare(b, 'fr')), [faitsSource]);

  const faits = useMemo(() => {
    const q = recherche.trim().toLocaleLowerCase('fr').split(/\s+/).filter(Boolean);
    return faitsSource.filter(f => {
      if (statutsExclus.has(f.statut)) return false;
      const jour = f.date.slice(0, 10);
      if (reglage.du && jour < reglage.du) return false;
      if (reglage.au && jour > reglage.au) return false;
      if (q.length) {
        const t = `${f.client} ${f.article} ${f.reference} ${f.numero} ${f.categorie} ${f.affaire}`.toLocaleLowerCase('fr');
        if (!q.every(m => t.includes(m))) return false;
      }
      return true;
    });
  }, [faitsSource, statutsExclus, reglage.du, reglage.au, recherche]);

  const pivot = useMemo(() => construirePivot(faits, lignes, colonne), [faits, lignes, colonne]);
  const racine = useMemo(
    () => (tri && mesures.includes(tri.mesure) ? trierParMesure(pivot.racine, tri.mesure, tri.colonne, tri.sens) : pivot.racine),
    [pivot, tri, mesures],
  );
  const visibles = useMemo(() => lignesVisibles(racine, ouverts), [racine, ouverts]);
  const mesuresAffichees = MESURES.filter(m => mesures.includes(m.id));
  const colonnes = pivot.colonnes;

  // ── Actions ──────────────────────────────────────────────────────────────
  const basculer = (chemin: string) => setOuverts(s => { const n = new Set(s); if (n.has(chemin)) n.delete(chemin); else n.add(chemin); return n; });
  const toutDeplier = () => setOuverts(new Set(cheminsDepliables(racine)));
  const toutReplier = () => setOuverts(new Set());
  const inverser = () => {
    const [premier, ...reste] = lignes;
    if (colonne) maj({ colonne: premier ?? null, lignes: [colonne, ...reste] });
    else if (premier) maj({ colonne: premier, lignes: reste });
    setTri(null);
  };
  const basculerStatut = (s: string) => {
    const n = new Set(statutsExclus);
    if (n.has(s)) n.delete(s); else n.add(s);
    maj({ statutsExclus: { ...reglage.statutsExclus, [source]: [...n] } });
  };
  const cliquerMesure = (mesure: MesureId, col: string | null) => {
    setTri(t => {
      if (!t || t.mesure !== mesure || t.colonne !== col) return { mesure, colonne: col, sens: 'desc' };
      if (t.sens === 'desc') return { mesure, colonne: col, sens: 'asc' };
      return null;
    });
  };
  const exporter = () => {
    const lignesExcel = visibles.map(n => {
      const ligne: Record<string, string | number | null> = {
        [lignes.map(d => dimension(d).label).join(' › ') || 'Ligne']: `${'    '.repeat(n.niveau)}${n.libelle}`,
      };
      for (const c of colonnes) for (const m of mesuresAffichees) ligne[`${c.libelle} — ${m.label}`] = valeurMesure(n.parColonne.get(c.cle), m.id);
      for (const m of mesuresAffichees) ligne[`Total — ${m.label}`] = valeurMesure(n.total, m.id);
      return ligne;
    });
    exportToExcel(lignesExcel, `analyse-${source}-${new Date().toISOString().slice(0, 10)}`, 'Analyse');
  };

  const dimsChoisissables = DIMENSIONS.filter(d => !(clientId && d.id === 'client'));
  const dimsLibres = dimsChoisissables.filter(d => !lignes.includes(d.id) && d.id !== colonne);
  const profondeur = lignes.length;

  const indicateurTri = (mesure: MesureId, col: string | null) =>
    tri && tri.mesure === mesure && tri.colonne === col
      ? (tri.sens === 'desc' ? <ArrowDown className="inline w-3 h-3 ml-0.5" /> : <ArrowUp className="inline w-3 h-3 ml-0.5" />)
      : null;

  const enteteMesure = (m: { id: MesureId; label: string }, col: string | null, k: string) => (
    <th key={k} onClick={() => cliquerMesure(m.id, col)} title="Trier"
      className="px-2 py-1.5 text-right font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground border-b border-l border-border bg-muted/60">
      {m.label}{indicateurTri(m.id, col)}
    </th>
  );

  const cellules = (n: NoeudPivot, gras: boolean) => (
    <>
      {colonnes.map(c => mesuresAffichees.map(m => (
        <td key={`${c.cle}-${m.id}`} className={`px-2 py-1 text-right tabular-nums whitespace-nowrap border-l border-border/60 ${gras ? 'font-semibold' : ''}`}>
          {formaterMesure(valeurMesure(n.parColonne.get(c.cle), m.id), m.id)}
        </td>
      )))}
      {mesuresAffichees.map(m => (
        <td key={`t-${m.id}`} className="px-2 py-1 text-right tabular-nums whitespace-nowrap border-l border-border font-semibold bg-muted/30">
          {formaterMesure(valeurMesure(n.total, m.id), m.id)}
        </td>
      ))}
    </>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      {/* ── Réglages ── */}
      <div className="flex flex-wrap items-center gap-2">
        {sources.length > 1 && (
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            {sources.map(s => (
              <button key={s} onClick={() => { maj({ source: s }); setTri(null); }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${source === s ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {LIBELLE_SOURCE[s]}
              </button>
            ))}
          </div>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1">Mesures <ChevronDown className="w-3 h-3" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {MESURES.map(m => (
              <DropdownMenuCheckboxItem key={m.id} checked={mesures.includes(m.id)} onSelect={e => e.preventDefault()}
                onCheckedChange={v => {
                  const n = v ? MESURES.filter(x => x.id === m.id || mesures.includes(x.id)).map(x => x.id) : mesures.filter(x => x !== m.id);
                  if (n.length) maj({ mesures: n });
                }}>
                {m.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-muted-foreground">Lignes :</span>
          {lignes.map((d, i) => (
            <span key={d} className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              {i > 0 && <span className="opacity-50">›</span>}{dimension(d).label}
              <button onClick={() => { maj({ lignes: lignes.filter(x => x !== d) }); setTri(null); }} title="Retirer"><X className="w-3 h-3" /></button>
            </span>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-0.5 px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground">
                <Plus className="w-3 h-3" /> Regrouper par
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {dimsLibres.map(d => <DropdownMenuItem key={d.id} onClick={() => maj({ lignes: [...lignes, d.id] })}>{d.label}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Colonnes :</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                {colonne ? dimension(colonne).label : 'Aucune'} <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuItem onClick={() => { maj({ colonne: null }); setTri(null); }}>Aucune</DropdownMenuItem>
              <DropdownMenuSeparator />
              {dimsChoisissables.filter(d => !lignes.includes(d.id)).map(d => (
                <DropdownMenuItem key={d.id} onClick={() => { maj({ colonne: d.id }); setTri(null); }}>{d.label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Inverser lignes et colonnes" onClick={inverser}><ArrowLeftRight className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Tout déplier" onClick={toutDeplier} disabled={profondeur < 2}><ChevronsUpDown className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Tout replier" onClick={toutReplier} disabled={profondeur < 2}><ChevronsDownUp className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Exporter vers Excel" onClick={exporter}><Download className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* ── Copie Odoo : origine des chiffres et import ── */}
      {estSourceOdoo(source) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            Copie d'Odoo en lecture seule — lignes <b>Flooring</b> (ISOMARK / FLOORING…), tous commerciaux.{' '}
            {ventesOdoo.isLoading ? 'Lecture…' : dernierImport ? `Dernier import : ${new Date(dernierImport).toLocaleString('fr-FR')}.` : "Rien d'importé pour l'instant."}
          </span>
          {ventesOdoo.error && <span className="text-destructive">Lecture impossible : {(ventesOdoo.error as Error).message}</span>}
          <div className="ml-auto flex items-center gap-1">
            {/* Pas de <select> natif : dans un dialogue Radix (fiche client), sa liste annule le choix. */}
            <div className="flex gap-0.5 p-0.5 bg-muted rounded">
              {[2, 1, 0].map(k => new Date().getFullYear() - k).map(a => (
                <button key={a} onClick={() => setAnneeImport(a)}
                  className={`px-2 py-0.5 rounded ${anneeImport === a ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{a}</button>
              ))}
            </div>
            <Button size="sm" variant="outline" className="h-7 gap-1" onClick={importer} disabled={importEnCours}
              title="Relit Odoo et remplace les lignes Flooring de l'année ; crée les fiches clients manquantes">
              {importEnCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudDownload className="w-3.5 h-3.5" />}
              Importer d'Odoo
            </Button>
          </div>
        </div>
      )}

      {/* ── Filtres ── */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Client, article, réf…" className="h-8 pl-8 text-xs" />
        </div>
        <label className="flex items-center gap-1 text-muted-foreground">Du
          <Input type="date" value={reglage.du} onChange={e => maj({ du: e.target.value })} className="h-8 w-36 text-xs" />
        </label>
        <label className="flex items-center gap-1 text-muted-foreground">au
          <Input type="date" value={reglage.au} onChange={e => maj({ au: e.target.value })} className="h-8 w-36 text-xs" />
        </label>
        {(reglage.du || reglage.au) && (
          <button className="text-muted-foreground hover:text-foreground" onClick={() => maj({ du: '', au: '' })} title="Effacer la période"><X className="w-3.5 h-3.5" /></button>
        )}
        <div className="flex flex-wrap gap-1">
          {statutsDispo.map(s => (
            <button key={s} onClick={() => basculerStatut(s)} title={statutsExclus.has(s) ? 'Exclu — cliquer pour inclure' : 'Inclus — cliquer pour exclure'}
              className={`px-2 py-0.5 rounded border transition-colors ${statutsExclus.has(s) ? 'border-border text-muted-foreground line-through opacity-60' : 'border-primary/40 bg-primary/10 text-primary'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tableau croisé ── */}
      <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border bg-card">
        {faits.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Aucune ligne de {LIBELLE_SOURCE[source].toLowerCase()} pour ces filtres.</p>
        ) : (
          <table className="text-xs border-separate border-spacing-0 min-w-full">
            <thead className="sticky top-0 z-20">
              {colonne ? (
                <>
                  <tr>
                    <th rowSpan={2} className="sticky left-0 z-30 bg-muted px-2 py-1.5 text-left font-medium border-b border-border min-w-[14rem]">
                      {lignes.map(d => dimension(d).label).join(' › ')}
                    </th>
                    {colonnes.map(c => (
                      <th key={c.cle} colSpan={mesuresAffichees.length} className="px-2 py-1.5 text-center font-semibold whitespace-nowrap border-b border-l border-border bg-muted">
                        {c.libelle}
                      </th>
                    ))}
                    <th colSpan={mesuresAffichees.length} className="px-2 py-1.5 text-center font-semibold border-b border-l border-border bg-muted">Total</th>
                  </tr>
                  <tr>
                    {colonnes.map(c => mesuresAffichees.map(m => enteteMesure(m, c.cle, `${c.cle}-${m.id}`)))}
                    {mesuresAffichees.map(m => enteteMesure(m, null, `t-${m.id}`))}
                  </tr>
                </>
              ) : (
                <tr>
                  <th className="sticky left-0 z-30 bg-muted px-2 py-1.5 text-left font-medium border-b border-border min-w-[14rem]">
                    {lignes.map(d => dimension(d).label).join(' › ')}
                  </th>
                  {mesuresAffichees.map(m => enteteMesure(m, null, `t-${m.id}`))}
                </tr>
              )}
            </thead>
            <tbody>
              {visibles.map(n => {
                const estRacine = n.niveau === 0;
                const depliable = !estRacine && n.niveau < profondeur && n.enfants.length > 0;
                const ouvert = ouverts.has(n.chemin);
                return (
                  <Fragment key={n.chemin || 'racine'}>
                    <tr className={`${estRacine ? 'bg-muted/40 font-semibold' : 'hover:bg-muted/30'}`}>
                      <th scope="row" className={`sticky left-0 z-10 px-2 py-1 text-left font-normal border-b border-border/60 max-w-[28rem] ${estRacine ? 'bg-muted font-semibold' : 'bg-card'}`}>
                        <div className="flex items-center gap-1" style={{ paddingLeft: `${Math.max(0, n.niveau - 1) * 1.1}rem` }}>
                          {depliable ? (
                            <button onClick={() => basculer(n.chemin)} className="text-muted-foreground hover:text-foreground shrink-0" title={ouvert ? 'Replier' : 'Déplier'}>
                              {ouvert ? <MinusSquare className="w-3.5 h-3.5" /> : <PlusSquare className="w-3.5 h-3.5" />}
                            </button>
                          ) : !estRacine && profondeur > 1 ? <span className="w-3.5 shrink-0" /> : null}
                          <span className={`truncate ${depliable ? 'cursor-pointer' : ''}`} title={n.libelle} onClick={depliable ? () => basculer(n.chemin) : undefined}>
                            {n.libelle}
                          </span>
                        </div>
                      </th>
                      {cellules(n, estRacine)}
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
