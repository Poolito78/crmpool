/**
 * Analyse croisée — l'écran du tableau croisé dynamique, à la manière de la
 * vue pivot d'Odoo.
 *
 * Monté dans Devis, Commandes Client, Factures Client, l'onglet Ventes de la
 * fiche client (`clientId`) et le Tableau de bord. Le calcul vit dans
 * `analyseCroisee.ts` ; ici, le réglage et l'affichage, comme chez Odoo :
 *  - **⊞ / ⊟ sur les en-têtes de LIGNE et de COLONNE** : ⊞ sur un en-tête du
 *    dernier niveau ouvre la liste des regroupements et ajoute celui choisi ;
 *    ⊟ replie ; ⊟ sur « Total » retire tous les regroupements de l'axe ;
 *  - barre de **facettes** (statut, période, regroupements, favori) avec ×,
 *    et menus **Filtres**, **Regrouper par**, **Favoris** ;
 *  - **Mesures** cochées, tri au clic sur une mesure, ⇄, export Excel.
 *
 * Favoris : table `analyse_favoris`, par utilisateur et par écran (`cle`).
 * Le réglage courant est mémorisé par écran (`localStorage`).
 * Le périmètre est celui des pages : un non-admin ne voit que ses documents.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useCRM } from '@/lib/StoreContext';
import { useCurrentUser } from '@/hooks/useAuth';
import { useCommercials } from '@/hooks/useCommercials';
import { produitParId } from '@/lib/indexProduits';
import { exportToExcel } from '@/lib/exportExcel';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { lireVentesOdoo, importerVentesOdoo, dansPerimetreOdoo, CLE_VENTES_ODOO } from '@/lib/ventesOdoo';
import {
  DIMENSIONS, MESURES, LIBELLE_SOURCE, dimension,
  construirePivot, trierParMesure, lignesVisibles, cheminsDepliables, colonnesFeuilles, valeurMesure, formaterMesure,
  faitsDevis, faitsCommandes, faitsFactures, faitsVentesOdoo, estSourceOdoo,
  type DimensionId, type MesureId, type SourceAnalyse, type FaitVente, type NoeudPivot, type NoeudColonne,
} from '@/lib/analyseCroisee';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  ArrowDown, ArrowLeftRight, ArrowUp, BarChart3, ChevronDown, CloudDownload, List, Loader2, Download, MinusSquare, PlusSquare,
  Search, X, ChevronsDownUp, ChevronsUpDown, Filter, Layers, Star, Trash2,
} from 'lucide-react';

// ── Réglage ────────────────────────────────────────────────────────────────

type PeriodeId = 'annee' | 'anneePrecedente' | 'trimestre' | 'mois' | '12mois' | 'perso';

const PERIODES: { id: PeriodeId; label: string }[] = [
  { id: 'annee', label: 'Année en cours' },
  { id: 'anneePrecedente', label: 'Année précédente' },
  { id: 'trimestre', label: 'Trimestre en cours' },
  { id: 'mois', label: 'Mois en cours' },
  { id: '12mois', label: '12 derniers mois' },
  { id: 'perso', label: 'Période personnalisée…' },
];

interface Reglage {
  source: SourceAnalyse;
  lignes: DimensionId[];
  colonnes: DimensionId[];
  mesures: MesureId[];
  statutsExclus: Partial<Record<SourceAnalyse, string[]>>;
  /** Période relative (recalculée chaque jour) ; `perso` = `du` / `au`. */
  periode: PeriodeId | null;
  du: string;
  au: string;
}

const REGLAGE_DEFAUT: Omit<Reglage, 'source'> = {
  lignes: ['categorie', 'article'],
  colonnes: ['mois'],
  mesures: ['totalHT', 'quantite'],
  // Une facture annulée n'est pas une vente.
  statutsExclus: { factures: ['Annulée'] },
  periode: null,
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

/** Remet d'aplomb un réglage relu (localStorage, favori) : rien qui n'existe plus. */
function nettoyer(brut: Partial<Reglage> & { colonne?: DimensionId | null }, defaut: Reglage, sources: SourceAnalyse[], ficheClient: boolean): Reglage {
  const r = { ...defaut, ...brut } as Reglage;
  // Version précédente : une seule colonne (`colonne`).
  if (!Array.isArray(brut.colonnes) && brut.colonne !== undefined) r.colonnes = brut.colonne ? [brut.colonne] : [];
  const ids = new Set(DIMENSIONS.map(d => d.id).filter(d => !(ficheClient && d === 'client')));
  r.lignes = (r.lignes || []).filter(d => ids.has(d));
  r.colonnes = (r.colonnes || []).filter(d => ids.has(d) && !r.lignes.includes(d));
  r.mesures = (r.mesures || []).filter(m => MESURES.some(x => x.id === m));
  if (!r.mesures.length) r.mesures = ['totalHT'];
  if (!sources.includes(r.source)) r.source = sources[0];
  if (r.periode && !PERIODES.some(p => p.id === r.periode)) r.periode = null;
  delete (r as { colonne?: unknown }).colonne;
  return r;
}

function reglageParDefaut(sources: SourceAnalyse[], ficheClient: boolean): Reglage {
  return { ...REGLAGE_DEFAUT, ...(ficheClient ? REGLAGE_FICHE_CLIENT : {}), source: sources[0] };
}

function lireReglage(cle: string, sources: SourceAnalyse[], ficheClient: boolean): Reglage {
  const defaut = reglageParDefaut(sources, ficheClient);
  try {
    const brut = localStorage.getItem(`analyse_croisee_${cle}`);
    return brut ? nettoyer(JSON.parse(brut), defaut, sources, ficheClient) : defaut;
  } catch { return defaut; }
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Bornes [du, au] d'une période, relues au jour d'aujourd'hui. */
function bornesPeriode(r: Pick<Reglage, 'periode' | 'du' | 'au'>): [string, string] {
  const t = new Date();
  const y = t.getFullYear();
  switch (r.periode) {
    case 'annee': return [`${y}-01-01`, `${y}-12-31`];
    case 'anneePrecedente': return [`${y - 1}-01-01`, `${y - 1}-12-31`];
    case 'trimestre': { const q = Math.floor(t.getMonth() / 3); return [iso(new Date(y, q * 3, 1)), iso(new Date(y, q * 3 + 3, 0))]; }
    case 'mois': return [iso(new Date(y, t.getMonth(), 1)), iso(new Date(y, t.getMonth() + 1, 0))];
    case '12mois': return [iso(new Date(y - 1, t.getMonth(), t.getDate() + 1)), iso(t)];
    case 'perso': return [r.du, r.au];
    default: return ['', ''];
  }
}

type Tri = { mesure: MesureId; colonne: string | null; sens: 'asc' | 'desc' } | null;

/** Un favori garde aussi la recherche et ce qui était déplié, comme chez Odoo. */
interface Favori { id: string; nom: string; reglage: Reglage & { recherche?: string; ouverts?: string[]; ouvertsCol?: string[] } }

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
 * En-tête ⊞ / ⊟ à la manière d'Odoo. Ouvert : ⊟ replie. Fermé : ⊞ ouvre
 * TOUJOURS la liste des regroupements (`choix`) — même après un repli, on
 * rechoisit, comme chez Odoo (demande du 11/11/2026) ; le regroupement de
 * ce niveau (`actuel`) y est coché.
 */
function EnteteDepliable({ libelle, ouvert, choix, actuel, onReplier, onChoisir, className = '' }: {
  libelle: string;
  ouvert: boolean;
  choix: { id: DimensionId; label: string }[];
  actuel?: DimensionId;
  onReplier: () => void;
  onChoisir: (d: DimensionId) => void;
  className?: string;
}) {
  const contenu = (
    <>
      {ouvert ? <MinusSquare className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /> : <PlusSquare className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
      <span className="truncate" title={libelle}>{libelle}</span>
    </>
  );
  const cls = `inline-flex items-center gap-1 max-w-full hover:text-primary ${className}`;
  if (ouvert) return <button type="button" className={cls} onClick={onReplier} title="Replier">{contenu}</button>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cls} title="Regrouper par…">{contenu}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {choix.length === 0
          ? <DropdownMenuItem disabled>Aucun autre regroupement</DropdownMenuItem>
          : choix.map(d => (
            <DropdownMenuItem key={d.id} onClick={() => onChoisir(d.id)} className={d.id === actuel ? 'font-semibold' : ''}>
              {d.label}{d.id === actuel && <span className="ml-auto text-primary">✓</span>}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const ficheClient = !!clientId;

  const [reglage, setReglage] = useState<Reglage>(() => lireReglage(cle, sources, ficheClient));
  useEffect(() => { try { localStorage.setItem(`analyse_croisee_${cle}`, JSON.stringify(reglage)); } catch { /* ignore */ } }, [cle, reglage]);
  const [favoriActif, setFavoriActif] = useState<string | null>(null);
  const maj = (p: Partial<Reglage>) => { setReglage(r => ({ ...r, ...p })); setFavoriActif(null); };

  const [recherche, setRecherche] = useState('');
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [ouvertsCol, setOuvertsCol] = useState<Set<string>>(new Set());
  const [tri, setTri] = useState<Tri>(null);

  const { source, lignes, colonnes, mesures } = reglage;

  // ── Copie Odoo (`ventes_odoo`), lue seulement si une source Odoo est offerte ──
  const queryClient = useQueryClient();
  const avecOdoo = sources.some(estSourceOdoo);
  const ventesOdoo = useQuery({ queryKey: CLE_VENTES_ODOO, queryFn: lireVentesOdoo, enabled: avecOdoo, staleTime: 5 * 60_000 });
  const [anneeImport, setAnneeImport] = useState(() => new Date().getFullYear());
  const [importEnCours, setImportEnCours] = useState(false);
  const dernierImport = useMemo(() => (ventesOdoo.data ?? []).reduce((m, l) => (l.importe_le && l.importe_le > m ? l.importe_le : m), ''), [ventesOdoo.data]);
  const importer = async () => {
    setImportEnCours(true);
    try {
      const b = await importerVentesOdoo(anneeImport, 'flooring', clients, nouveaux => updateClients(prev => [...prev, ...nouveaux]));
      await queryClient.invalidateQueries({ queryKey: CLE_VENTES_ODOO });
      toast.success(`Flooring ${anneeImport} importé d'Odoo : ${b.factures} factures/avoirs, ${b.commandes} commandes`, {
        description: `${b.clientsRattaches} client(s) rattaché(s), ${b.clientsCrees} fiche(s) client créée(s).`,
      });
    } catch (e) {
      toast.error(`Import Odoo impossible : ${(e as Error).message}`);
    } finally {
      setImportEnCours(false);
    }
  };

  // ── Favoris (par utilisateur et par écran) ─────────────────────────────────
  const cleFavoris = ['analyse_favoris', cle] as const;
  const favoris = useQuery({
    queryKey: cleFavoris,
    queryFn: async () => {
      const { data, error } = await supabase.from('analyse_favoris' as never).select('id, nom, reglage').eq('ecran', cle).order('nom');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Favori[];
    },
    staleTime: 60_000,
  });
  const [nomFavori, setNomFavori] = useState('');
  const enregistrerFavori = async () => {
    const nom = nomFavori.trim();
    if (!nom) return;
    const { error } = await supabase.from('analyse_favoris' as never).insert({ ecran: cle, nom, reglage: { ...reglage, recherche, ouverts: [...ouverts], ouvertsCol: [...ouvertsCol] } } as never);
    if (error) { toast.error(`Favori non enregistré : ${error.message}`); return; }
    setNomFavori('');
    setFavoriActif(nom);
    await queryClient.invalidateQueries({ queryKey: cleFavoris });
    toast.success(`Favori « ${nom} » enregistré`);
  };
  const appliquerFavori = (f: Favori) => {
    const { recherche: rech, ouverts: ouv, ouvertsCol: ouvCol, ...r } = f.reglage;
    setReglage(nettoyer(r, reglageParDefaut(sources, ficheClient), sources, ficheClient));
    setRecherche(rech || '');
    setOuverts(new Set(ouv || []));
    setOuvertsCol(new Set(ouvCol || []));
    setTri(null);
    setFavoriActif(f.nom);
  };
  const supprimerFavori = async (f: Favori) => {
    const { error } = await supabase.from('analyse_favoris' as never).delete().eq('id', f.id);
    if (error) { toast.error(`Suppression impossible : ${error.message}`); return; }
    if (favoriActif === f.nom) setFavoriActif(null);
    await queryClient.invalidateQueries({ queryKey: cleFavoris });
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
      const moi = commercials.find(c => c.userId === userId)?.name || '';
      return faitsVentesOdoo((ventesOdoo.data ?? []).filter(l =>
        (!clientId || l.client_id === clientId) && dansPerimetreOdoo(l, isAdmin, moi)), source, ctx);
    }
    if (source === 'devis') return faitsDevis(devis.filter(dansPerimetre), ctx);
    if (source === 'commandes') return faitsCommandes(commandesClient.filter(dansPerimetre), ctx);
    return faitsFactures(facturesClient.filter(dansPerimetre), ctx);
  }, [source, devis, commandesClient, facturesClient, clients, produits, commercials, isAdmin, userId, clientId, ventesOdoo.data]);

  const statutsDispo = useMemo(() => [...new Set(faitsSource.map(f => f.statut))].sort((a, b) => a.localeCompare(b, 'fr')), [faitsSource]);
  const [du, au] = bornesPeriode(reglage);

  const faits = useMemo(() => {
    const q = recherche.trim().toLocaleLowerCase('fr').split(/\s+/).filter(Boolean);
    return faitsSource.filter(f => {
      if (statutsExclus.has(f.statut)) return false;
      const jour = f.date.slice(0, 10);
      if (du && jour < du) return false;
      if (au && jour > au) return false;
      if (q.length) {
        const t = `${f.client} ${f.article} ${f.reference} ${f.numero} ${f.categorie} ${f.affaire}`.toLocaleLowerCase('fr');
        if (!q.every(m => t.includes(m))) return false;
      }
      return true;
    });
  }, [faitsSource, statutsExclus, du, au, recherche]);

  const pivot = useMemo(() => construirePivot(faits, lignes, colonnes), [faits, lignes, colonnes]);
  const racine = useMemo(
    () => (tri && mesures.includes(tri.mesure) ? trierParMesure(pivot.racine, tri.mesure, tri.colonne, tri.sens) : pivot.racine),
    [pivot, tri, mesures],
  );
  const visibles = useMemo(() => lignesVisibles(racine, ouverts), [racine, ouverts]);
  const mesuresAffichees = MESURES.filter(m => mesures.includes(m.id));
  const M = mesuresAffichees.length;
  const feuilles = useMemo(() => colonnesFeuilles(pivot.colRacine, ouvertsCol), [pivot.colRacine, ouvertsCol]);

  /* En-têtes de colonnes, niveau par niveau, et libellé complet de chaque
     colonne (« 2026 / mars 2026 ») pour l'export. */
  const { niveauxCol, profondeurCol, feuillesSous, libelleComplet } = useMemo(() => {
    const ouvert = (n: NoeudColonne) => n.enfants.length > 0 && (n === pivot.colRacine || ouvertsCol.has(n.chemin));
    const sous = new Map<string, number>();
    const libelles = new Map<string, string>();
    const parNiveau: NoeudColonne[][] = [];
    const parcourir = (n: NoeudColonne, prefixe: string): number => {
      const lib = n === pivot.colRacine ? '' : (prefixe ? `${prefixe} / ${n.libelle}` : n.libelle);
      libelles.set(n.chemin, lib);
      if (n !== pivot.colRacine) (parNiveau[n.niveau] ||= []).push(n);
      const nb = ouvert(n) ? n.enfants.reduce((s, e) => s + parcourir(e, lib), 0) : 1;
      sous.set(n.chemin, nb);
      return nb;
    };
    parcourir(pivot.colRacine, '');
    return { niveauxCol: parNiveau, profondeurCol: Math.max(0, ...feuilles.map(f => f.niveau)), feuillesSous: sous, libelleComplet: libelles };
  }, [pivot.colRacine, ouvertsCol, feuilles]);

  // ── Regroupements ────────────────────────────────────────────────────────
  const dimsChoisissables = DIMENSIONS.filter(d => !(clientId && d.id === 'client'));
  const enTete = (d: { id: DimensionId; label: string }) => ({ id: d.id, label: d.label });

  /* ⊞ / ⊟ des en-têtes. Un regroupement vaut pour tout son niveau ; replier
     le dernier en-tête ouvert d'un niveau retire ce regroupement de l'axe
     (il disparaît des facettes), et le ⊞ suivant redemande le choix. */
  const SEP = '\u0001';
  const niveauDe = (chemin: string) => chemin.split(SEP).length - 1;
  const etatAxe = (axe: 'lignes' | 'colonnes') =>
    (axe === 'lignes' ? [ouverts, setOuverts] : [ouvertsCol, setOuvertsCol]) as [Set<string>, (s: Set<string>) => void];
  const choixPour = (axe: 'lignes' | 'colonnes', niveau: number) => {
    const autre = axe === 'lignes' ? colonnes : lignes;
    const plusHaut = reglage[axe].slice(0, niveau);
    return dimsChoisissables.filter(d => !autre.includes(d.id) && !plusHaut.includes(d.id)).map(enTete);
  };
  const replierAxe = (axe: 'lignes' | 'colonnes', chemin: string) => {
    const [ouv, setOuv] = etatAxe(axe);
    if (!chemin) { maj({ [axe]: [] } as Partial<Reglage>); setOuv(new Set()); setTri(null); return; }
    const restants = new Set([...ouv].filter(c => c !== chemin && !c.startsWith(chemin + SEP)));
    setOuv(restants);
    const profondeurUtile = Math.max(0, ...[...restants].map(niveauDe)) + 1;
    if (reglage[axe].length > profondeurUtile) maj({ [axe]: reglage[axe].slice(0, profondeurUtile) } as Partial<Reglage>);
    setTri(null);
  };
  const choisirAxe = (axe: 'lignes' | 'colonnes', niveau: number, chemin: string, d: DimensionId) => {
    const [ouv, setOuv] = etatAxe(axe);
    const liste = reglage[axe];
    if (liste[niveau] !== d) {
      maj({ [axe]: [...liste.slice(0, niveau), d] } as Partial<Reglage>);
      const garde = [...ouv].filter(c => niveauDe(c) <= niveau);
      setOuv(new Set(chemin ? [...garde, chemin] : garde));
    } else if (chemin) {
      setOuv(new Set(ouv).add(chemin));
    }
    setTri(null);
  };
  const toutDeplier = () => {
    setOuverts(new Set(cheminsDepliables(racine)));
    const tous: string[] = [];
    const parcourir = (n: NoeudColonne) => { if (n.enfants.length && n !== pivot.colRacine) tous.push(n.chemin); n.enfants.forEach(parcourir); };
    parcourir(pivot.colRacine);
    setOuvertsCol(new Set(tous));
  };
  const toutReplier = () => { setOuverts(new Set()); setOuvertsCol(new Set()); };
  const inverser = () => {
    maj({ lignes: colonnes, colonnes: lignes });
    setOuverts(ouvertsCol);
    setOuvertsCol(ouverts);
    setTri(null);
  };
  const basculerStatut = (s: string) => {
    const n = new Set(statutsExclus);
    if (n.has(s)) n.delete(s); else n.add(s);
    maj({ statutsExclus: { ...reglage.statutsExclus, [source]: [...n] } });
  };
  const basculerRegroupement = (axe: 'lignes' | 'colonnes', d: DimensionId) => {
    const liste = reglage[axe];
    maj({ [axe]: liste.includes(d) ? liste.filter(x => x !== d) : [...liste, d] } as Partial<Reglage>);
    setTri(null);
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
      for (const c of feuilles) for (const m of mesuresAffichees) ligne[`${libelleComplet.get(c.chemin)} — ${m.label}`] = valeurMesure(n.parColonne.get(c.chemin), m.id);
      for (const m of mesuresAffichees) ligne[`Total — ${m.label}`] = valeurMesure(n.total, m.id);
      return ligne;
    });
    exportToExcel(lignesExcel, `analyse-${source}-${iso(new Date())}`, 'Analyse');
  };

  // ── Facettes (comme la barre de recherche d'Odoo) ─────────────────────────
  const facettes: { cle: string; icone: JSX.Element; texte: string; retirer: () => void }[] = [];
  if (favoriActif) facettes.push({ cle: 'fav', icone: <Star className="w-3 h-3" />, texte: favoriActif, retirer: () => setFavoriActif(null) });
  if (statutsExclus.size && statutsDispo.some(s => statutsExclus.has(s))) {
    const inclus = statutsDispo.filter(s => !statutsExclus.has(s));
    facettes.push({ cle: 'statut', icone: <Filter className="w-3 h-3" />, texte: `Statut : ${inclus.join(' ou ') || 'aucun'}`, retirer: () => maj({ statutsExclus: { ...reglage.statutsExclus, [source]: [] } }) });
  }
  if (reglage.periode) {
    const lib = reglage.periode === 'perso'
      ? `${du ? du.split('-').reverse().join('/') : '…'} → ${au ? au.split('-').reverse().join('/') : '…'}`
      : PERIODES.find(p => p.id === reglage.periode)!.label;
    facettes.push({ cle: 'periode', icone: <Filter className="w-3 h-3" />, texte: `Période : ${lib}`, retirer: () => maj({ periode: null, du: '', au: '' }) });
  }
  if (lignes.length) facettes.push({ cle: 'lignes', icone: <Layers className="w-3 h-3" />, texte: `Lignes : ${lignes.map(d => dimension(d).label).join(' › ')}`, retirer: () => { maj({ lignes: [] }); setOuverts(new Set()); } });
  if (colonnes.length) facettes.push({ cle: 'colonnes', icone: <Layers className="w-3 h-3 rotate-90" />, texte: `Colonnes : ${colonnes.map(d => dimension(d).label).join(' › ')}`, retirer: () => { maj({ colonnes: [] }); setOuvertsCol(new Set()); } });

  // ── Rendu des cellules ────────────────────────────────────────────────────
  const indicateurTri = (mesure: MesureId, col: string | null) =>
    tri && tri.mesure === mesure && tri.colonne === col
      ? (tri.sens === 'desc' ? <ArrowDown className="inline w-3 h-3 ml-0.5" /> : <ArrowUp className="inline w-3 h-3 ml-0.5" />)
      : null;

  const enteteMesure = (m: { id: MesureId; label: string }, col: string | null, k: string) => (
    <th key={k} onClick={() => cliquerMesure(m.id, col)} title="Trier"
      className="px-2 py-1.5 text-right font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground border-b border-l border-border bg-muted">
      {m.label}{indicateurTri(m.id, col)}
    </th>
  );

  const cellules = (n: NoeudPivot, gras: boolean) => (
    <>
      {feuilles.map(c => mesuresAffichees.map(m => (
        <td key={`${c.chemin}-${m.id}`} className={`px-2 py-1 text-right tabular-nums whitespace-nowrap border-l border-border/60 ${gras ? 'font-semibold' : ''}`}>
          {formaterMesure(valeurMesure(n.parColonne.get(c.chemin), m.id), m.id)}
        </td>
      )))}
      {mesuresAffichees.map(m => (
        <td key={`t-${m.id}`} className="px-2 py-1 text-right tabular-nums whitespace-nowrap border-l border-border font-semibold bg-muted/30">
          {formaterMesure(valeurMesure(n.total, m.id), m.id)}
        </td>
      ))}
    </>
  );

  const enteteColonne = (c: NoeudColonne) => {
    const estRacine = c === pivot.colRacine;
    const ouvert = estRacine ? colonnes.length > 0 : ouvertsCol.has(c.chemin) && c.enfants.length > 0;
    return (
      <EnteteDepliable
        libelle={c.libelle}
        ouvert={ouvert}
        choix={choixPour('colonnes', c.niveau)}
        actuel={colonnes[c.niveau]}
        onReplier={() => replierAxe('colonnes', c.chemin)}
        onChoisir={d => choisirAxe('colonnes', c.niveau, c.chemin, d)}
        className="font-semibold"
      />
    );
  };

  const nbLignesEntete = (feuilles.length ? profondeurCol + 1 : 1) + 1;
  const cellCoin = (
    <th rowSpan={nbLignesEntete} className="sticky left-0 z-30 bg-muted px-2 py-1.5 text-left font-medium border-b border-border min-w-[14rem] align-bottom">
      {lignes.map(d => dimension(d).label).join(' › ')}
    </th>
  );
  const thCol = 'px-2 py-1.5 text-left whitespace-nowrap border-b border-l border-border bg-muted';

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      {/* ── Sources ── */}
      {sources.length > 1 && (
        <div className="flex gap-1 p-1 bg-muted rounded-lg self-start flex-wrap">
          {sources.map(s => (
            <button key={s} onClick={() => { maj({ source: s }); setTri(null); }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${source === s ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {LIBELLE_SOURCE[s]}
            </button>
          ))}
        </div>
      )}

      {/* ── Barre de recherche à facettes + Filtres / Regrouper par / Favoris ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 min-w-[16rem] flex-wrap items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          {facettes.map(f => (
            <span key={f.cle} className="flex items-center gap-1 rounded bg-primary/10 text-primary text-xs px-1.5 py-0.5">
              {f.icone}<span className="max-w-[18rem] truncate" title={f.texte}>{f.texte}</span>
              <button onClick={f.retirer} title="Retirer"><X className="w-3 h-3" /></button>
            </span>
          ))}
          <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher client, article, réf…"
            className="flex-1 min-w-[8rem] bg-transparent text-xs outline-none py-0.5" />
          {recherche && <button onClick={() => setRecherche('')} title="Effacer"><X className="w-3 h-3 text-muted-foreground" /></button>}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 h-8"><Filter className="w-4 h-4" /> Filtres</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60 max-h-[70vh] overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Statut</DropdownMenuLabel>
            {statutsDispo.length === 0 && <DropdownMenuItem disabled>Aucun statut</DropdownMenuItem>}
            {statutsDispo.map(s => (
              <DropdownMenuCheckboxItem key={s} checked={!statutsExclus.has(s)} onSelect={e => e.preventDefault()} onCheckedChange={() => basculerStatut(s)}>
                {s}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Période (date du document)</DropdownMenuLabel>
            {PERIODES.map(p => (
              <DropdownMenuCheckboxItem key={p.id} checked={reglage.periode === p.id}
                onCheckedChange={v => maj(v ? { periode: p.id, ...(p.id === 'perso' ? { du: reglage.du || `${new Date().getFullYear()}-01-01`, au: reglage.au || iso(new Date()) } : {}) } : { periode: null })}>
                {p.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 h-8"><Layers className="w-4 h-4" /> Regrouper par</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60 max-h-[70vh] overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Lignes</DropdownMenuLabel>
            {dimsChoisissables.map(d => (
              <DropdownMenuCheckboxItem key={`l-${d.id}`} checked={lignes.includes(d.id)} disabled={colonnes.includes(d.id)}
                onSelect={e => e.preventDefault()} onCheckedChange={() => basculerRegroupement('lignes', d.id)}>
                {d.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Colonnes</DropdownMenuLabel>
            {dimsChoisissables.map(d => (
              <DropdownMenuCheckboxItem key={`c-${d.id}`} checked={colonnes.includes(d.id)} disabled={lignes.includes(d.id)}
                onSelect={e => e.preventDefault()} onCheckedChange={() => basculerRegroupement('colonnes', d.id)}>
                {d.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 h-8"><Star className="w-4 h-4" /> Favoris</Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-2">
            <p className="px-1 pb-1 text-xs text-muted-foreground">Recherches enregistrées</p>
            {favoris.isLoading && <p className="px-1 py-1 text-xs text-muted-foreground">Chargement…</p>}
            {favoris.error && <p className="px-1 py-1 text-xs text-destructive">{(favoris.error as Error).message}</p>}
            {!favoris.isLoading && !favoris.data?.length && <p className="px-1 py-1 text-xs text-muted-foreground">Aucun favori pour cet écran.</p>}
            <div className="max-h-60 overflow-y-auto">
              {(favoris.data ?? []).map(f => (
                <div key={f.id} className="group flex items-center gap-1 rounded px-1 py-1 hover:bg-muted">
                  <button className="flex-1 text-left text-sm truncate" onClick={() => appliquerFavori(f)} title="Appliquer">
                    <Star className={`inline w-3 h-3 mr-1 ${favoriActif === f.nom ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground'}`} />{f.nom}
                  </button>
                  <button onClick={() => supprimerFavori(f)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive" title="Supprimer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 border-t border-border pt-2">
              <p className="px-1 pb-1 text-xs font-medium">Enregistrer la recherche actuelle</p>
              <div className="flex gap-1">
                <Input value={nomFavori} onChange={e => setNomFavori(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enregistrerFavori(); }}
                  placeholder="Nom du favori" className="h-8 text-xs" />
                <Button size="sm" className="h-8" onClick={enregistrerFavori} disabled={!nomFavori.trim()}>Enregistrer</Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* ── Mesures et outils ── */}
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1 h-8">Mesures <ChevronDown className="w-3 h-3" /></Button>
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
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Inverser lignes et colonnes" onClick={inverser}><ArrowLeftRight className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Tout déplier" onClick={toutDeplier}><ChevronsUpDown className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Tout replier" onClick={toutReplier}><ChevronsDownUp className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Exporter vers Excel" onClick={exporter}><Download className="w-4 h-4" /></Button>
        {reglage.periode === 'perso' && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
            Du <Input type="date" value={reglage.du} onChange={e => maj({ du: e.target.value })} className="h-8 w-36 text-xs" />
            au <Input type="date" value={reglage.au} onChange={e => maj({ au: e.target.value })} className="h-8 w-36 text-xs" />
          </div>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground hidden md:inline">⊞ / ⊟ sur les en-têtes de lignes et de colonnes pour regrouper ou replier</span>
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

      {/* ── Tableau croisé ── */}
      <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border bg-card">
        {faits.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Aucune ligne de {LIBELLE_SOURCE[source].toLowerCase()} pour ces filtres.</p>
        ) : (
          <table className="text-xs border-separate border-spacing-0 min-w-full">
            <thead className="sticky top-0 z-20">
              {/* Racine des colonnes : « Total » ⊞ / ⊟ */}
              <tr>
                {cellCoin}
                <th colSpan={(feuilles.length || 1) * M} className={thCol}>{enteteColonne(pivot.colRacine)}</th>
                {feuilles.length > 0 && (
                  <th rowSpan={profondeurCol + 1} colSpan={M} className={`${thCol} align-bottom`}>Total</th>
                )}
              </tr>
              {/* Niveaux de colonnes visibles */}
              {feuilles.length > 0 && Array.from({ length: profondeurCol }, (_, i) => i + 1).map(k => (
                <tr key={`niv-${k}`}>
                  {(niveauxCol[k] || []).filter(c => feuillesSous.has(c.chemin) && estVisible(c)).map(c => {
                    const feuille = feuilles.includes(c);
                    return (
                      <th key={c.chemin} colSpan={(feuillesSous.get(c.chemin) || 1) * M} rowSpan={feuille ? profondeurCol - k + 1 : 1}
                        className={`${thCol} ${feuille ? 'align-top' : ''}`}>
                        {enteteColonne(c)}
                      </th>
                    );
                  })}
                </tr>
              ))}
              {/* Mesures */}
              <tr>
                {feuilles.map(c => mesuresAffichees.map(m => enteteMesure(m, c.chemin, `${c.chemin}-${m.id}`)))}
                {mesuresAffichees.map(m => enteteMesure(m, null, `t-${m.id}`))}
              </tr>
            </thead>
            <tbody>
              {visibles.map(n => {
                const estRacine = n.niveau === 0;
                const ouvert = estRacine ? lignes.length > 0 : ouverts.has(n.chemin) && n.enfants.length > 0;
                return (
                  <Fragment key={n.chemin || 'racine'}>
                    <tr className={`${estRacine ? 'bg-muted/40 font-semibold' : 'hover:bg-muted/30'}`}>
                      <th scope="row" className={`sticky left-0 z-10 px-2 py-1 text-left font-normal border-b border-border/60 max-w-[28rem] ${estRacine ? 'bg-muted font-semibold' : 'bg-card'}`}>
                        <div className="flex items-center" style={{ paddingLeft: `${n.niveau * 1.1}rem` }}>
                          <EnteteDepliable
                            libelle={n.libelle}
                            ouvert={ouvert}
                            choix={choixPour('lignes', n.niveau)}
                            actuel={lignes[n.niveau]}
                            onReplier={() => replierAxe('lignes', n.chemin)}
                            onChoisir={d => choisirAxe('lignes', n.niveau, n.chemin, d)}
                          />
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

  /** Un en-tête de colonne est affiché si tous ses ancêtres sont ouverts. */
  function estVisible(c: NoeudColonne): boolean {
    const cles = c.chemin.split('\u0001').filter(Boolean);
    for (let i = 1; i < cles.length; i++) {
      const anc = '\u0001' + cles.slice(0, i).join('\u0001');
      if (!ouvertsCol.has(anc)) return false;
    }
    return true;
  }
}
