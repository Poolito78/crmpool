import { useState, useRef, useEffect, useMemo, useCallback, memo, Fragment, cloneElement, type ReactElement } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useCRM } from '@/lib/StoreContext';
import { generateId, formatMontant, formatDate, calculerTotalLigne, calculerFournisseurPrioritaire, getPrixPourQuantite, useEntrepots, type Produit, type ComposantProduit, type LigneKit, type PrixPalier, type VarianteDimension, type VarianteOption, type AchatDate } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import { rafraichirStockOdoo } from '@/lib/stockOdoo';
import { Plus, RefreshCw, Search, Edit2, Trash2, Upload, ArrowLeft, Filter, X, Download, Layers, Trash, Copy, ChevronUp, ChevronDown, ChevronsUpDown, Columns2, ExternalLink, GripVertical, Warehouse, Truck, Package, Save, FileText, ShoppingCart, Euro, LayoutList, Table2, Check } from 'lucide-react';
import FilterSuggestInput from '@/components/FilterSuggestInput';
import FilterChoiceInput, { parseChoiceFilter } from '@/components/FilterChoiceInput';
import ColResizeHandle from '@/components/ColResizeHandle';
import { useTableColumns } from '@/hooks/useTableColumns';
import PageHeaderSlot from '@/components/PageHeaderSlot';
import RowActionsMenu from '@/components/RowActionsMenu';
import ProduitFournisseursPanel from '@/components/ProduitFournisseursPanel';
import { useCurrentUser } from '@/hooks/useAuth';
import ProduitCombobox from '@/components/ProduitCombobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { exportToExcel } from '@/lib/exportExcel';
import { useCatalogueServeur, COLONNES_BASE, COLONNES_TEXTE } from '@/hooks/useCatalogueServeur';
import { getRalInfo } from '@/lib/ralColors';
import { InputNombre } from '@/components/InputNombre';

/**
 * Le champ de recherche, isolé du reste de l'écran.
 *
 * Il tenait sa valeur dans l'état de la PAGE. Chaque lettre frappée
 * redessinait donc l'écran Produits en entier — en-têtes, filtres, tableau,
 * pagination — avant que la lettre elle-même n'apparaisse. Sur un catalogue
 * de vingt-deux mille articles, cela se voit : on tape plus vite que
 * l'affichage.
 *
 * Ici, la frappe ne touche que ce champ : la lettre s'affiche tout de suite.
 * La page n'est prévenue qu'après un silence au clavier, et ne se redessine
 * donc qu'une fois la saisie posée, au lieu d'une fois par touche.
 */
const ChampRecherche = memo(function ChampRecherche(
  { valeurInitiale, onValider, className, placeholder }: {
    valeurInitiale: string;
    onValider: (v: string) => void;
    className?: string;
    placeholder?: string;
  },
) {
  const [texte, setTexte] = useState(valeurInitiale);
  const minuteur = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(minuteur.current), []);
  return (
    <Input
      placeholder={placeholder}
      value={texte}
      className={className}
      onChange={e => {
        const v = e.target.value;
        setTexte(v);
        clearTimeout(minuteur.current);
        minuteur.current = setTimeout(() => onValider(v), 180);
      }}
    />
  );
});

/** Date et heure d'une mise à jour de tarif. Le jour seul ne suffit pas :
 *  un prix corrigé deux fois dans la journée mérite qu'on les distingue. */
function dateHeure(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

const COLUMNS = [
  { key: 'reference',    label: 'Réf.',            align: 'left'  as const },
  { key: 'description',  label: 'Description',      align: 'left'  as const },
  { key: 'categorie',    label: 'Catégorie',        align: 'left'  as const },
  { key: 'fournisseur',  label: 'Fournisseur',      align: 'left'  as const },
  { key: 'prixAchat',    label: 'P. Achat',         align: 'right' as const },
  { key: 'coefficient',  label: 'Coeff.',           align: 'right' as const },
  { key: 'prixRevendeur',label: 'P. Revend.',       align: 'right' as const },
  { key: 'prixHT',       label: 'P. Public HT',    align: 'right' as const },
  { key: 'poids',        label: 'Poids (kg)',       align: 'right' as const },
  { key: 'consommation', label: 'Conso. (kg/m²)',   align: 'right' as const },
  { key: 'tva',          label: 'TVA %',            align: 'right' as const },
  { key: 'stock',           label: 'Stock',            align: 'right'  as const },
  { key: 'qteVendue',      label: 'Qté vendue',       align: 'right'  as const },
  { key: 'qteCommandeeF',  label: 'Qté cmd fourn.',   align: 'right'  as const },
  { key: 'valeurStock',    label: 'Valeur stock (PMP)', align: 'right'  as const },
  { key: 'stockOdoo',      label: 'Qté dispo Odoo',   align: 'right'  as const },
  { key: 'stockOdooPrevu', label: 'Prévisionnel Odoo', align: 'right'  as const },
  { key: 'disponibleVente', label: 'Dispo vente',      align: 'center' as const },
] as const;
type ColKey = typeof COLUMNS[number]['key'];
const DEFAULT_VISIBLE_COLS: ColKey[] = ['reference', 'description', 'categorie', 'prixAchat', 'coefficient', 'prixRevendeur', 'prixHT', 'stock', 'stockOdoo', 'stockOdooPrevu', 'qteVendue', 'qteCommandeeF', 'valeurStock'];

const emptyProduit = {
  reference: '', description: '', descriptionDetaillee: '', prixAchatMaj: '', prixVenteMaj: '', prixAchat: 0, coefficient: 1.6, prixHT: 0, coeffRevendeur: 1.6, remiseRevendeur: 30, prixRevendeur: 0, tva: 20, unite: 'pièce', poids: 0, consommation: 0, stock: 0, stockMin: 0, fournisseurId: '', categorie: '', ficheUrl: '', ficheLinkLabel: '', paliersPrix: [] as PrixPalier[],
  proprietaire: 'isosign' as 'isosign' | 'fournisseur', proprietaireFournisseurId: '',
  disponibleVente: true,
};

// Coefficient pilote le prix revendeur : prixRevendeur = prixAchat × coefficient
// Prix public déduit : prixHT = prixRevendeur / (1 - remise/100)
function calcPrixRevendeurFromCoeff(prixAchat: number, coeff: number) {
  return Math.round(prixAchat * coeff * 100) / 100;
}
function calcPrixPublicFromRevendeur(prixRevendeur: number, remise: number) {
  if (remise >= 100) return prixRevendeur;
  return Math.round(prixRevendeur / (1 - remise / 100) * 100) / 100;
}
function calcCoeffPublic(prixHT: number, prixAchat: number) {
  if (prixAchat === 0) return 0;
  return prixHT / prixAchat;
}
function calcMargeBrute(prixVente: number, prixAchat: number) {
  return prixVente - prixAchat;
}
function calcTauxMarge(prixVente: number, prixAchat: number) {
  if (prixAchat === 0) return 0;
  return ((prixVente - prixAchat) / prixAchat) * 100;
}
function calcTauxMarque(prixVente: number, prixAchat: number) {
  if (prixVente === 0) return 0;
  return ((prixVente - prixAchat) / prixVente) * 100;
}

export default function Produits() {
  const { produits, produitsCharges, updateProduits, fournisseurs, produitFournisseurs, updateProduitFournisseurs, devis, updateDevis, commandesClient, commandesFournisseur, clients } = useCRM();
  const { canAchat } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  /* Stable : sans quoi le champ de recherche se reconstruirait à chaque
     rendu de la page, et perdrait le bénéfice de son isolement. */
  const validerRecherche = useCallback((v: string) => setSearch(v), []);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [openFilterCols, setOpenFilterCols] = useState<Set<ColKey>>(new Set());
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
    try {
      const s = localStorage.getItem('produits_visible_cols');
      if (s) {
        // Filtre uniquement les clés valides (supprime les anciennes clés obsolètes)
        const validKeys = new Set(COLUMNS.map(c => c.key));
        const saved = new Set((JSON.parse(s) as ColKey[]).filter(k => validKeys.has(k)));
        if (saved.size > 0) { saved.add('qteCommandeeF'); saved.add('valeurStock'); saved.add('stockOdoo'); saved.add('stockOdooPrevu'); return saved; } // nouvelles colonnes : visibles chez les utilisateurs existants
      }
    } catch {}
    return new Set(DEFAULT_VISIBLE_COLS);
  });
  const [colChooserOpen, setColChooserOpen] = useState(false);
  const colChooserRef = useRef<HTMLDivElement>(null);
  // Vue liste (cartes) / tableau (colonnes), persistée
  const [produitsView, setProduitsView] = useState<'liste' | 'tableau'>(() => {
    try { return (localStorage.getItem('produits_view') as 'liste' | 'tableau') || 'tableau'; } catch { return 'tableau'; }
  });
  const setProduitsViewPersist = (v: 'liste' | 'tableau') => { setProduitsView(v); try { localStorage.setItem('produits_view', v); } catch { /* ignore */ } };
  // Colonnes : largeur (resize) + ordre (drag) via le hook partagé (persistés sous produits_col_*)
  const prodCols = useTableColumns<ColKey>('produits_col', COLUMNS.map(c => c.key));
  const [sortCol, setSortCol] = useState<ColKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Produit | null>(null);

  /**
   * Applique une modification à l'article en cours d'édition.
   *
   * En mode base, un article affiché peut ne pas encore figurer dans la liste
   * en mémoire, qui arrive en arrière-plan. Un simple map() ne trouverait rien
   * et perdrait la modification sans rien dire : on l'ajoute alors à la liste.
   */
  /**
   * Va chercher chez Odoo le stock et les prix, par tranches.
   *
   * Une tranche par appel : `qty_available` est un champ CALCULÉ, qu'Odoo
   * reconstruit en parcourant les mouvements. Le demander pour tout le
   * catalogue d'un coup dépasserait le temps alloué à la fonction. On boucle
   * donc tant qu'il reste des articles ET que l'utilisateur ne s'est pas
   * lassé — la fonction reprend d'elle-même là où elle en était, les articles
   * jamais lus d'abord.
   */
  const [syncOdoo, setSyncOdoo] = useState(false);
  const synchroniserOdoo = useCallback(async () => {
    setSyncOdoo(true);
    let total = 0, prix = 0;
    try {
      for (let tour = 0; tour < 60; tour++) {
        const { data, error } = await supabase.functions.invoke('odoo-stock-sync', {
          /* La fonction sait se relancer toute seule pour le tour de nuit ;
             ici c'est nous qui menons la boucle, écran à l'appui, et deux
             chaînes en parallèle reliraient deux fois les mêmes articles. */
          body: { limite: 400, chainer: false },
        });
        if (error) throw new Error(error.message);
        if (data?.erreur) throw new Error(data.erreur);
        total += data?.traites || 0;
        prix += data?.majPrix || 0;
        toast.info(`${total} article(s) relus — ${data?.restants ?? 0} restants`);
        if (!data?.restants || !data?.traites) break;
      }
      toast.success(`${total} article(s) actualisés depuis Odoo`, {
        description: prix ? `${prix} prix modifiés.` : 'Aucun prix n’a changé.',
      });
    } catch (e) {
      toast.error(`Actualisation impossible : ${(e as Error).message}`);
    } finally {
      setSyncOdoo(false);
    }
  }, []);

  /**
   * Relit le stock Odoo de l'article qu'on vient d'ouvrir.
   *
   * Un stock daté d'il y a trois semaines n'aide personne à promettre une
   * date. Un seul article est relu — celui qu'on regarde — donc l'appel est
   * court et n'alourdit ni la liste ni les autres écrans. S'il échoue, la
   * fiche s'ouvre quand même avec la dernière valeur connue et sa date.
   */
  useEffect(() => {
    const ref = editing?.referenceOdoo || editing?.reference;
    if (!editing?.id || !ref) return;
    let annule = false;
    rafraichirStockOdoo([ref]).then(stocks => {
      if (annule) return;
      const v = stocks[ref.toUpperCase()];
      if (!v) return;
      const id = editing.id;
      updateProduits(prev => prev.map(x => x.id === id
        ? { ...x, stockOdoo: v.dispo, stockOdooPrevu: v.prevu,
            stockOdooMaj: new Date().toISOString() }
        : x));
      setEditing(cur => cur && cur.id === id
        ? { ...cur, stockOdoo: v.dispo, stockOdooPrevu: v.prevu,
            stockOdooMaj: new Date().toISOString() }
        : cur);
    });
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  /* L'article en cours d'édition, lisible sans repasser par un `setState`.
     L'enregistrement se déclenchait depuis L'INTÉRIEUR d'un `setEditing` :
     une fonction de mise à jour d'état doit être pure, et React se réserve
     le droit de la rejouer — ou de l'abandonner. L'écriture partait donc
     deux fois, ou pas du tout, sans que rien ne le dise. */
  const editingRef = useRef<Produit | null>(null);
  editingRef.current = editing;

  const majProduitEdite = useCallback((f: (p: Produit) => Produit) => {
    const cur = editingRef.current;
    if (!cur) return;
    updateProduits(prev => prev.some(x => x.id === cur.id)
      ? prev.map(x => (x.id === cur.id ? f(x) : x))
      : [...prev, f(cur)]);
  }, [updateProduits]);
  const [form, setForm] = useState(emptyProduit);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importMode, setImportMode] = useState<'add' | 'update'>('add');
  const [importSelectedCols, setImportSelectedCols] = useState<Set<string>>(new Set());
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});
  const [fromDevis, setFromDevis] = useState(false);
  const [returnDevisId, setReturnDevisId] = useState<string | null>(null);
  const [composants, setComposants] = useState<ComposantProduit[]>([]);
  const [composantSearches, setComposantSearches] = useState<string[]>([]);
  const [composantOpenIdx, setComposantOpenIdx] = useState<number | null>(null);
  const [composantPickerOpen, setComposantPickerOpen] = useState(false);
  const [composantPickerSearch, setComposantPickerSearch] = useState('');
  const [isTypeKit, setIsTypeKit] = useState(false);
  const [lignesKit, setLignesKit] = useState<LigneKit[]>([]);
  const [kitDragIdx, setKitDragIdx] = useState<number | null>(null);
  const [kitDragOverIdx, setKitDragOverIdx] = useState<number | null>(null);
  const [showPrixPublic, setShowPrixPublic] = useState(false);
  const [editingStack, setEditingStack] = useState<import('@/lib/store').Produit[]>([]);
  const [paliersPrix, setPaliersPrix] = useState<PrixPalier[]>([]);
  const [achatsManuel, setAchatsManuel] = useState<AchatDate[]>([]);
  const [variantes, setVariantes] = useState<VarianteDimension[]>([]);
  const [produitTab, setProduitTab] = useState<'infos' | 'stock' | 'fournisseurs' | 'devis' | 'commandes' | 'commandesF' | 'valorisation'>('infos');
  const [entrepotStockEdit, setEntrepotStockEdit] = useState<{ id: string; value: string } | null>(null);

  // Hook entrepôts (chargé une seule fois)
  const { entrepots, stockEntrepots, upsertStock: upsertStockEntrepot } = useEntrepots();

  // Persist visible columns
  useEffect(() => {
    localStorage.setItem('produits_visible_cols', JSON.stringify([...visibleCols]));
    // Clear filters for hidden columns
    setColumnFilters(prev => {
      const next = { ...prev };
      (Object.keys(next) as ColKey[]).forEach(k => { if (!visibleCols.has(k)) delete next[k]; });
      return next;
    });
  }, [visibleCols]);

  // Close column chooser on outside click
  useEffect(() => {
    if (!colChooserOpen) return;
    const handler = (e: MouseEvent) => {
      if (colChooserRef.current && !colChooserRef.current.contains(e.target as Node)) setColChooserOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colChooserOpen]);

  function handleSort(key: ColKey) {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(key); setSortDir('asc'); }
  }

  // Colonnes liées aux achats/marges — masquées sans droit Achat.
  const ACHAT_COLS: ColKey[] = ['prixAchat', 'coefficient', 'valeurStock'];
  // Colonnes visibles dans l'ordre choisi par l'utilisateur (via le hook partagé)
  const orderedVisibleCols = prodCols.ordered(COLUMNS, k => visibleCols.has(k) && (canAchat || !ACHAT_COLS.includes(k)));

  function toggleFilterCol(col: ColKey) {
    setOpenFilterCols(prev => {
      const n = new Set(prev);
      if (n.has(col)) {
        n.delete(col);
        // efface le filtre de la colonne quand on referme
        setColumnFilters(f => { const nf = { ...f }; delete nf[col]; return nf; });
      } else {
        n.add(col);
      }
      return n;
    });
  }

  // Contrôle de filtre par colonne (affiché inline dans l'en-tête)
  function renderProdFilter(colKey: ColKey) {
    const fVal = columnFilters[colKey] || '';
    const set = (v: string) => setColumnFilters(prev => ({ ...prev, [colKey]: v }));
    if (colKey === 'disponibleVente') {
      return <FilterChoiceInput value={fVal} onChange={set} options={[
        { value: '', label: 'Tous' },
        { value: 'oui', label: 'Disponible' },
        { value: 'non', label: 'Non dispo' },
      ]} />;
    }
    const suggSource: Partial<Record<ColKey, string[]>> = {
      reference: produits.map(p => p.reference).filter(Boolean),
      description: produits.map(p => p.description).filter(Boolean),
      categorie: produits.map(p => p.categorie).filter(Boolean) as string[],
      fournisseur: fournisseurs.map(f => f.societe || f.nom).filter(Boolean) as string[],
    };
    return <FilterSuggestInput value={fVal} onChange={set} suggestions={suggSource[colKey] || []} placeholder="Filtrer…" />;
  }

  // Auto-open product from query param (e.g. from devis)
  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    const returnDevis = searchParams.get('returnDevis');
    const from = searchParams.get('from');
    const devisId = searchParams.get('devisId');
    if (returnDevis) {
      setFromDevis(true);
      setReturnDevisId(returnDevis);
    } else if (from === 'devis') {
      setFromDevis(true);
      if (devisId) setReturnDevisId(devisId);
    }
    if (highlightId) {
      const prod = produits.find(p => p.id === highlightId);
      if (prod) {
        openEdit(prod);
      }
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ensure old products get correct coefficient (now drives revendeur price)
  // Force remise revendeur to 30% for all products
  const safeProduits = useMemo(() => {
    let needsUpdate = false;

    // Helper to calculate prixAchat of a composite product from its composants
    // Uses raw produits to avoid circular reference
    function calcPrixAchatCompose(p: typeof produits[0]): number {
      if (!p.composants || p.composants.length === 0) return p.prixAchat ?? 0;
      const total = p.composants.reduce((sum, c) => {
        const comp = produits.find(pr => pr.id === c.produitId);
        if (!comp) return sum;
        // Recursive for nested composites
        const compPrix = (comp.composants && comp.composants.length > 0)
          ? calcPrixAchatCompose(comp)
          : (comp.prixAchat ?? 0);
        // Mode poids : quantite = poidsKg / poids_unitaire (ou = poidsKg si vendu au kg)
        if (c.poidsKg != null) {
          const qte = comp.unite?.toLowerCase() === 'kg' ? c.poidsKg : (comp.poids && comp.poids > 0 ? c.poidsKg / comp.poids : c.poidsKg);
          return sum + compPrix * qte;
        }
        // Mode % : coût = pct% du prix unitaire
        if (c.consommationPct != null) return sum + compPrix * c.consommationPct / 100;
        return sum + compPrix * c.quantite;
      }, 0);
      return Math.round(total * 100) / 100;
    }

    const safe = produits.map(p => {
      const isCompose = p.composants && p.composants.length > 0;
      const prixAchat = isCompose ? calcPrixAchatCompose(p) : (p.prixAchat ?? 0);
      const remise = 30;
      const prixRevendeur = p.prixRevendeur ?? 0;
      const coefficient = prixAchat > 0 && prixRevendeur > 0
        ? prixRevendeur / prixAchat
        : (p.coefficient ?? 1.6);
      const recalcRevendeur = calcPrixRevendeurFromCoeff(prixAchat, coefficient);
      const recalcPublic = calcPrixPublicFromRevendeur(recalcRevendeur, remise);
      if (p.remiseRevendeur !== 30 || p.prixHT !== recalcPublic || (isCompose && p.prixAchat !== prixAchat)) needsUpdate = true;
      return {
        ...p,
        prixAchat,
        coefficient,
        coeffRevendeur: coefficient,
        remiseRevendeur: remise,
        prixRevendeur: recalcRevendeur,
        prixHT: recalcPublic,
        composants: p.composants, // toujours préserver explicitement
      };
    });
    /* CE RATTRAPAGE N'ÉCRIT PLUS EN BASE. C'est lui qui effaçait les prix.
     *
     * Il recalculait les tarifs de tout le catalogue, puis les RÉÉCRIVAIT —
     * en piochant dans `safe`, c'est-à-dire dans l'instantané pris AVANT la
     * saisie. Un prix d'achat tapé à la main était donc remplacé, quelques
     * secondes plus tard, par la valeur d'avant : 170,99 redevenait 0, et la
     * date de mise à jour du tarif enregistrait fidèlement l'effacement.
     * Rien ne le signalait, puisque l'écriture réussissait.
     *
     * Le déclencheur pouvait être n'importe quel changement du catalogue,
     * y compris la relecture du stock Odoo à l'ouverture de la fiche — d'où
     * l'apparition du défaut au moment où cette relecture a été ajoutée.
     *
     * Le calcul reste, car l'affichage en a besoin : coefficient déduit du
     * couple achat/revendeur, remise revendeur à 30 %, prix d'achat des
     * articles composés. Simplement, il ne s'impose plus à la base. Une
     * correction de données se décide et se date ; elle ne se glisse pas
     * dans un rendu, avec un instantané périmé sous le bras.
     *
     * (`needsUpdate` reste calculé plus haut : il ne sert plus qu'à dire que
     * l'affichage diffère du stocké, ce qui est justement le cas normal.) */
    void needsUpdate;
    return safe;
  }, [produits]); // eslint-disable-line react-hooks/exhaustive-deps

  // Catégories distinctes existantes (suggestions pour le champ Catégorie)
  const categoriesList = useMemo(() => [...new Set(produits.map(p => p.categorie).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'fr')), [produits]);

  // ── Image d'option de variante : upload (glisser-déposer / coller) ───────────
  const [varImgUploading, setVarImgUploading] = useState<string | null>(null); // id option en cours
  const setOptImageUrl = (dIdx: number, oIdx: number, url: string | undefined) =>
    setVariantes(prev => prev.map((d, i) => i === dIdx ? { ...d, options: d.options.map((o, j) => j === oIdx ? { ...o, imageUrl: url } : o) } : d));
  async function uploadVarianteImage(file: File, dIdx: number, oIdx: number, optId: string) {
    if (!file.type.startsWith('image/')) { toast.error('Le fichier n\'est pas une image'); return; }
    setVarImgUploading(optId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id;
      if (!uid) { toast.error('Session expirée'); return; }
      const ext = (file.name.split('.').pop() || file.type.split('/')[1] || 'png').toLowerCase();
      // Le 1er dossier doit être l'UID utilisateur (politique RLS du bucket devis-pj)
      const path = `${uid}/variantes/${generateId()}.${ext}`;
      const { error } = await supabase.storage.from('devis-pj').upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (error) { toast.error('Upload échoué : ' + error.message); return; }
      const { data } = await supabase.storage.from('devis-pj').createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (data?.signedUrl) { setOptImageUrl(dIdx, oIdx, data.signedUrl); toast.success('Image ajoutée'); }
    } catch (e) { toast.error('Erreur lors de l\'upload'); console.error(e); }
    finally { setVarImgUploading(null); }
  }

  // Quantité totale commandée par produit (somme des lignes de toutes les commandes clients)
  const qteVendueParProduit = useMemo(() => {
    const map: Record<string, number> = {};
    for (const cc of commandesClient) {
      for (const l of cc.lignes) {
        if (l.produitId) map[l.produitId] = (map[l.produitId] || 0) + (l.quantite || 0);
      }
    }
    return map;
  }, [commandesClient]);

  // Quantité totale commandée aux fournisseurs par produit (somme des lignes de toutes les commandes fournisseur)
  const qteCommandeeFournParProduit = useMemo(() => {
    const map: Record<string, number> = {};
    for (const cf of commandesFournisseur) {
      for (const l of cf.lignes) {
        if (l.produitId) map[l.produitId] = (map[l.produitId] || 0) + (l.quantite || 0);
      }
    }
    return map;
  }, [commandesFournisseur]);

  // Stock réservé : quantité dans commandes actives non encore livrées
  const stockReserveParProduit = useMemo(() => {
    const map: Record<string, number> = {};
    for (const cc of commandesClient.filter(c => ['a_traiter', 'accuse_envoye', 'commande_envoyee'].includes(c.statut))) {
      for (const l of cc.lignes) {
        if (l.produitId) map[l.produitId] = (map[l.produitId] || 0) + (l.quantite || 0);
      }
    }
    return map;
  }, [commandesClient]);

  // Achats datés par produit : auto (lignes de commandes fournisseur) + manuel (produit.achatsHistorique)
  const achatsParProduit = useMemo(() => {
    const map = new Map<string, AchatDate[]>();
    for (const cf of commandesFournisseur) {
      for (const l of cf.lignes) {
        if (!l.produitId) continue;
        const arr = map.get(l.produitId) || [];
        arr.push({ date: cf.dateCreation, prix: l.prixAchat || 0, quantite: l.quantite || 0, source: 'commande', ref: cf.numero });
        map.set(l.produitId, arr);
      }
    }
    for (const p of produits) {
      if (p.achatsHistorique?.length) {
        const arr = map.get(p.id) || [];
        for (const a of p.achatsHistorique) arr.push({ ...a, source: a.source || 'manuel' });
        map.set(p.id, arr);
      }
    }
    for (const arr of map.values()) arr.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return map;
  }, [commandesFournisseur, produits]);

  // Agrégat des achats par produit : valeur cumulée + quantité totale achetée (base du PMP)
  const achatsAggParProduit = useMemo(() => {
    const map = new Map<string, { valeur: number; qte: number }>();
    for (const [pid, arr] of achatsParProduit) {
      let valeur = 0, qte = 0;
      for (const a of arr) { valeur += (a.prix || 0) * (a.quantite || 0); qte += (a.quantite || 0); }
      map.set(pid, { valeur, qte });
    }
    return map;
  }, [achatsParProduit]);
  // PMP (prix moyen pondéré) = Σ(prix×qté) / Σ(qté)
  const pmpParProduit = useCallback((pid: string) => {
    const agg = achatsAggParProduit.get(pid);
    return agg && agg.qte > 0 ? agg.valeur / agg.qte : 0;
  }, [achatsAggParProduit]);
  // Valeur de stock = PMP × stock courant (valorisation de l'inventaire restant)
  const valeurStockParProduit = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of produits) map[p.id] = pmpParProduit(p.id) * (p.stock || 0);
    return map;
  }, [produits, pmpParProduit]);

  /* Mode « base de données », comme Odoo : la recherche, le tri et la
     pagination sont faits par Supabase, qui ne renvoie que 50 lignes.
     On y renonce dès qu'un filtre ou un tri porte sur une colonne que la base
     ne connaît pas — quantité vendue, valeur de stock, fournisseur, ou un
     montant, PostgREST ne sachant pas chercher dans un nombre. Dans ce cas on
     retombe sur la liste en mémoire, exacte mais plus lente.

     Ce calcul est ici, AVANT le filtrage mémoire, et non plus après : le
     filtrage a besoin de savoir s'il sert à quelque chose. */
  const filtresActifs = Object.entries(columnFilters).filter(([, v]) => v);
  const filtreHorsBase = filtresActifs.some(([k]) => !COLONNES_TEXTE[k]);
  const triHorsBase = !!sortCol && !COLONNES_BASE[sortCol];
  const modeServeur = !filtreHorsBase && !triHorsBase;

  /* Mémorisé : sans cela le filtrage repassait sur les 22 634 articles à
     chaque rendu — donc à chaque frappe dans la recherche, à chaque case
     cochée, à chaque changement de page.

     ET SURTOUT : on ne filtre plus DU TOUT quand c'est la base qui cherche.
     Le résultat était calculé puis jeté — vingt-deux mille articles passés
     au crible, trois `toLowerCase()` chacun, soit près de soixante-dix mille
     chaînes créées puis abandonnées À CHAQUE TOUCHE FRAPPÉE. Le fil
     d'exécution était pris pendant ce temps : la frappe accrochait, et la
     réponse de la base — arrivée en quelques dizaines de millisecondes —
     attendait son tour pour s'afficher. D'où « le temps de recherche est
     trop long » alors que la base, elle, répondait tout de suite. */
  const filtered = useMemo(() => modeServeur ? [] : safeProduits.filter(p => {
    // Global search
    if (search) {
      const q = search.toLowerCase();
      const matchBase = [p.description, p.reference, p.categorie].some(v => v?.toLowerCase().includes(q));
      const matchVariante = p.variantes?.some(dim => dim.options.some(opt => opt.label.toLowerCase().includes(q)));
      if (!matchBase && !matchVariante) return false;
    }
    // Column filters (supports !empty sentinel for "non vide")
    for (const [key, val] of Object.entries(columnFilters)) {
      if (!val) continue;
      const isNonVide = val === '!empty';
      const v = val.toLowerCase();
      const pfsF = key === 'fournisseur' ? produitFournisseurs.filter(pf => pf.produitId === p.id) : [];
      const fournNames = key === 'fournisseur' ? pfsF.map(pf => fournisseurs.find(f => f.id === pf.fournisseurId)?.societe || '').join(' ') : '';
      switch (key) {
        case 'reference':    if (isNonVide ? !p.reference?.trim() : !p.reference?.toLowerCase().includes(v)) return false; break;
        case 'description':  if (isNonVide ? !p.description?.trim() : !p.description?.toLowerCase().includes(v)) return false; break;
        case 'categorie':    if (isNonVide ? !p.categorie?.trim() : !p.categorie?.toLowerCase().includes(v)) return false; break;
        case 'fournisseur':  if (isNonVide ? (!fournNames.trim() && !p.fournisseurId) : !fournNames.toLowerCase().includes(v)) return false; break;
        case 'prixAchat':    if (isNonVide ? p.prixAchat === 0 : (!formatMontant(p.prixAchat).toLowerCase().includes(v) && !String(p.prixAchat).includes(v))) return false; break;
        case 'coefficient':  if (isNonVide ? p.coefficient === 0 : !String(p.coefficient.toFixed(2)).includes(v)) return false; break;
        case 'prixHT':       if (isNonVide ? p.prixHT === 0 : (!formatMontant(p.prixHT).toLowerCase().includes(v) && !String(p.prixHT).includes(v))) return false; break;
        case 'prixRevendeur':if (isNonVide ? p.prixRevendeur === 0 : (!formatMontant(p.prixRevendeur).toLowerCase().includes(v) && !String(p.prixRevendeur).includes(v))) return false; break;
        case 'poids':        if (isNonVide ? !p.poids : !String(p.poids || 0).includes(v)) return false; break;
        case 'consommation': if (isNonVide ? !p.consommation : !String(p.consommation || 0).includes(v)) return false; break;
        case 'tva':          if (isNonVide ? p.tva === 0 : !String(p.tva).includes(v)) return false; break;
        case 'stock':        if (isNonVide ? p.stock === 0 : !String(p.stock).includes(v)) return false; break;
        case 'stockOdoo':    if (isNonVide ? !(p.stockOdoo ?? null) : !String(p.stockOdoo ?? '').includes(v)) return false; break;
        case 'stockOdooPrevu': if (isNonVide ? !(p.stockOdooPrevu ?? null) : !String(p.stockOdooPrevu ?? '').includes(v)) return false; break;
        case 'qteVendue':    if (isNonVide ? !(qteVendueParProduit[p.id] > 0) : !String(qteVendueParProduit[p.id] || 0).includes(v)) return false; break;
        case 'qteCommandeeF': if (isNonVide ? !(qteCommandeeFournParProduit[p.id] > 0) : !String(qteCommandeeFournParProduit[p.id] || 0).includes(v)) return false; break;
        case 'valeurStock':  if (isNonVide ? !(valeurStockParProduit[p.id] > 0) : !String(Math.round(valeurStockParProduit[p.id] || 0)).includes(v)) return false; break;
        case 'disponibleVente': if (isNonVide ? !(p.disponibleVente !== false) : !String(p.disponibleVente !== false ? 'oui' : 'non').includes(v)) return false; break;
      }
    }
    return true;
  }), [modeServeur, safeProduits, search, columnFilters, produitFournisseurs, fournisseurs,
       qteVendueParProduit, qteCommandeeFournParProduit, valeurStockParProduit]);

  const sortedFiltered = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      let av: string | number = 0, bv: string | number = 0;
      switch (sortCol) {
        case 'reference':    av = a.reference || ''; bv = b.reference || ''; break;
        case 'description':  av = a.description || ''; bv = b.description || ''; break;
        case 'categorie':    av = a.categorie || ''; bv = b.categorie || ''; break;
        case 'fournisseur': { const pA = calculerFournisseurPrioritaire(a.id, 1, produitFournisseurs, fournisseurs); const pB = calculerFournisseurPrioritaire(b.id, 1, produitFournisseurs, fournisseurs); av = (pA ? fournisseurs.find(f => f.id === pA.fournisseurId)?.societe || '' : ''); bv = (pB ? fournisseurs.find(f => f.id === pB.fournisseurId)?.societe || '' : ''); break; }
        case 'prixAchat':    av = a.prixAchat; bv = b.prixAchat; break;
        case 'coefficient':  av = a.coefficient; bv = b.coefficient; break;
        case 'prixRevendeur':av = a.prixRevendeur; bv = b.prixRevendeur; break;
        case 'prixHT':       av = a.prixHT; bv = b.prixHT; break;
        case 'poids':        av = a.poids || 0; bv = b.poids || 0; break;
        case 'consommation': av = a.consommation || 0; bv = b.consommation || 0; break;
        case 'tva':          av = a.tva; bv = b.tva; break;
        case 'stock':           av = a.stock; bv = b.stock; break;
        case 'stockOdoo':       av = a.stockOdoo ?? -1; bv = b.stockOdoo ?? -1; break;
        case 'stockOdooPrevu':  av = a.stockOdooPrevu ?? -1; bv = b.stockOdooPrevu ?? -1; break;
        case 'qteVendue':       av = qteVendueParProduit[a.id] || 0; bv = qteVendueParProduit[b.id] || 0; break;
        case 'qteCommandeeF':   av = qteCommandeeFournParProduit[a.id] || 0; bv = qteCommandeeFournParProduit[b.id] || 0; break;
        case 'valeurStock':     av = valeurStockParProduit[a.id] || 0; bv = valeurStockParProduit[b.id] || 0; break;
        case 'disponibleVente': av = (a.disponibleVente !== false ? 1 : 0); bv = (b.disponibleVente !== false ? 1 : 0); break;
      }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === 'asc' ? av - (bv as number) : (bv as number) - av;
    });
  }, [filtered, sortCol, sortDir, fournisseurs, produitFournisseurs, qteVendueParProduit, qteCommandeeFournParProduit, valeurStockParProduit]);

  /* Pagination — même principe qu'Odoo : 50 articles par page.
     Le catalogue compte plus de 22 000 références depuis l'import Odoo ; les
     poser toutes dans le DOM d'un coup demandait plusieurs secondes à
     l'ouverture, et autant à chaque tri. Le filtrage, lui, reste fait sur la
     totalité : on pagine l'affichage, pas la recherche. */
  const PAR_PAGE = 50;
  const [page, setPage] = useState(1);

  /* Vue « modèles », comme Odoo : la liste de vente ne propose pas les
     déclinaisons. J11C2, J11C2DOUILLE80, J11C2SANSDOUILLE et J11C2DROUGE
     n'apparaissent que sous le modèle J11, une fois celui-ci ouvert.
     22 634 lignes deviennent ainsi 7 782. */
  const [modeleOuvert, setModeleOuvert] = useState<string | null>(null);

  const serveur = useCatalogueServeur({
    page,
    parPage: PAR_PAGE,
    recherche: search,
    triCol: sortCol,
    triSens: sortDir,
    filtres: columnFilters as Record<string, string>,
    actif: modeServeur,
    seulementModeles: !modeleOuvert,
    modeleCle: modeleOuvert,
  });

  // Ouvrir ou refermer un modèle remet au début : la pagination change d'objet.
  useEffect(() => { setPage(1); }, [modeleOuvert]);

  const totalLignes = modeServeur ? serveur.total : sortedFiltered.length;
  const nbPages = Math.max(1, Math.ceil(totalLignes / PAR_PAGE));
  const pageCourante = Math.min(page, nbPages);
  const affiches = useMemo(
    () => modeServeur
      ? serveur.lignes
      : sortedFiltered.slice((pageCourante - 1) * PAR_PAGE, pageCourante * PAR_PAGE),
    [modeServeur, serveur.lignes, sortedFiltered, pageCourante],
  );

  // Un nouveau filtre ou un nouveau tri renvoie au début : rester page 12
  // après avoir tapé une recherche donnerait une liste vide sans raison visible.
  useEffect(() => { setPage(1); }, [search, columnFilters, sortCol, sortDir]);

  // Stock par dépôt (entrepôt) par produit — pour l'affichage détaillé quand plusieurs dépôts
  const depotStocksParProduit = useMemo(() => {
    const m = new Map<string, { nom: string; stock: number }[]>();
    for (const s of stockEntrepots) {
      if (!s.stock) continue;
      const nom = entrepots.find(e => e.id === s.entrepotId)?.nom || '?';
      const arr = m.get(s.produitId) || [];
      arr.push({ nom, stock: s.stock });
      m.set(s.produitId, arr);
    }
    // Tri par stock décroissant pour chaque produit
    for (const arr of m.values()) arr.sort((a, b) => b.stock - a.stock);
    return m;
  }, [stockEntrepots, entrepots]);

  // Nom client (société de préférence) pour les onglets Devis / Commandes de la fiche produit
  const clientLabel = (clientId?: string) => {
    const c = clients.find(cl => cl.id === clientId);
    return c ? (c.societe || c.nom || '—') : '—';
  };
  const fournLabel = (fournisseurId?: string) => {
    const f = fournisseurs.find(fo => fo.id === fournisseurId);
    return f ? (f.societe || f.nom || '—') : '—';
  };
  // Devis contenant le produit en cours d'édition (qté cumulée + montant HT)
  const produitDevisRows = useMemo(() => {
    if (!editing) return [];
    const pid = editing.id;
    return devis
      .map(d => {
        const lignes = d.lignes.filter(l => l.produitId === pid);
        if (lignes.length === 0) return null;
        const qte = lignes.reduce((s, l) => s + (l.quantite || 0), 0);
        const montantHT = lignes.reduce((s, l) => s + calculerTotalLigne(l).totalHT, 0);
        return { id: d.id, numero: d.numero, date: d.dateCreation, statut: d.statut, clientId: d.clientId, qte, montantHT };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [editing, devis]);
  // Commandes client contenant le produit
  const produitCommandesRows = useMemo(() => {
    if (!editing) return [];
    const pid = editing.id;
    return commandesClient
      .map(c => {
        const lignes = c.lignes.filter(l => l.produitId === pid);
        if (lignes.length === 0) return null;
        const qte = lignes.reduce((s, l) => s + (l.quantite || 0), 0);
        const montantHT = lignes.reduce((s, l) => s + calculerTotalLigne(l).totalHT, 0);
        return { id: c.id, numero: c.numero, date: c.dateCreation, statut: c.statut, clientId: c.clientId, qte, montantHT };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [editing, commandesClient]);
  // Commandes fournisseur contenant le produit (côté achat)
  const produitCommandesFournRows = useMemo(() => {
    if (!editing) return [];
    const pid = editing.id;
    return commandesFournisseur
      .map(c => {
        const lignes = c.lignes.filter(l => l.produitId === pid);
        if (lignes.length === 0) return null;
        const qte = lignes.reduce((s, l) => s + (l.quantite || 0), 0);
        const montantHT = lignes.reduce((s, l) => s + (l.total || 0), 0);
        return { id: c.id, numero: c.numero, date: c.dateCreation, statut: c.statut, fournisseurId: c.fournisseurId, qte, montantHT };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [editing, commandesFournisseur]);

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => {
    // porte sur la page affichée, comme dans Odoo
    setSelected(prev => prev.size === affiches.length ? new Set() : new Set(affiches.map(p => p.id)));
  };
  
  function confirmDelete(id?: string) {
    setDeleteTarget(id || null);
    setDeleteConfirmOpen(true);
  }

  function executeDelete() {
    if (deleteTarget) {
      // Supprimer un seul produit
      updateProduits(prev => prev.filter(p => p.id !== deleteTarget));
      toast.success('Produit supprimé');
    } else {
      // Supprimer les sélectionnés
      updateProduits(prev => prev.filter(p => !selected.has(p.id)));
      toast.success(`${selected.size} produit(s) supprimé(s)`);
      setSelected(new Set());
    }
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  }

  function openNew() { setEditing(null); setForm(emptyProduit); setComposants([]); setComposantSearches([]); setComposantOpenIdx(null); setIsTypeKit(false); setLignesKit([]); setPaliersPrix([]); setAchatsManuel([]); setVariantes([]); setEditingStack([]); setProduitTab('infos'); setEntrepotStockEdit(null); setDialogOpen(true); }

  function duplicate(p: Produit) {
    const newId = generateId();
    const newRef = `${p.reference}-COPIE`;
    const newProd = { ...p, id: newId, reference: newRef, dateCreation: new Date().toISOString().split('T')[0] };
    updateProduits(prev => [...prev, newProd]);
    if (newProd.composants && newProd.composants.length > 0) {
      supabase.from('produits').update({ composants: newProd.composants as any }).eq('id', newId).then(({ error }) => {
        if (error) console.error('Erreur duplication composants:', error);
      });
    }
    toast.success(`Produit dupliqué — réf. ${newRef}`);
  }
  function openEdit(p: Produit) {
    /* Rouvrir la fiche déjà ouverte remettrait le formulaire à ce qu'il y a
       en base, effaçant la saisie en cours. On ne recharge donc que si l'on
       change d'article. */
    if (dialogOpen && editingRef.current?.id === p.id) return;
    setEditing(p);
    const comps = p.composants || [];
    // Recalculate prixAchat from composants if composite (handles qty / poids / % modes)
    let prixAchat = p.prixAchat;
    if (comps.length > 0) {
      const total = comps.reduce((sum, c) => {
        const cp = produits.find(pr => pr.id === c.produitId);
        if (!cp) return sum;
        if (c.poidsKg != null) {
          const qte = cp.unite?.toLowerCase() === 'kg' ? c.poidsKg : (cp.poids && cp.poids > 0 ? c.poidsKg / cp.poids : c.poidsKg);
          return sum + cp.prixAchat * qte;
        }
        if (c.consommationPct != null) return sum + cp.prixAchat * c.consommationPct / 100;
        return sum + cp.prixAchat * c.quantite;
      }, 0);
      if (total > 0) prixAchat = Math.round(total * 100) / 100;
    }
    const prixRevendeur = calcPrixRevendeurFromCoeff(prixAchat, p.coefficient);
    const prixHT = calcPrixPublicFromRevendeur(prixRevendeur, p.remiseRevendeur);
    setForm({ reference: p.reference, description: p.description, descriptionDetaillee: p.descriptionDetaillee || '', prixAchatMaj: p.prixAchatMaj || '', prixVenteMaj: p.prixVenteMaj || '', prixAchat, coefficient: p.coefficient, prixHT, coeffRevendeur: p.coeffRevendeur, remiseRevendeur: p.remiseRevendeur, prixRevendeur, tva: p.tva, unite: p.unite, poids: p.poids || 0, consommation: p.consommation || 0, stock: p.stock, stockMin: p.stockMin, fournisseurId: p.fournisseurId || '', categorie: p.categorie || '', ficheUrl: p.ficheUrl || '', ficheLinkLabel: p.ficheLinkLabel || '', paliersPrix: p.paliersPrix || [], proprietaire: p.proprietaire ?? 'isosign', proprietaireFournisseurId: p.proprietaireFournisseurId || '', disponibleVente: p.disponibleVente ?? true });
    setComposants(comps);
    setComposantSearches(comps.map(c => { const pr = produits.find(x => x.id === c.produitId); return pr ? `${pr.reference} — ${pr.description}` : ''; }));
    setComposantOpenIdx(null);
    setIsTypeKit(p.typeKit ?? false);
    setLignesKit(p.lignesKit || []);
    setPaliersPrix(p.paliersPrix ? [...p.paliersPrix].sort((a, b) => a.qteMin - b.qteMin) : []);
    setAchatsManuel(p.achatsHistorique ? [...p.achatsHistorique] : []);
    setVariantes(p.variantes ? [...p.variantes] : []);
    setProduitTab('infos');
    setEntrepotStockEdit(null);
    setDialogOpen(true);
  }

  function openComposant(compProd: import('@/lib/store').Produit) {
    if (!editing) return;
    // Sauvegarde immédiate avant navigation
    const composantsValides = composants.filter(c => c.produitId && c.produitId !== '');
    majProduitEdite(p => ({ ...p, ...form, composants: composantsValides.length > 0 ? composantsValides : undefined }));
    setEditingStack(prev => [...prev, editing]);
    openEdit(compProd);
  }

  function goBack() {
    const parent = editingStack[editingStack.length - 1];
    if (!parent) return;
    setEditingStack(prev => prev.slice(0, -1));
    // Relit depuis le store (inclut les dernières modifications)
    const fresh = produits.find(p => p.id === parent.id) || parent;
    openEdit(fresh);
  }

  function updateFormPrix(updates: Partial<typeof form>) {
    setForm(prev => {
      const next = { ...prev, ...updates };
      // Coefficient pilote le prix revendeur
      next.prixRevendeur = calcPrixRevendeurFromCoeff(next.prixAchat, next.coefficient);
      next.prixHT = calcPrixPublicFromRevendeur(next.prixRevendeur, next.remiseRevendeur);
      next.coeffRevendeur = next.coefficient; // identique maintenant
      return next;
    });
  }

  function updateFormPrixRevendeur(prixRevendeur: number) {
    setForm(prev => {
      const next = { ...prev, prixRevendeur };
      // Recalcule le coefficient à rebours depuis le prix revendeur saisi
      if (next.prixAchat > 0) {
        next.coefficient = Math.round(prixRevendeur / next.prixAchat * 10000) / 10000;
        next.coeffRevendeur = next.coefficient;
      }
      next.prixHT = calcPrixPublicFromRevendeur(prixRevendeur, next.remiseRevendeur);
      return next;
    });
  }

  function save(andReturnToDevis = false) {
    if (!form.description.trim() || !form.reference.trim()) { toast.error('Référence et description requis'); return; }
    const composantsValides = composants.filter(c => c.produitId && c.produitId !== '');
    // Recalcule les composants en % avant sauvegarde
    const composantsRecalc = composantsValides.map(c => {
      if (c.consommationPct != null) {
        let baseQty = c.baseQuantite ?? 0;
        if (c.baseComposantId) {
          const base = composantsValides.find(b => b.produitId === c.baseComposantId);
          if (base) baseQty = base.quantite;
        }
        if (baseQty > 0) return { ...c, baseQuantite: baseQty, quantite: Math.round(baseQty * c.consommationPct / 100 * 10000) / 10000 || 0.0001 };
      }
      return c;
    });
    const composantsToSave = composantsRecalc.length > 0 ? composantsRecalc : null;

    const lignesKitToSave = isTypeKit && lignesKit.length > 0 ? lignesKit : null;
    const paliersPrixToSave = paliersPrix.length > 0 ? paliersPrix : null;
    const variantesToSave = variantes.length > 0 ? variantes : null;
    const achatsToSave = achatsManuel.filter(a => a.date && a.prix > 0 && a.quantite > 0).map(a => ({ ...a, source: 'manuel' as const }));
    const achatsToSaveOrNull = achatsToSave.length > 0 ? achatsToSave : null;
    if (editing) {
      /* Les dates de tarif ne repartent PAS du formulaire.
       *
       * Elles y ont été chargées à l'ouverture de la fiche et n'y bougent
       * plus. Les réécrire telles quelles revenait à reposer l'ancienne date
       * par-dessus celle que l'enregistrement venait de poser : un prix
       * corrigé à la main gardait la date d'avant. Ce n'est pas cosmétique —
       * c'est cette date qui arbitre face à Odoo, « le plus récent
       * l'emporte ». Une date périmée fait perdre le prix saisi.
       *
       * On laisse donc `dater()` seul juge, en partant du produit tel qu'il
       * est en base plutôt que du formulaire. */
      const { prixAchatMaj: _pam, prixVenteMaj: _pvm, ...formSansDates } = form;
      const complements = { composants: composantsToSave || undefined, typeKit: isTypeKit, lignesKit: lignesKitToSave || undefined, paliersPrix: paliersPrixToSave || undefined, variantes: variantesToSave || undefined, achatsHistorique: achatsToSaveOrNull || undefined };
      majProduitEdite(p => ({ ...p, ...formSansDates, ...complements }));
      // Écriture directe Supabase pour garantir la persistance
      supabase.from('produits').update({ composants: composantsToSave as any, type_kit: isTypeKit, lignes_kit: lignesKitToSave as any, paliers_prix: paliersPrixToSave as any, variantes: variantesToSave as any, achats_historique: achatsToSaveOrNull } as any).eq('id', editing.id).then(({ error }) => {
        if (error) console.error('Erreur sauvegarde composants/kit/paliers/variantes/achats:', error);
      });
      updateDevis(prev => prev.map(d => ({
        ...d,
        lignes: d.lignes.map(l => l.produitId === editing.id ? {
          ...l,
          description: form.description,
          prixUnitaireHT: form.prixHT,
          tva: form.tva,
          unite: form.unite,
        } : l),
      })));
      /* ON RELIT CE QU'ON VIENT D'ÉCRIRE.
       *
       * « Produit modifié » s'affichait quoi qu'il arrive. Tant que rien ne
       * vérifiait, un prix pouvait repartir sans jamais arriver — c'est
       * précisément ce qui s'est produit, et personne ne pouvait le savoir
       * avant de recharger la page. On relit donc la ligne une seconde plus
       * tard : si le prix en base n'est pas celui qu'on a envoyé, on le dit,
       * en rouge, avec les deux valeurs. */
      const idVerif = editing.id;
      const achatVoulu = form.prixAchat;
      toast.success('Produit modifié');
      setTimeout(() => {
        supabase.from('produits').select('prix_achat').eq('id', idVerif).maybeSingle()
          .then(({ data, error }) => {
            if (error || !data) return;
            const enBase = Number((data as { prix_achat: number }).prix_achat) || 0;
            if (Math.abs(enBase - achatVoulu) >= 0.005) {
              toast.error(
                `Le prix d'achat n'a pas été retenu : ${formatMontant(achatVoulu)} envoyé, ${formatMontant(enBase)} en base.`,
                { duration: 15000 },
              );
            }
          });
      }, 1200);
    } else {
      const newId = generateId();
      const newProd = { ...form, id: newId, composants: composantsToSave || undefined, typeKit: isTypeKit, lignesKit: lignesKitToSave || undefined, paliersPrix: paliersPrixToSave || undefined, variantes: variantesToSave || undefined, achatsHistorique: achatsToSaveOrNull || undefined, dateCreation: new Date().toISOString().split('T')[0] };
      updateProduits(prev => [...prev, newProd]);
      // Écriture directe Supabase pour garantir la persistance
      if (composantsToSave || lignesKitToSave || paliersPrixToSave || variantesToSave || achatsToSaveOrNull) {
        supabase.from('produits').update({ composants: composantsToSave as any, type_kit: isTypeKit, lignes_kit: lignesKitToSave as any, paliers_prix: paliersPrixToSave as any, variantes: variantesToSave as any, achats_historique: achatsToSaveOrNull } as any).eq('id', newId).then(({ error }) => {
          if (error) console.error('Erreur sauvegarde composants/kit/paliers/variantes/achats nouveau produit:', error);
        });
      }
      toast.success('Produit ajouté');
    }
    setDialogOpen(false);
    if (andReturnToDevis && fromDevis) {
      setFromDevis(false);
      navigate(returnDevisId ? `/devis?editDevis=${returnDevisId}` : '/devis');
    }
  }

  /* PLUS D'ENREGISTREMENT AUTOMATIQUE.
   *
   * La fiche s'enregistrait toute seule, une demi-seconde après la dernière
   * frappe, et à chaque fois que l'article changeait par ailleurs — la
   * relecture du stock Odoo, par exemple, en déclenchait un. Ce n'est pas
   * la fréquence qui posait problème, c'est ce qu'elle écrivait : l'état du
   * formulaire à cet instant précis, quel qu'il soit. Un prix à moitié tapé,
   * ou un formulaire que quelque chose venait de remettre à zéro, partait en
   * base sans que personne n'ait rien demandé. Le journal l'a montré : une
   * écriture juste, puis une écriture à zéro cinq cents millisecondes plus
   * tard.
   *
   * Il y a un bouton « Modifier ». C'est lui qui enregistre, et lui seul.
   * Ce qui est à l'écran au moment du clic est ce qui part en base — rien
   * avant, rien après. Fermer sans cliquer n'écrit rien, ce qui est le
   * comportement attendu de n'importe quelle fiche. */

  function remove(id: string) {
    confirmDelete(id);
  }

  // Import field definitions
  const importFields: { key: string; label: string; aliases: string[]; type: 'text' | 'number'; default?: any }[] = [
    { key: 'reference', label: 'Référence', aliases: ['article', 'référence', 'reference', 'ref', 'code article'], type: 'text' },
    { key: 'description', label: 'Description', aliases: ['produit', 'nom', 'désignation', 'designation', 'libellé', 'libelle', 'description'], type: 'text' },
    { key: 'descriptionDetaillee', label: 'Description détaillée', aliases: ['description détaillée', 'description detaillee', 'détail', 'detail'], type: 'text' },
    { key: 'prixAchat', label: 'Prix Achat', aliases: ['pa conditionné', 'pa conditionne', 'p achat kg ou u', 'achat kg ou u', 'prix achat', 'prixachat', 'pa', 'prix_achat'], type: 'number' },
    { key: 'coefficient', label: 'Coefficient', aliases: ['coefficient', 'coeff'], type: 'number', default: 2 },
    { key: 'prixHT', label: 'Prix HT', aliases: ['prix ht', 'prixht', 'pv ht', 'prix_ht'], type: 'number' },
    { key: 'remiseRevendeur', label: 'Remise revendeur %', aliases: ['remise revendeur', 'remiserevendeur', 'remise'], type: 'number', default: 30 },
    { key: 'prixRevendeur', label: 'Prix revendeur', aliases: ['prix revendeur', 'prixrevendeur'], type: 'number' },
    { key: 'tva', label: 'TVA %', aliases: ['tva'], type: 'number', default: 20 },
    { key: 'unite', label: 'Unité', aliases: ['unité', 'unite'], type: 'text', default: 'pièce' },
    { key: 'poids', label: 'Poids (kg)', aliases: ['poids', 'poids kg', 'weight'], type: 'number' },
    { key: 'consommation', label: 'Consommation (kg/m²)', aliases: ['consommation', 'conso', 'kg/m²', 'kg/m2', 'consommation kg/m²'], type: 'number' },
    { key: 'stock', label: 'Stock', aliases: ['stock'], type: 'number' },
    { key: 'stock', label: 'Stock', aliases: ['stock'], type: 'number' },
    { key: 'stockMin', label: 'Stock min', aliases: ['stock min', 'stockmin', 'stock minimum'], type: 'number' },
    { key: 'categorie', label: 'Catégorie', aliases: ['catégorie', 'categorie', 'famille'], type: 'text' },
    { key: 'fournisseur', label: 'Fournisseur', aliases: ['fournisseur', 'supplier', 'société fournisseur', 'societe fournisseur'], type: 'text' },
  ];

  // Auto-detect mapping from Excel columns to product fields
  function autoDetectMapping(excelCols: string[]): Record<string, string> {
    const mapping: Record<string, string> = {};
    for (const field of importFields) {
      for (const alias of field.aliases) {
        const match = excelCols.find(col => col.trim().toLowerCase() === alias.toLowerCase());
        if (match && !Object.values(mapping).includes(match)) {
          mapping[field.key] = match;
          break;
        }
      }
    }
    return mapping;
  }

  // Get available Excel columns from the preview
  const excelColumns = useMemo(() => {
    if (!importPreview || importPreview.length === 0) return [];
    return Object.keys(importPreview[0]);
  }, [importPreview]);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet);
        if (json.length === 0) { toast.error('Fichier vide'); return; }
        setImportPreview(json);
        setImportMode('add');
        const cols = Object.keys(json[0] as object);
        const detected = autoDetectMapping(cols);
        setImportMapping(detected);
        setImportSelectedCols(new Set(Object.keys(detected)));
        setImportDialogOpen(true);
      } catch { toast.error('Erreur de lecture du fichier'); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function getMappedValue(row: any, fieldKey: string): string {
    const colName = importMapping[fieldKey];
    if (!colName) return '';
    const val = row[colName];
    if (val === undefined || val === null) return '';
    return String(val).trim();
  }
  function getMappedNum(row: any, fieldKey: string, def = 0): number {
    const val = getMappedValue(row, fieldKey);
    const n = parseFloat(val);
    return isNaN(n) ? def : n;
  }

  function importArticles() {
    if (!importPreview) return;
    const selectedFields = importFields.filter(f => importSelectedCols.has(f.key));
    const newProduitFournisseurs: import('@/lib/store').ProduitFournisseur[] = [];

    if (importMode === 'update') {
      let updated = 0;
      updateProduits(prev => prev.map(p => {
        const matchingRow = importPreview.find(row => {
          const ref = getMappedValue(row, 'reference');
          return ref.toLowerCase() === p.reference.trim().toLowerCase();
        });
        if (!matchingRow) return p;

        const updates: Record<string, any> = {};
        let fournisseurIdForLink: string | null = null;
        for (const field of selectedFields) {
          if (field.key === 'reference') continue;
          if (field.key === 'fournisseur') {
            const fournNom = getMappedValue(matchingRow, 'fournisseur');
            if (fournNom) {
              const fourn = fournisseurs.find(f => f.societe.toLowerCase() === fournNom.toLowerCase() || f.nom.toLowerCase() === fournNom.toLowerCase());
              if (fourn) {
                updates.fournisseurId = fourn.id;
                fournisseurIdForLink = fourn.id;
              }
            }
            continue;
          }
          if (field.type === 'number') {
            updates[field.key] = getMappedNum(matchingRow, field.key, field.default ?? 0);
          } else {
            const val = getMappedValue(matchingRow, field.key);
            if (val || field.default) updates[field.key] = val || field.default || '';
          }
        }

        const pa = updates.prixAchat ?? p.prixAchat;
        const coeff = updates.coefficient ?? p.coefficient;
        const remise = updates.remiseRevendeur ?? p.remiseRevendeur;

        if (importSelectedCols.has('prixAchat') || importSelectedCols.has('coefficient')) {
          updates.prixRevendeur = calcPrixRevendeurFromCoeff(pa, coeff);
          updates.prixHT = calcPrixPublicFromRevendeur(updates.prixRevendeur, remise);
          updates.coeffRevendeur = coeff;
        }
        if (importSelectedCols.has('remiseRevendeur')) {
          const pr = updates.prixRevendeur ?? calcPrixRevendeurFromCoeff(pa, coeff);
          updates.prixHT = calcPrixPublicFromRevendeur(pr, remise);
        }

        // Create/update produitFournisseur link
        if (fournisseurIdForLink) {
          const existingPf = produitFournisseurs.find(pf => pf.produitId === p.id && pf.fournisseurId === fournisseurIdForLink);
          if (!existingPf) {
            newProduitFournisseurs.push({
              id: generateId(),
              produitId: p.id,
              fournisseurId: fournisseurIdForLink,
              prixAchat: pa,
              referenceFournisseur: '',
              delaiLivraison: 0,
              conditionnementMin: 1,
              estPrioritaire: false,
            });
          }
        }

        if (Object.keys(updates).length > 0) {
          updated++;
          return { ...p, ...updates };
        }
        return p;
      }));
      toast.success(`${updated} produit(s) mis à jour`);
    } else {
      const mapped: Produit[] = importPreview.map((row: any) => {
        const prixAchat = getMappedNum(row, 'prixAchat');
        const coefficient = getMappedNum(row, 'coefficient', 1.6);
        const remiseRevendeur = getMappedNum(row, 'remiseRevendeur', 30);
        const prixRevendeur = getMappedNum(row, 'prixRevendeur') || calcPrixRevendeurFromCoeff(prixAchat, coefficient);
        const prixHT = getMappedNum(row, 'prixHT') || calcPrixPublicFromRevendeur(prixRevendeur, remiseRevendeur);
        const reference = getMappedValue(row, 'reference');
        const description = getMappedValue(row, 'description');
        const fournNom = getMappedValue(row, 'fournisseur');
        const fourn = fournNom ? fournisseurs.find(f => f.societe.toLowerCase() === fournNom.toLowerCase() || f.nom.toLowerCase() === fournNom.toLowerCase()) : null;
        const produitId = generateId();

        // Create produitFournisseur link for new products
        if (fourn) {
          newProduitFournisseurs.push({
            id: generateId(),
            produitId,
            fournisseurId: fourn.id,
            prixAchat,
            referenceFournisseur: '',
            delaiLivraison: 0,
            conditionnementMin: 1,
            estPrioritaire: false,
          });
        }

        return {
          id: produitId,
          reference,
          description,
          descriptionDetaillee: getMappedValue(row, 'descriptionDetaillee'),
          prixAchat,
          coefficient: prixAchat > 0 && prixRevendeur > 0 ? prixRevendeur / prixAchat : coefficient,
          prixHT,
          coeffRevendeur: prixAchat > 0 && prixRevendeur > 0 ? prixRevendeur / prixAchat : coefficient,
          remiseRevendeur,
          prixRevendeur,
          tva: getMappedNum(row, 'tva', 20),
          unite: getMappedValue(row, 'unite') || 'pièce',
          stock: getMappedNum(row, 'stock'),
          stockMin: getMappedNum(row, 'stockMin'),
          fournisseurId: fourn?.id || '',
          categorie: getMappedValue(row, 'categorie'),
          dateCreation: new Date().toISOString().split('T')[0],
        };
      }).filter(p => p.description || p.reference);

      const existingRefs = new Set(produits.map(p => p.reference.trim().toLowerCase()));
      const unique = mapped.filter(p => {
        const ref = p.reference.trim().toLowerCase();
        if (!ref) return true;
        if (existingRefs.has(ref)) return false;
        existingRefs.add(ref);
        return true;
      });
      const skipped = mapped.length - unique.length;
      // Filter out produitFournisseur links for skipped products
      const uniqueIds = new Set(unique.map(p => p.id));
      const filteredPfs = newProduitFournisseurs.filter(pf => uniqueIds.has(pf.produitId));
      newProduitFournisseurs.length = 0;
      newProduitFournisseurs.push(...filteredPfs);

      updateProduits(prev => [...prev, ...unique]);
      toast.success(`${unique.length} produit(s) importé(s)${skipped > 0 ? `, ${skipped} doublon(s) ignoré(s)` : ''}`);
    }

    // Add all new produitFournisseur links
    if (newProduitFournisseurs.length > 0) {
      updateProduitFournisseurs(prev => [...prev, ...newProduitFournisseurs]);
    }

    setImportDialogOpen(false);
    setImportPreview(null);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      {fromDevis && (
        <div className="shrink-0 flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-lg px-4 py-3">
          <Button variant="outline" size="sm" onClick={() => { setFromDevis(false); navigate(returnDevisId ? `/devis?editDevis=${returnDevisId}` : '/devis'); }}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Retour au devis
          </Button>
          <span className="text-sm text-muted-foreground">Vous consultez la fiche produit depuis l'édition d'un devis</span>
        </div>
      )}
      <PageHeaderSlot>
        <div className="relative w-32 sm:w-48 md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <ChampRecherche placeholder="Rechercher..." valeurInitiale={search} onValider={validerRecherche} className="pl-9 h-9" />
        </div>
        <div className="ml-auto flex flex-nowrap gap-1.5 items-center shrink-0">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
          {Object.values(columnFilters).some(v => v) && (
            <Button variant="ghost" size="sm" onClick={() => { setColumnFilters({}); setOpenFilterCols(new Set()); }}>
              <X className="w-4 h-4 mr-1" /> Effacer
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="px-3">Action</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setProduitsViewPersist('liste')} className="md:flex hidden">
                <LayoutList className="w-4 h-4 mr-2 text-muted-foreground" /> Vue liste {produitsView === 'liste' && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setProduitsViewPersist('tableau')} className="md:flex hidden border-b border-border pb-1.5 mb-1">
                <Table2 className="w-4 h-4 mr-2 text-muted-foreground" /> Vue tableau {produitsView === 'tableau' && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2 text-muted-foreground" /> Importer (Excel/CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportToExcel(produits.map(p => ({ Référence: p.reference, Description: p.description, 'Prix Achat': p.prixAchat, Coefficient: p.coefficient, 'Prix HT': p.prixHT, 'Coeff Revendeur': p.coeffRevendeur, 'Remise Revendeur %': p.remiseRevendeur, 'Prix Revendeur': p.prixRevendeur, 'TVA %': p.tva, Unité: p.unite, 'Poids (kg)': p.poids || '', 'Consommation (kg/m²)': p.consommation || '', Stock: p.stock, 'Stock Min': p.stockMin, Catégorie: p.categorie || '', Fournisseur: fournisseurs.find(f => f.id === p.fournisseurId)?.societe || '' })), 'produits', 'Produits')}>
                <Download className="w-4 h-4 mr-2 text-muted-foreground" /> Exporter tout (Excel)
              </DropdownMenuItem>
              {selected.size > 0 && (
                <DropdownMenuItem onClick={() => {
                  const sel = produits.filter(p => selected.has(p.id));
                  exportToExcel(sel.map(p => ({ Référence: p.reference, Description: p.description, 'Prix Achat': p.prixAchat, Coefficient: p.coefficient, 'Prix HT': p.prixHT, 'Coeff Revendeur': p.coeffRevendeur, 'Remise Revendeur %': p.remiseRevendeur, 'Prix Revendeur': p.prixRevendeur, 'TVA %': p.tva, Unité: p.unite, 'Poids (kg)': p.poids || '', 'Consommation (kg/m²)': p.consommation || '', Stock: p.stock, 'Stock Min': p.stockMin, Catégorie: p.categorie || '', Fournisseur: fournisseurs.find(f => f.id === p.fournisseurId)?.societe || '' })), 'produits_selection', 'Produits');
                }}>
                  <Download className="w-4 h-4 mr-2 text-muted-foreground" /> Exporter la sélection ({selected.size})
                </DropdownMenuItem>
              )}
              {/* Le stock et les prix d'Odoo ne se remplissaient qu'au fil des
                  devis : sur 22 637 articles, autant dire jamais. Ce tour de
                  catalogue va les chercher, par tranches, en reprenant là où
                  il s'est arrêté. */}
              <DropdownMenuItem
                onClick={synchroniserOdoo}
                disabled={syncOdoo}
                className="border-t border-border mt-1 pt-1.5"
              >
                <RefreshCw className={`w-4 h-4 mr-2 text-muted-foreground ${syncOdoo ? 'animate-spin' : ''}`} />
                {syncOdoo ? 'Lecture d’Odoo…' : 'Actualiser stock et prix depuis Odoo'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={openNew} className="shrink-0" title="Nouveau produit">
            <Plus className="w-4 h-4 lg:mr-2" />
            <span className="hidden lg:inline">Nouveau produit</span>
          </Button>
        </div>
      </PageHeaderSlot>

      <div className={`${produitsView === 'liste' ? 'hidden' : 'hidden md:flex md:flex-col'} flex-1 min-h-0 bg-card rounded-xl border border-border overflow-hidden`}>
        {Object.values(columnFilters).some(v => v) && (
          <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Filtres actifs :</span>
            {Object.entries(columnFilters).filter(([, v]) => v).map(([k, v]) => {
              const label = COLUMNS.find(c => c.key === k)?.label || k;
              let display = v;
              if (v === '!empty') display = '≠ vide';
              else if (k === 'disponibleVente') display = v === 'oui' ? 'Disponible' : v === 'non' ? 'Non dispo' : v;
              else {
                const cs = parseChoiceFilter(v);
                if (cs.mode === 'exclude') display = `sauf ${cs.excluded.join(', ')}`;
              }
              return (
                <span key={k} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                  {label} : {display}
                  <button onClick={() => { setColumnFilters(prev => { const n = { ...prev }; delete n[k as ColKey]; return n; }); setOpenFilterCols(prev => { const n = new Set(prev); n.delete(k as ColKey); return n; }); }}><X className="w-3 h-3" /></button>
                </span>
              );
            })}
            <button onClick={() => { setColumnFilters({}); setOpenFilterCols(new Set()); }} className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"><X className="w-3 h-3" /> Effacer</button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-2 py-2.5 w-8 sticky top-0 z-10 bg-muted">
                  <input type="checkbox" checked={affiches.length > 0 && selected.size === affiches.length} onChange={toggleAll} className="rounded border-input" />
                </th>
                {orderedVisibleCols.map(col => {
                  const isSorted = sortCol === col.key;
                  const SortIcon = isSorted ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
                  const hasFilter = !!(columnFilters[col.key]);
                  const isFilterOpen = openFilterCols.has(col.key);
                  const cw = prodCols.widths[col.key];
                  const isDragOver = prodCols.dragOverKey === col.key && prodCols.dragKey !== col.key;
                  return (
                    <th
                      key={col.key}
                      {...prodCols.thProps(col.key)}
                      style={prodCols.widthStyle(col.key)}
                      className={`relative px-2 py-2 font-medium text-muted-foreground select-none whitespace-nowrap cursor-grab active:cursor-grabbing sticky top-0 z-10 ${col.align === 'right' ? 'text-right' : 'text-left'} ${isDragOver ? 'bg-primary/10' : prodCols.dragKey === col.key ? 'bg-muted opacity-40' : 'bg-muted'}`}
                    >
                      {isDragOver && <span className="absolute top-0 left-0 h-full w-0.5 bg-primary z-20" />}
                      <div className={`flex items-center gap-0.5 ${col.align === 'right' ? 'justify-end' : ''} ${cw ? 'overflow-hidden' : ''}`}>
                        <button
                          className="flex items-center gap-1 hover:text-foreground cursor-pointer min-w-0"
                          onClick={() => handleSort(col.key)}
                        >
                          {col.align === 'right' && <SortIcon className={`w-3 h-3 shrink-0 ${isSorted ? 'text-primary' : 'opacity-40'}`} />}
                          <span className="truncate">{col.label}</span>
                          {col.align !== 'right' && <SortIcon className={`w-3 h-3 shrink-0 ${isSorted ? 'text-primary' : 'opacity-40'}`} />}
                        </button>
                        {isFilterOpen ? (() => {
                          const isChoice = col.key === 'disponibleVente';
                          return (
                            <span className="font-normal inline-flex items-center gap-0.5 min-w-0" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} draggable={false}>
                              <span className={isChoice ? 'shrink-0' : 'min-w-0 w-28'}>{renderProdFilter(col.key)}</span>
                              <button onClick={() => toggleFilterCol(col.key)} title="Fermer le filtre" className="p-0.5 rounded hover:bg-muted/80 text-muted-foreground/60 shrink-0"><X className="w-3 h-3" /></button>
                            </span>
                          );
                        })() : (
                          <button
                            onClick={() => toggleFilterCol(col.key)}
                            title="Filtrer"
                            className={`p-0.5 rounded hover:bg-muted/80 transition-colors shrink-0 ${hasFilter ? 'text-primary' : 'text-muted-foreground/25 hover:text-muted-foreground/60'}`}
                          >
                            <Filter className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <ColResizeHandle {...prodCols.resizeHandleProps(col.key)} />
                    </th>
                  );
                })}
                <th className="px-3 py-2 text-right whitespace-nowrap sticky top-0 z-10 bg-muted">
                  <div className="flex items-center gap-1 justify-end">
                    {/* Sélecteur de colonnes */}
                    <div className="relative" ref={colChooserRef}>
                      <button
                        onClick={() => setColChooserOpen(v => !v)}
                        title="Choisir les colonnes"
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Columns2 className="w-4 h-4" />
                      </button>
                      {colChooserOpen && (
                        <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-xl p-3 min-w-[190px] text-left font-normal">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Colonnes visibles</p>
                          {COLUMNS.filter(col => canAchat || !ACHAT_COLS.includes(col.key)).map(col => (
                            <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer text-sm hover:text-foreground text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={visibleCols.has(col.key)}
                                onChange={() => setVisibleCols(prev => {
                                  const next = new Set(prev);
                                  next.has(col.key) ? next.delete(col.key) : next.add(col.key);
                                  return next;
                                })}
                                className="rounded border-input accent-primary"
                              />
                              {col.label}
                            </label>
                          ))}
                          <button
                            className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground border-t border-border pt-2 text-left"
                            onClick={() => setVisibleCols(new Set(DEFAULT_VISIBLE_COLS))}
                          >
                            Réinitialiser les colonnes visibles
                          </button>
                          <button
                            className="mt-1 w-full text-xs text-muted-foreground hover:text-foreground text-left"
                            onClick={() => prodCols.reset()}
                          >
                            Réinitialiser l'ordre et les largeurs
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {affiches.map(p => {
                const pfs = produitFournisseurs.filter(pf => pf.produitId === p.id);
                const prioFourn = calculerFournisseurPrioritaire(p.id, Math.max(1, p.stockMin - p.stock), produitFournisseurs, fournisseurs);
                const prioFournName = prioFourn ? fournisseurs.find(f => f.id === prioFourn.fournisseurId)?.societe : null;
                const isCompose = !!(p.composants && p.composants.length > 0);
                const prioFournObj = prioFourn ? fournisseurs.find(f => f.id === prioFourn.fournisseurId) : null;
                const renderCell = (key: ColKey) => {
                  switch (key) {
                    case 'reference':    return <td className="px-2 py-2.5 font-mono text-xs" title={p.reference}>
                      {p.reference}
                      {isCompose && <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-sans">Composé</span>}
                      {/* Un modèle à déclinaisons s'ouvre, comme dans Odoo. */}
                      {!modeleOuvert && (p.nbVariantes ?? 1) > 1 && p.modeleCle && (
                        <button
                          onClick={e => { e.stopPropagation(); setModeleOuvert(p.modeleCle!); }}
                          className="ml-1 text-xs bg-accent/15 text-accent px-1.5 py-0.5 rounded-full font-sans hover:bg-accent/25"
                          title={`Voir les ${p.nbVariantes} déclinaisons de ${p.modeleCle}`}
                        >{p.nbVariantes} décl.</button>
                      )}
                    </td>;
                    case 'description':  return <td className="px-2 py-2.5 font-medium max-w-[260px] truncate" title={`${p.reference} — ${p.description}`}>{p.description}</td>;
                    case 'categorie':    return <td className="px-2 py-2.5 text-muted-foreground max-w-[110px] truncate" title={p.categorie || ''}>{p.categorie || '—'}</td>;
                    case 'fournisseur':  return <td className="px-2 py-2.5 text-muted-foreground max-w-[130px] truncate" title={prioFournObj?.societe || prioFournObj?.nom || ''}>{prioFournObj?.societe || prioFournObj?.nom || '—'}{pfs.length > 1 && <span className="ml-1 text-xs text-muted-foreground/60">+{pfs.length - 1}</span>}</td>;
                    case 'prixAchat':    return <td className="px-2 py-2.5 text-right">{formatMontant(p.prixAchat)}</td>;
                    case 'coefficient':  return <td className="px-2 py-2.5 text-right font-mono">{p.coefficient.toFixed(2)}</td>;
                    case 'prixRevendeur':return <td className="px-2 py-2.5 text-right font-semibold">{formatMontant(p.prixRevendeur)}{canAchat && <span className="block text-xs text-muted-foreground">{formatMontant(calcMargeBrute(p.prixRevendeur, p.prixAchat))} ({calcTauxMarque(p.prixRevendeur, p.prixAchat).toFixed(0)}%)</span>}</td>;
                    case 'prixHT':       return <td className="px-2 py-2.5 text-right text-muted-foreground">{formatMontant(p.prixHT)}{canAchat && <span className="block text-xs">{formatMontant(calcMargeBrute(p.prixHT, p.prixAchat))} ({calcTauxMarque(p.prixHT, p.prixAchat).toFixed(0)}%)</span>}</td>;
                    case 'poids':        return <td className="px-2 py-2.5 text-right">{p.poids ? `${p.poids} kg` : '—'}</td>;
                    case 'consommation': return <td className="px-2 py-2.5 text-right">{p.consommation ? `${p.consommation}` : '—'}</td>;
                    case 'tva':          return <td className="px-2 py-2.5 text-right">{p.tva}%</td>;
                    case 'stock': {
                      const depots = depotStocksParProduit.get(p.id) || [];
                      return <td className={`px-2 py-2.5 text-right font-medium ${p.stock < p.stockMin ? 'text-warning' : ''}`}>
                        {p.stock}
                        {depots.length > 1 ? (
                          <span className="block text-[11px] text-muted-foreground leading-tight font-normal">
                            {depots.map(d => `${d.nom} ${d.stock}`).join(' · ')}
                          </span>
                        ) : pfs.length > 0 ? (
                          <span className="block text-xs text-muted-foreground font-normal">{prioFournName ? `⭐ ${prioFournName}` : `${pfs.length} fourn.`}</span>
                        ) : null}
                      </td>;
                    }
                    /* Le chiffre d'Odoo, et la date à laquelle il a été lu.
                       Un stock sans date ne veut rien dire : celui-ci peut
                       dater de la dernière ouverture de la fiche comme du
                       dernier tour de catalogue. La date le dit. */
                    case 'stockOdoo': return (
                      <td className="px-2 py-2.5 text-right font-medium">
                        {p.stockOdoo === undefined || p.stockOdoo === null
                          ? <span className="text-muted-foreground font-normal">—</span>
                          : <span className={p.stockOdoo > 0 ? '' : 'text-muted-foreground'}>{p.stockOdoo}</span>}
                      </td>
                    );
                    case 'stockOdooPrevu': return (
                      <td className="px-2 py-2.5 text-right font-medium">
                        {p.stockOdooPrevu === undefined || p.stockOdooPrevu === null
                          ? <span className="text-muted-foreground font-normal">—</span>
                          : <>
                              <span className={p.stockOdooPrevu > 0 ? '' : 'text-muted-foreground'}>{p.stockOdooPrevu}</span>
                              {p.stockOdooMaj && (
                                <span className="block text-[11px] text-muted-foreground leading-tight font-normal">
                                  {formatDate(p.stockOdooMaj)}
                                </span>
                              )}
                            </>}
                      </td>
                    );
                    case 'qteVendue':    return <td className="px-2 py-2.5 text-right font-medium">{qteVendueParProduit[p.id] ? <span className="text-primary">{qteVendueParProduit[p.id]}</span> : <span className="text-muted-foreground">0</span>}</td>;
                    case 'qteCommandeeF': return <td className="px-2 py-2.5 text-right font-medium">{qteCommandeeFournParProduit[p.id] ? <span className="text-foreground">{qteCommandeeFournParProduit[p.id]}</span> : <span className="text-muted-foreground">0</span>}</td>;
                    case 'valeurStock':  return <td className="px-2 py-2.5 text-right font-medium">{valeurStockParProduit[p.id] ? <span>{formatMontant(valeurStockParProduit[p.id])} €</span> : <span className="text-muted-foreground">—</span>}</td>;
                    case 'disponibleVente': return (
                      <td className="px-2 py-2.5 text-center">
                        {p.disponibleVente !== false
                          ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-success/15 text-success text-xs font-bold">✓</span>
                          : <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs">✕</span>}
                      </td>
                    );
                    default:             return <td />;
                  }
                };
                return (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer" onClick={e => { if ((e.target as HTMLElement).closest('input, button')) return; openEdit(p); }}>
                    <td className="px-2 py-2.5"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded border-input" /></td>
                    {orderedVisibleCols.map(col => {
                      const cell = renderCell(col.key) as ReactElement<any>;
                      const cw = prodCols.widths[col.key];
                      if (cw && cell) {
                        const prevCls = (cell.props.className || '') as string;
                        const cls = prevCls.includes('truncate') ? prevCls : `${prevCls} truncate`;
                        return <Fragment key={col.key}>{cloneElement(cell, { style: { ...(cell.props.style || {}), width: cw, maxWidth: cw }, className: cls })}</Fragment>;
                      }
                      return <Fragment key={col.key}>{cell}</Fragment>;
                    })}
                    <td className="px-2 py-2.5">
                      <div className="flex justify-end">
                        <RowActionsMenu actions={[
                          { icon: <Edit2 className="w-4 h-4" />, label: 'Modifier', onClick: () => openEdit(p) },
                          { icon: <Copy className="w-4 h-4" />, label: 'Dupliquer', onClick: () => duplicate(p) },
                          { icon: <Trash2 className="w-4 h-4" />, label: 'Supprimer', onClick: () => remove(p.id), danger: true },
                        ]} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {modeServeur && modeleOuvert && (
          <div className="flex-none flex items-center gap-2 px-3 py-2 border-b border-border text-xs bg-primary/5">
            <span>
              Déclinaisons de <strong className="text-foreground">{modeleOuvert}</strong>
            </span>
            <button
              onClick={() => setModeleOuvert(null)}
              className="ml-auto text-primary hover:underline"
            >Revenir aux modèles</button>
          </div>
        )}
        {(serveur.chargement || serveur.erreur || !modeServeur) && (
          <div className="flex-none px-3 py-1.5 border-t border-border text-xs text-muted-foreground">
            {serveur.erreur
              ? <span className="text-warning">Lecture en base impossible ({serveur.erreur}) — liste en mémoire.</span>
              : serveur.chargement
                ? 'Lecture en base…'
                : !produitsCharges
                  ? 'Ce filtre demande le catalogue entier — chargement en cours…'
                  : 'Filtre ou tri sur une colonne calculée : liste en mémoire.'}
          </div>
        )}
        {nbPages > 1 && (
          <div className="flex-none flex items-center justify-between gap-2 px-3 py-2 border-t border-border text-xs">
            <span className="text-muted-foreground">
              {(pageCourante - 1) * PAR_PAGE + 1}–{Math.min(pageCourante * PAR_PAGE, totalLignes)}
              {' sur '}{totalLignes} article{totalLignes > 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={pageCourante === 1}
                className="px-2 py-1 rounded border border-border disabled:opacity-40"
              >««</button>
              <button
                onClick={() => setPage(pageCourante - 1)}
                disabled={pageCourante === 1}
                className="px-2 py-1 rounded border border-border disabled:opacity-40"
              >Précédent</button>
              <span className="px-2">page {pageCourante} / {nbPages}</span>
              <button
                onClick={() => setPage(pageCourante + 1)}
                disabled={pageCourante === nbPages}
                className="px-2 py-1 rounded border border-border disabled:opacity-40"
              >Suivant</button>
              <button
                onClick={() => setPage(nbPages)}
                disabled={pageCourante === nbPages}
                className="px-2 py-1 rounded border border-border disabled:opacity-40"
              >»»</button>
            </div>
          </div>
        )}
        {affiches.length === 0 && !serveur.chargement && <p className="text-center py-8 text-muted-foreground">Aucun produit</p>}
      </div>

      {/* Vue cartes — mobile (toujours) + desktop si vue liste */}
      <div className={produitsView === 'liste' ? 'flex-1 min-h-0 overflow-y-auto space-y-2' : 'md:hidden space-y-2'}>
        {affiches.length === 0 && !serveur.chargement && <p className="text-center py-8 text-muted-foreground text-sm">Aucun produit</p>}
        {nbPages > 1 && (
          <div className="flex items-center justify-between gap-2 py-2 text-xs">
            <span className="text-muted-foreground">
              {(pageCourante - 1) * PAR_PAGE + 1}–{Math.min(pageCourante * PAR_PAGE, totalLignes)}
              {' sur '}{totalLignes}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(pageCourante - 1)}
                disabled={pageCourante === 1}
                className="px-2 py-1 rounded border border-border disabled:opacity-40"
              >Précédent</button>
              <span className="px-1">{pageCourante} / {nbPages}</span>
              <button
                onClick={() => setPage(pageCourante + 1)}
                disabled={pageCourante === nbPages}
                className="px-2 py-1 rounded border border-border disabled:opacity-40"
              >Suivant</button>
            </div>
          </div>
        )}
        {affiches.map(p => {
          const isCompose = !!(p.composants && p.composants.length > 0);
          const margeRevend = calcMargeBrute(p.prixRevendeur, p.prixAchat);
          const tauxMarque = calcTauxMarque(p.prixRevendeur, p.prixAchat);
          return (
            <div key={p.id} className="bg-card rounded-xl border border-border cursor-pointer active:bg-muted/50" onClick={e => { if ((e.target as HTMLElement).closest('input, button')) return; openEdit(p); }}>
              {/* Header row */}
              <div className="flex items-start gap-2 px-3 pt-3 pb-2">
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded border-input mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm leading-tight">
                    {p.description}
                    {isCompose && <span className="ml-1.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full align-middle">Composé</span>}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{p.reference}{p.categorie ? <span className="font-sans ml-2 text-muted-foreground/70">{p.categorie}</span> : ''}</p>
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <button onClick={() => openEdit(p)} className="p-2 rounded-md hover:bg-muted" title="Modifier"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => remove(p.id)} className="p-2 rounded-md hover:bg-destructive/10 text-destructive" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              {/* Prix row */}
              <div className={`grid ${canAchat ? 'grid-cols-3' : 'grid-cols-2'} divide-x divide-border border-t border-border text-xs`}>
                {canAchat && (
                  <div className="px-3 py-2">
                    <p className="text-muted-foreground mb-0.5">P. Achat</p>
                    <p className="font-semibold text-sm">{formatMontant(p.prixAchat)}</p>
                  </div>
                )}
                <div className="px-3 py-2">
                  <p className="text-muted-foreground mb-0.5">Revendeur{canAchat ? ` × ${p.coefficient.toFixed(2)}` : ''}</p>
                  <p className="font-semibold text-sm text-primary">{formatMontant(p.prixRevendeur)}</p>
                  {canAchat && <p className="text-muted-foreground">{formatMontant(margeRevend)} · {tauxMarque.toFixed(0)}%</p>}
                </div>
                <div className="px-3 py-2">
                  <p className="text-muted-foreground mb-0.5">Stock</p>
                  <p className={`font-semibold text-sm ${p.stock < p.stockMin ? 'text-warning' : ''}`}>{p.stock}</p>
                  {p.stockMin > 0 && <p className="text-muted-foreground">min {p.stockMin}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget 
                ? "Êtes-vous sûr de vouloir supprimer ce produit ? Cette action ne peut pas être annulée."
                : `Êtes-vous sûr de vouloir supprimer ${selected.size} produit(s) ? Cette action ne peut pas être annulée.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) setEditingStack([]); }}>
        <DialogContent mobileFullscreen className="sm:w-[90vw] sm:max-w-[90vw] sm:max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2 min-w-0">
              {editingStack.length > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="p-1.5 rounded-md hover:bg-muted shrink-0 text-muted-foreground hover:text-foreground"
                  title="Retour au produit parent"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <DialogTitle className="truncate flex items-center gap-1.5 min-w-0">
                {editingStack.map((p, i) => (
                  <span key={p.id} className="text-muted-foreground font-normal text-sm flex items-center gap-1.5 shrink-0">
                    <span className="max-w-[120px] truncate">{p.reference}</span>
                    <span>›</span>
                  </span>
                ))}
                <span className="truncate">{editing ? `${editing.reference} — ${editing.description}` : 'Nouveau produit'}</span>
              </DialogTitle>
            </div>
          </DialogHeader>
          {/* ── Barre d'onglets ─────────────────────────────────────────────── */}
          <div className="flex gap-1 bg-muted/50 rounded-xl p-1 mt-1 mb-2">
            {([
              { id: 'infos',       label: 'Informations', icon: Package },
              { id: 'stock',       label: 'Stock & entrepôts', icon: Warehouse },
              { id: 'fournisseurs', label: 'Fournisseurs', icon: Truck },
              { id: 'devis',       label: 'Devis', icon: FileText },
              { id: 'commandes',   label: 'Cmd client', icon: ShoppingCart },
              { id: 'commandesF',  label: 'Cmd fourn.', icon: Truck },
              { id: 'valorisation', label: 'Valorisation', icon: Euro },
            ] as const).filter(t => canAchat || !(['fournisseurs', 'commandesF', 'valorisation'] as const).includes(t.id as 'fournisseurs' | 'commandesF' | 'valorisation')).map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setProduitTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-1 justify-center ${produitTab === t.id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <t.icon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="overflow-x-hidden min-w-0">

          {/* ══ Onglet Infos ═══════════════════════════════════════════════ */}
          {produitTab === 'infos' && (
          <div className="grid gap-4 py-2 overflow-x-hidden min-w-0">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Référence *</Label><Input value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} /></div>
              <div>
                <Label>Catégorie</Label>
                <Input list="produit-categories-list" value={form.categorie} onChange={e => setForm(p => ({ ...p, categorie: e.target.value }))} placeholder="Choisir ou saisir…" autoComplete="off" />
                <datalist id="produit-categories-list">{categoriesList.map(c => <option key={c} value={c} />)}</datalist>
              </div>
            </div>
            <div><Label>Description *</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div><Label>Description détaillée</Label><Input value={form.descriptionDetaillee} onChange={e => setForm(p => ({ ...p, descriptionDetaillee: e.target.value }))} placeholder="Affiché dans le devis si renseigné" /></div>

            {/* Tarif — section spéciale pour les produits surcharge énergie */}
            {form.categorie === 'surcharge' && (
              <div className="border border-amber-300 dark:border-amber-700 rounded-lg p-3 space-y-3 bg-amber-50/50 dark:bg-amber-950/20">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">⚡ Taux de surcharge énergie</p>
                <p className="text-xs text-muted-foreground">Ces valeurs sont des <strong>pourcentages (%)</strong> appliqués au total achat / vente des produits concernés.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold">% Achat (coût fournisseur)</Label>
                    <div className="flex items-center gap-1">
                      <InputNombre decimales={2} value={form.prixAchat} onChange={v => setForm(p => ({ ...p, prixAchat: v }))} className="font-semibold" />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">% Vente (facturé client)</Label>
                    <div className="flex items-center gap-1">
                      <InputNombre decimales={2} value={form.prixRevendeur} onChange={v => setForm(p => ({ ...p, prixRevendeur: v }))} className="font-semibold" />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Référence requise : <code className="bg-muted px-1 rounded">SURCHARGE_ENERGIE_MMA</code> ou <code className="bg-muted px-1 rounded">SURCHARGE_ENERGIE_HORS_MMA</code></p>
              </div>
            )}

            {/* Tarif — revendeur par défaut, public en option */}
            {form.categorie !== 'surcharge' && <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Tarif</p>
                  {/* LES DEUX DATES, TOUJOURS VISIBLES.
                      Celle de la vente ne s'affichait que dans le bloc
                      « tarif public », replié par défaut : en pratique,
                      personne ne la voyait. Or ce sont ces dates qui
                      arbitrent face à Odoo — « le plus récent l'emporte ». */}
                  {(form.prixAchatMaj || form.prixVenteMaj) && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                      {canAchat && form.prixAchatMaj && <>Achat maj. le <strong className="font-medium">{dateHeure(form.prixAchatMaj)}</strong></>}
                      {canAchat && form.prixAchatMaj && form.prixVenteMaj && <span className="mx-1.5">·</span>}
                      {form.prixVenteMaj && <>Vente maj. le <strong className="font-medium">{dateHeure(form.prixVenteMaj)}</strong></>}
                    </p>
                  )}
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showPrixPublic}
                    onChange={e => setShowPrixPublic(e.target.checked)}
                    className="rounded border-input"
                  />
                  Afficher tarif public
                </label>
              </div>

              {/* Tarif Revendeur */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                {canAchat && (
                <div>
                  <Label className="text-xs">Prix Achat *{composants.length > 0 && <span className="ml-1 text-primary font-normal">(calculé)</span>}</Label>
                  {composants.length > 0
                    ? <Input value={formatMontant(form.prixAchat)} readOnly className="bg-muted font-semibold" />
                    : <InputNombre decimales={2} value={form.prixAchat} onChange={v => updateFormPrix({ prixAchat: v })} />
                  }
                  {/* Depuis quand ce prix est-il celui-là. C'est aussi ce qui
                      décide, à la synchronisation Odoo, lequel des deux prix
                      est le plus récent — donc lequel l'emporte. */}
                  {form.prixAchatMaj && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      maj {dateHeure(form.prixAchatMaj)}
                    </p>
                  )}
                </div>
                )}
                {canAchat && (
                <div>
                  <Label className="text-xs">Coefficient</Label>
                  <InputNombre decimales={4} value={form.coefficient} onChange={v => updateFormPrix({ coefficient: v || 1 })} />
                </div>
                )}
                <div>
                  <Label className="text-xs">Prix Revendeur HT</Label>
                  <InputNombre decimales={2} value={form.prixRevendeur} onChange={v => updateFormPrixRevendeur(v)} className="font-semibold" />
                  {/* La contrepartie de la date d'achat, sous le champ de
                      vente. Le prix revendeur et le prix public bougent
                      ensemble — l'un se déduit de l'autre par la remise —
                      donc une seule date de vente les couvre tous deux. */}
                  {form.prixVenteMaj && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      maj {dateHeure(form.prixVenteMaj)}
                    </p>
                  )}
                </div>
                {canAchat && (
                <div>
                  <Label className="text-xs">Marge brute revend.</Label>
                  <Input value={formatMontant(calcMargeBrute(form.prixRevendeur, form.prixAchat))} readOnly className="bg-muted" />
                </div>
                )}
                {canAchat && (
                <div>
                  <Label className="text-xs">Marge %</Label>
                  <Input value={`${calcTauxMarque(form.prixRevendeur, form.prixAchat).toFixed(1)}%`} readOnly className="bg-muted" />
                </div>
                )}
              </div>

              {/* Tarif Public — masqué par défaut */}
              {showPrixPublic && (
                <>
                  <div className="border-t border-border pt-3 mt-1">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Tarif Public (déduit via remise)</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Remise revendeur %</Label>
                        <InputNombre decimales={2} value={form.remiseRevendeur} onChange={v => updateFormPrix({ remiseRevendeur: v })} />
                      </div>
                      {canAchat && (
                      <div>
                        <Label className="text-xs">Coeff. public</Label>
                        <Input value={calcCoeffPublic(form.prixHT, form.prixAchat).toFixed(2)} readOnly className="bg-muted" />
                      </div>
                      )}
                      <div className="col-span-2 sm:col-span-1">
                        <Label className="text-xs">Prix Vente HT (public)</Label>
                        <Input value={formatMontant(form.prixHT)} readOnly className="bg-muted font-semibold" />
                        {form.prixVenteMaj && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            maj {dateHeure(form.prixVenteMaj)}
                          </p>
                        )}
                      </div>
                    </div>
                    {canAchat && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <Label className="text-xs">Marge brute pub.</Label>
                        <Input value={formatMontant(calcMargeBrute(form.prixHT, form.prixAchat))} readOnly className="bg-muted font-semibold" />
                      </div>
                      <div>
                        <Label className="text-xs">Marge %</Label>
                        <Input value={`${calcTauxMarque(form.prixHT, form.prixAchat).toFixed(1)}%`} readOnly className="bg-muted" />
                      </div>
                    </div>
                    )}
                  </div>
                </>
              )}
            </div>}

            {/* ─── Prix par palier ─── */}
            <div className="border border-border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">Prix par palier (quantité / poids)</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    const lastPalier = paliersPrix[paliersPrix.length - 1];
                    const newQteMin = lastPalier ? lastPalier.qteMin + 10 : 10;
                    setPaliersPrix(prev => [...prev, {
                      qteMin: newQteMin,
                      prixAchat: form.prixAchat,
                      prixRevendeur: form.prixRevendeur,
                      prixHT: form.prixHT,
                    }]);
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" /> Ajouter un palier
                </Button>
              </div>
              {paliersPrix.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">Aucun palier — prix fixe pour toutes les quantités.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs table-fixed">
                    <colgroup>
                      <col style={{ width: '18%' }} />
                      {canAchat && <col style={{ width: '20%' }} />}
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '20%' }} />
                      {canAchat && <col style={{ width: '14%' }} />}
                      <col style={{ width: '8%' }} />
                    </colgroup>
                    <thead>
                      <tr className="text-muted-foreground border-b border-border">
                        <th className="text-left pb-1 pr-1 font-medium">Qté min</th>
                        {canAchat && <th className="text-right pb-1 px-1 font-medium">Prix Achat HT</th>}
                        <th className="text-right pb-1 px-1 font-medium">Prix Revendeur HT</th>
                        <th className="text-right pb-1 px-1 font-medium">Prix Public HT</th>
                        {canAchat && <th className="text-right pb-1 px-1 font-medium">Marge %</th>}
                        <th className="pb-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paliersPrix.map((palier, idx) => (
                        <tr key={idx} className="border-b border-border/50 last:border-0">
                          <td className="py-1 pr-1">
                            <Input
                              type="number"
                              step="any"
                              min={0}
                              value={palier.qteMin}
                              onChange={e => setPaliersPrix(prev => prev.map((p, i) => i === idx ? { ...p, qteMin: parseFloat(e.target.value) || 0 } : p))}
                              className="h-7 text-xs w-full"
                            />
                          </td>
                          {canAchat && (
                          <td className="py-1 px-1">
                            <Input
                              type="number"
                              step="any"
                              min={0}
                              value={palier.prixAchat}
                              onChange={e => {
                                const pa = parseFloat(e.target.value) || 0;
                                const pr = Math.round(pa * form.coefficient * 100) / 100;
                                const ph = form.remiseRevendeur < 100 ? Math.round(pr / (1 - form.remiseRevendeur / 100) * 100) / 100 : pr;
                                setPaliersPrix(prev => prev.map((p, i) => i === idx ? { ...p, prixAchat: pa, prixRevendeur: pr, prixHT: ph } : p));
                              }}
                              className="h-7 text-xs w-full text-right"
                            />
                            {form.poids > 0 && palier.prixAchat > 0 && <div className="text-[10px] text-muted-foreground/70 text-right pr-0.5">{formatMontant(palier.prixAchat / form.poids)}/kg</div>}
                          </td>
                          )}
                          <td className="py-1 px-1">
                            <Input
                              type="number"
                              step="any"
                              min={0}
                              value={palier.prixRevendeur}
                              onChange={e => {
                                const pr = parseFloat(e.target.value) || 0;
                                const ph = form.remiseRevendeur < 100 ? Math.round(pr / (1 - form.remiseRevendeur / 100) * 100) / 100 : pr;
                                setPaliersPrix(prev => prev.map((p, i) => i === idx ? { ...p, prixRevendeur: pr, prixHT: ph } : p));
                              }}
                              className="h-7 text-xs w-full text-right"
                            />
                            {form.poids > 0 && palier.prixRevendeur > 0 && <div className="text-[10px] text-muted-foreground/70 text-right pr-0.5">{formatMontant(palier.prixRevendeur / form.poids)}/kg</div>}
                          </td>
                          <td className="py-1 px-1">
                            <Input
                              type="number"
                              step="any"
                              min={0}
                              value={palier.prixHT}
                              onChange={e => setPaliersPrix(prev => prev.map((p, i) => i === idx ? { ...p, prixHT: parseFloat(e.target.value) || 0 } : p))}
                              className="h-7 text-xs w-full text-right"
                            />
                            {form.poids > 0 && palier.prixHT > 0 && <div className="text-[10px] text-muted-foreground/70 text-right pr-0.5">{formatMontant(palier.prixHT / form.poids)}/kg</div>}
                          </td>
                          {canAchat && (
                          <td className="py-1 px-2 text-right text-muted-foreground whitespace-nowrap">
                            {palier.prixRevendeur > 0 && palier.prixAchat > 0
                              ? `${Math.round((palier.prixRevendeur - palier.prixAchat) / palier.prixRevendeur * 100 * 10) / 10}%`
                              : '—'}
                          </td>
                          )}
                          <td className="py-1 pl-1">
                            <button
                              type="button"
                              onClick={() => setPaliersPrix(prev => prev.filter((_, i) => i !== idx))}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Supprimer ce palier"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-muted-foreground mt-1">
                    Prix de base (qté &lt; {Math.min(...paliersPrix.map(p => p.qteMin))} {form.unite || 'u.'}) : {canAchat ? `Achat ${formatMontant(form.prixAchat)} · ` : ''}Revend. {formatMontant(form.prixRevendeur)} · Public {formatMontant(form.prixHT)}
                  </p>
                </div>
              )}
            </div>

            {/* ─── Variantes produit ─── */}
            <div className="border border-border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">Variantes (ex : RAL, granulométrie)</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setVariantes(prev => [...prev, { id: generateId(), nom: '', options: [] }])}
                >
                  <Plus className="h-3 w-3 mr-1" /> Ajouter une dimension
                </Button>
              </div>
              {variantes.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">Aucune variante — produit sans déclinaison.</p>
              ) : (
                <div className="space-y-3">
                  {variantes.map((dim, dIdx) => (
                    <div key={dim.id} className="border border-border/60 rounded p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={dim.nom}
                          onChange={e => setVariantes(prev => prev.map((d, i) => i === dIdx ? { ...d, nom: e.target.value } : d))}
                          placeholder="Nom de la dimension (ex : Couleur RAL)"
                          className="h-7 text-xs flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => setVariantes(prev => prev.filter((_, i) => i !== dIdx))}
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                          title="Supprimer cette dimension"
                        >
                          <Trash className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="space-y-1">
                        {dim.options.map((opt, oIdx) => (
                          <div key={opt.id} className="flex items-center gap-1.5">
                            {/* Swatch couleur cliquable (RAL auto-détecté si pas de couleur manuelle) */}
                            <div className="relative shrink-0" title="Couleur du swatch">
                              <div
                                className="w-6 h-6 rounded border border-input cursor-pointer"
                                style={{ backgroundColor: opt.couleur || getRalInfo(opt.label)?.hex || '#e5e7eb' }}
                                onClick={() => (document.getElementById(`color-${opt.id}`) as HTMLInputElement)?.click()}
                              />
                              <input
                                id={`color-${opt.id}`}
                                type="color"
                                value={opt.couleur || '#e5e7eb'}
                                onChange={e => setVariantes(prev => prev.map((d, i) => i === dIdx ? { ...d, options: d.options.map((o, j) => j === oIdx ? { ...o, couleur: e.target.value } : o) } : d))}
                                className="absolute inset-0 opacity-0 w-0 h-0"
                              />
                            </div>
                            <Input
                              value={opt.label}
                              onChange={e => setVariantes(prev => prev.map((d, i) => i === dIdx ? { ...d, options: d.options.map((o, j) => j === oIdx ? { ...o, label: e.target.value } : o) } : d))}
                              placeholder="Option (ex: RAL 9010, 0.5-1mm…)"
                              className="h-6 text-xs flex-1"
                            />
                            {opt.imageUrl && (
                              <img src={opt.imageUrl} alt="" className="w-6 h-6 rounded border border-input object-cover shrink-0" />
                            )}
                            <Input
                              value={opt.imageUrl || ''}
                              onChange={e => setVariantes(prev => prev.map((d, i) => i === dIdx ? { ...d, options: d.options.map((o, j) => j === oIdx ? { ...o, imageUrl: e.target.value || undefined } : o) } : d))}
                              onDragOver={e => { e.preventDefault(); }}
                              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) uploadVarianteImage(f, dIdx, oIdx, opt.id); }}
                              onPaste={e => { const item = Array.from(e.clipboardData.items).find(it => it.type.startsWith('image/')); const f = item?.getAsFile(); if (f) { e.preventDefault(); uploadVarianteImage(f, dIdx, oIdx, opt.id); } }}
                              placeholder={varImgUploading === opt.id ? 'Upload…' : 'URL / glisser / coller image…'}
                              disabled={varImgUploading === opt.id}
                              className="h-6 text-xs w-28"
                              title="URL de l'image, ou glissez-déposez / collez (Ctrl+V) une image"
                            />
                            <Input
                              type="number"
                              step="any"
                              value={opt.prixDiff ?? ''}
                              onChange={e => setVariantes(prev => prev.map((d, i) => i === dIdx ? { ...d, options: d.options.map((o, j) => j === oIdx ? { ...o, prixDiff: e.target.value === '' ? undefined : parseFloat(e.target.value) } : o) } : d))}
                              placeholder="±prix"
                              className="h-6 text-xs w-16 text-right"
                              title="Ajustement de prix HT (+/-)"
                            />
                            <button
                              type="button"
                              onClick={() => setVariantes(prev => prev.map((d, i) => i === dIdx ? { ...d, options: d.options.filter((_, j) => j !== oIdx) } : d))}
                              className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setVariantes(prev => prev.map((d, i) => i === dIdx ? { ...d, options: [...d.options, { id: generateId(), label: '' }] } : d))}
                          className="text-xs text-primary hover:underline flex items-center gap-0.5 mt-1"
                        >
                          <Plus className="h-3 w-3" /> Ajouter une option
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div><Label>TVA %</Label><InputNombre decimales={2} value={form.tva} onChange={v => setForm(p => ({ ...p, tva: v }))} /></div>
              <div><Label>Unité</Label><Input value={form.unite} onChange={e => setForm(p => ({ ...p, unite: e.target.value }))} /></div>
              <div><Label>Poids (kg)</Label><InputNombre decimales={3} value={form.poids} onChange={v => setForm(p => ({ ...p, poids: v }))} /></div>
              <div><Label>Conso. (kg/m²)</Label><InputNombre decimales={3} value={form.consommation} onChange={v => setForm(p => ({ ...p, consommation: v }))} placeholder="Ex: 1,5" /></div>
            </div>
            {form.poids > 0 && (() => {
              const paKg = form.prixAchat / form.poids;
              const revendKg = form.prixRevendeur / form.poids;
              const coutM2 = form.consommation ? form.prixAchat / form.poids * form.consommation : null;
              const revendM2 = form.consommation ? form.prixRevendeur / form.poids * form.consommation : null;
              return (
                <div className="flex flex-wrap gap-2 text-xs bg-muted/40 rounded-md px-3 py-2">
                  <span className="text-muted-foreground">Prix/kg :</span>
                  <span className="font-medium">Achat <span className="text-foreground">{formatMontant(paKg)}/kg</span></span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-medium">Revend. <span className="text-foreground">{formatMontant(revendKg)}/kg</span></span>
                  {showPrixPublic && form.prixHT > 0 && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="font-medium">Public <span className="text-foreground">{formatMontant(form.prixHT / form.poids)}/kg</span></span>
                    </>
                  )}
                  {coutM2 !== null && (
                    <>
                      <span className="text-muted-foreground">—</span>
                      <span className="text-muted-foreground">Coût/m² :</span>
                      <span className="font-medium">Achat <span className="text-foreground">{formatMontant(coutM2)}/m²</span></span>
                      <span className="text-muted-foreground">·</span>
                      <span className="font-medium">Revend. <span className="text-foreground">{formatMontant(revendM2!)}/m²</span></span>
                    </>
                  )}
                </div>
              );
            })()}
            {/* Stock, dispo et entrepôts → onglet Stock */}
            <div className="flex items-center gap-2 px-1 py-0.5 text-xs text-muted-foreground bg-muted/30 rounded-lg">
              <Warehouse className="w-3.5 h-3.5 shrink-0" />
              Stock, propriétaire et entrepôts disponibles dans l'onglet <button type="button" onClick={() => setProduitTab('stock')} className="underline text-primary hover:opacity-80">Stock &amp; entrepôts</button>
            </div>

            <div className="space-y-2 rounded-md border border-border p-3 bg-muted/20">
              <p className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                <ExternalLink className="w-3.5 h-3.5" />
                Lien fiche produit
                <span className="font-normal">(inclus dans les mails devis)</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Texte affiché dans le mail</Label>
                  <Input
                    value={form.ficheLinkLabel || ''}
                    onChange={e => setForm(p => ({ ...p, ficheLinkLabel: e.target.value }))}
                    placeholder="Ex : ISOSIGN Tarif Public 2025.pdf"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">URL (lien)</Label>
                    <Input
                      type="url"
                      value={form.ficheUrl || ''}
                      onChange={e => setForm(p => ({ ...p, ficheUrl: e.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                  {form.ficheUrl && (
                    <a href={form.ficheUrl} target="_blank" rel="noopener noreferrer"
                      className="p-2 rounded-md border border-border hover:bg-muted text-primary shrink-0 mb-0.5"
                      title="Tester le lien">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
              {form.ficheUrl && form.ficheLinkLabel && (
                <p className="text-xs text-muted-foreground">
                  Aperçu dans le mail : <span className="text-primary underline">{form.ficheLinkLabel}</span>
                </p>
              )}
            </div>

            {/* Composition */}
            <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold flex items-center gap-2"><Layers className="w-4 h-4" /> Produit composé</p>
                <button
                  type="button"
                  onClick={() => { setComposantPickerSearch(''); setComposantPickerOpen(true); }}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Ajouter un composant
                </button>
              </div>
              {composants.length === 0 && (
                <p className="text-xs text-muted-foreground">Aucun composant — cliquez sur "Ajouter" pour créer un produit composé</p>
              )}
              {(() => {
                // Calcule la quantité effective d'un composant en mode poids
                function qteDepuisPoids(c: typeof composants[0], p: typeof produits[0]): number {
                  if (c.poidsKg == null) return c.quantite;
                  // Si le produit est vendu au kg : quantite = poids saisi
                  if (p.unite?.toLowerCase() === 'kg') return c.poidsKg;
                  // Sinon : quantite = poidsKg / poids_unitaire
                  return p.poids && p.poids > 0 ? Math.round(c.poidsKg / p.poids * 10000) / 10000 : c.poidsKg;
                }
                function prixComposant(c: typeof composants[0]) {
                  const p = produits.find(pr => pr.id === c.produitId);
                  if (!p) return 0;
                  // Mode poids : prix = prixAchat × quantite_calculee
                  if (c.poidsKg != null) return p.prixAchat * qteDepuisPoids(c, p);
                  // Mode % : coût = pct% du prix unitaire
                  if (c.consommationPct != null) return p.prixAchat * c.consommationPct / 100;
                  return p.prixAchat * c.quantite;
                }
                function recalcPrix(updated: typeof composants) {
                  const total = updated.reduce((sum, c) => sum + prixComposant(c), 0);
                  if (total > 0) updateFormPrix({ prixAchat: Math.round(total * 100) / 100 });
                }
                // Propage les modifications de quantité aux composants en mode %
                function calcQtyPct(pct: number, baseComp: typeof composants[0]) {
                  return Math.round(baseComp.quantite * pct / 100 * 10000) / 10000 || 0.0001;
                }
                function propagatePct(updated: typeof composants) {
                  return updated.map(c => {
                    if (c.consommationPct != null) {
                      if (c.baseComposantId) {
                        const base = updated.find(b => b.produitId === c.baseComposantId);
                        if (base) return { ...c, baseQuantite: base.quantite, quantite: calcQtyPct(c.consommationPct, base) };
                      } else if (c.baseQuantite != null && c.baseQuantite > 0) {
                        return { ...c, quantite: Math.round(c.baseQuantite * c.consommationPct / 100 * 10000) / 10000 || 0.0001 };
                      }
                    }
                    return c;
                  });
                }
                return composants.map((comp, idx) => {
                  const compProd = produits.find(p => p.id === comp.produitId);
                  const search = composantSearches[idx] || '';
                  const isOpen = composantOpenIdx === idx;
                  const modePoids = comp.poidsKg != null;
                  const modePercent = !modePoids && comp.consommationPct != null;
                  const availableProduits = produits
                    .filter(p => (!editing || p.id !== editing.id) && !composants.some((c, i) => i !== idx && c.produitId === p.id))
                    .filter(p => !search || `${p.reference} ${p.description}`.toLowerCase().includes(search.toLowerCase()))
                    .sort((a, b) => a.reference.localeCompare(b.reference));
                  const basesDisponibles = composants.filter((c, i) => i !== idx && c.produitId);
                  // Quantité calculée en mode poids (pour affichage)
                  const qteCalcPoids = compProd && modePoids ? qteDepuisPoids(comp, compProd) : null;

                  return (
                    <div key={comp.produitId || `new-${idx}`} className="space-y-1">
                      <div className="flex flex-wrap sm:flex-nowrap items-start gap-2">
                        {/* Combobox produit */}
                        <div className="flex-1 min-w-0 relative">
                          <Input
                            value={search}
                            onChange={e => {
                              const searches = [...composantSearches];
                              searches[idx] = e.target.value;
                              setComposantSearches(searches);
                              setComposantOpenIdx(idx);
                              if (!e.target.value) {
                                const updated = [...composants];
                                updated[idx] = { ...updated[idx], produitId: '' };
                                setComposants(updated);
                              }
                            }}
                            onFocus={() => {
                              setComposantOpenIdx(idx);
                              // Efface le texte "ref — desc" pour permettre une nouvelle recherche
                              if (comp.produitId) {
                                const searches = [...composantSearches];
                                searches[idx] = '';
                                setComposantSearches(searches);
                              }
                            }}
                            onBlur={() => setTimeout(() => setComposantOpenIdx(null), 200)}
                            placeholder="Rechercher un produit…"
                            className="text-sm"
                          />
                          {compProd && !isOpen && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <p className="text-xs text-primary truncate">{compProd.reference} — {compProd.description}</p>
                              <button
                                type="button"
                                onClick={() => openComposant(compProd)}
                                className="p-0.5 rounded hover:bg-primary/10 text-primary/50 hover:text-primary shrink-0 transition-colors"
                                title={`Ouvrir la fiche de ${compProd.reference}`}
                              >
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          {isOpen && (
                            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                              {availableProduits.length === 0 && <p className="text-xs text-muted-foreground px-3 py-2">Aucun produit trouvé</p>}
                              {availableProduits.map(p => (
                                <button key={p.id} type="button"
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between gap-2"
                                  onMouseDown={e => {
                                    e.preventDefault();
                                    const updated = [...composants];
                                    updated[idx] = { ...updated[idx], produitId: p.id };
                                    setComposants(updated);
                                    const searches = [...composantSearches];
                                    searches[idx] = '';
                                    setComposantSearches(searches);
                                    setComposantOpenIdx(null);
                                    recalcPrix(updated);
                                  }}
                                >
                                  <span><span className="font-mono text-xs text-muted-foreground">{p.reference}</span> {p.description}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">{formatMontant(p.prixAchat)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Quantité / Poids / % */}
                        {modePoids ? (
                          /* ── Mode Poids ── */
                          <div className="flex items-center gap-1 shrink-0 flex-wrap">
                            <Input
                              type="number" min={0} step="any"
                              value={comp.poidsKg ?? ''}
                              onChange={e => {
                                const kg = parseFloat(e.target.value) || 0;
                                const qte = compProd ? qteDepuisPoids({ ...comp, poidsKg: kg }, compProd) : kg;
                                const updated = [...composants];
                                updated[idx] = { ...updated[idx], poidsKg: kg, quantite: qte };
                                setComposants(updated);
                                recalcPrix(updated);
                              }}
                              className="text-sm min-w-[4rem]"
                              style={{ width: `${Math.max(6, String(comp.poidsKg ?? '').length + 2)}ch` }}
                              placeholder="kg"
                            />
                            <span className="text-xs text-muted-foreground">kg</span>
                            {/* Afficher la quantité calculée si l'unité n'est pas kg */}
                            {compProd && compProd.unite?.toLowerCase() !== 'kg' && compProd.poids && compProd.poids > 0 && qteCalcPoids != null && (
                              <span className="text-xs text-muted-foreground">
                                → <span className="font-medium text-foreground">{qteCalcPoids} {compProd.unite || 'u.'}</span>
                              </span>
                            )}
                            <button type="button" title="Repasser en quantité fixe"
                              onClick={() => {
                                const updated = [...composants];
                                updated[idx] = { ...updated[idx], poidsKg: undefined };
                                setComposants(updated);
                                recalcPrix(updated);
                              }}
                              className="text-xs text-muted-foreground hover:text-destructive"
                            >✕</button>
                          </div>
                        ) : modePercent ? (
                          /* ── Mode % ── */
                          <div className="flex items-center gap-1 shrink-0 flex-wrap">
                            <Input
                              type="number" min={0} max={100} step="any"
                              value={comp.consommationPct ?? ''}
                              onChange={e => {
                                const pct = parseFloat(e.target.value) || 0;
                                const baseQty = comp.baseComposantId
                                  ? (composants.find(c => c.produitId === comp.baseComposantId)?.quantite ?? comp.baseQuantite ?? 0)
                                  : (comp.baseQuantite ?? 0);
                                const newQty = baseQty > 0 ? Math.round(baseQty * pct / 100 * 10000000000) / 10000000000 || 0.0000000001 : comp.quantite;
                                const updated = [...composants];
                                updated[idx] = { ...updated[idx], consommationPct: pct, quantite: newQty };
                                setComposants(updated);
                                recalcPrix(updated);
                              }}
                              className="text-sm min-w-[4rem]"
                              style={{ width: `${Math.max(6, String(comp.consommationPct ?? '').length + 2)}ch` }}
                              placeholder="%"
                            />
                            <span className="text-xs text-muted-foreground">% ×</span>
                            <Input
                              type="number" min={0} step="any"
                              value={comp.baseQuantite ?? ''}
                              onChange={e => {
                                const baseQty = parseFloat(e.target.value) || 0;
                                const pct = comp.consommationPct ?? 0;
                                const newQty = baseQty > 0 && pct > 0 ? Math.round(baseQty * pct / 100 * 10000000000) / 10000000000 || 0.0000000001 : comp.quantite;
                                const updated = [...composants];
                                updated[idx] = { ...updated[idx], baseQuantite: baseQty, baseComposantId: '', quantite: newQty };
                                setComposants(updated);
                                recalcPrix(updated);
                              }}
                              className="text-sm min-w-[4rem]"
                              style={{ width: `${Math.max(6, String(comp.baseQuantite ?? 'base').length + 2)}ch` }}
                              placeholder="base"
                            />
                            {basesDisponibles.length > 0 && (
                              <select
                                value={comp.baseComposantId || ''}
                                onChange={e => {
                                  const baseId = e.target.value;
                                  const base = baseId ? composants.find(c => c.produitId === baseId) : undefined;
                                  const baseQty = base ? base.quantite : (comp.baseQuantite ?? 0);
                                  const pct = comp.consommationPct ?? 0;
                                  const newQty = baseQty > 0 && pct > 0 ? Math.round(baseQty * pct / 100 * 10000) / 10000 || 0.0001 : comp.quantite;
                                  const updated = [...composants];
                                  updated[idx] = { ...updated[idx], baseComposantId: baseId, baseQuantite: baseQty, quantite: newQty };
                                  setComposants(updated);
                                  recalcPrix(updated);
                                }}
                                className="text-xs border border-border rounded px-1.5 py-1 bg-background text-foreground max-w-[90px]"
                                title="Lier à un autre composant"
                              >
                                <option value="">lier…</option>
                                {basesDisponibles.map(c => {
                                  const p = produits.find(pr => pr.id === c.produitId);
                                  return p ? <option key={c.produitId} value={c.produitId}>{p.reference}</option> : null;
                                })}
                              </select>
                            )}
                            <span className="text-xs text-muted-foreground shrink-0">= {comp.quantite}</span>
                            <button type="button" title="Repasser en quantité fixe"
                              onClick={() => {
                                const updated = [...composants];
                                updated[idx] = { ...updated[idx], consommationPct: undefined, baseComposantId: undefined, baseQuantite: undefined };
                                setComposants(updated);
                              }}
                              className="text-xs text-muted-foreground hover:text-destructive"
                            >✕</button>
                          </div>
                        ) : (
                          /* ── Mode Quantité fixe ── */
                          <div className="flex items-center gap-1 shrink-0">
                            <Input
                              type="number" min={0} step="any"
                              value={comp.quantite}
                              onChange={e => {
                                const updated = [...composants];
                                updated[idx] = { ...updated[idx], quantite: parseFloat(e.target.value) || 1 };
                                const propagated = propagatePct(updated);
                                setComposants(propagated);
                                recalcPrix(propagated);
                              }}
                              className="text-sm min-w-[4rem]"
                              style={{ width: `${Math.max(6, String(comp.quantite).length + 2)}ch` }}
                              placeholder="Qté"
                            />
                            <button type="button" title="Saisir en poids (kg)"
                              onClick={() => {
                                const updated = [...composants];
                                updated[idx] = { ...updated[idx], poidsKg: comp.quantite, consommationPct: undefined, baseComposantId: undefined, baseQuantite: undefined };
                                setComposants(updated);
                                recalcPrix(updated);
                              }}
                              className="text-xs px-1.5 py-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary"
                            >kg</button>
                            <button type="button" title="Définir en % d'un autre composant"
                              onClick={() => {
                                const updated = [...composants];
                                updated[idx] = { ...updated[idx], consommationPct: 10, baseComposantId: '', poidsKg: undefined };
                                setComposants(updated);
                              }}
                              className="text-xs px-1.5 py-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary"
                            >%</button>
                          </div>
                        )}

                        <span className="text-xs text-muted-foreground shrink-0 text-right pt-2 whitespace-nowrap">
                          {compProd ? formatMontant(prixComposant(comp)) : '—'}
                        </span>
                        <button type="button"
                          onClick={() => {
                            const updated = composants.filter((_, i) => i !== idx);
                            const searches = composantSearches.filter((_, i) => i !== idx);
                            setComposants(updated);
                            setComposantSearches(searches);
                            recalcPrix(updated);
                          }}
                          className="p-1 hover:bg-destructive/10 rounded text-destructive mt-0.5"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                      </div>
                      {/* Ligne de détail selon le mode */}
                      {modePoids && compProd && comp.poidsKg != null && (
                        <p className="text-xs text-muted-foreground pl-1 flex flex-wrap gap-x-3 gap-y-0.5">
                          {compProd.unite?.toLowerCase() !== 'kg' && compProd.poids && compProd.poids > 0 ? (
                            <span>
                              {comp.poidsKg} kg ÷ {compProd.poids} kg/{compProd.unite || 'u.'} = <span className="font-medium text-foreground">{qteCalcPoids} {compProd.unite || 'u.'}</span>
                              <span className="ml-2">× {formatMontant(compProd.prixAchat)} = <span className="font-medium text-foreground">{formatMontant(prixComposant(comp))}</span></span>
                            </span>
                          ) : (
                            <span>{comp.poidsKg} kg × {formatMontant(compProd.prixAchat)}/kg = <span className="font-medium text-foreground">{formatMontant(prixComposant(comp))}</span></span>
                          )}
                        </p>
                      )}
                      {modePercent && comp.consommationPct != null && (() => {
                        const baseComp = comp.baseComposantId ? composants.find(c => c.produitId === comp.baseComposantId) : null;
                        const baseProd = comp.baseComposantId ? produits.find(p => p.id === comp.baseComposantId) : null;
                        const baseVal = baseComp ? baseComp.quantite : (comp.baseQuantite ?? 0);
                        const prix = compProd ? compProd.prixAchat * comp.consommationPct / 100 : 0;
                        return (
                          <p className="text-xs text-muted-foreground pl-1 flex flex-wrap gap-x-3 gap-y-0.5">
                            {baseVal > 0 && (
                              <span>
                                {comp.consommationPct}% × {baseVal}
                                {baseProd && <span className="text-primary ml-1">({baseProd.reference})</span>}
                                {' '}= <span className="font-medium text-foreground">{comp.quantite} kg</span>
                              </span>
                            )}
                            {compProd && (
                              <span>
                                {comp.consommationPct}% × {formatMontant(compProd.prixAchat)} = <span className="font-medium text-foreground">{formatMontant(prix)}</span>
                              </span>
                            )}
                          </p>
                        );
                      })()}
                    </div>
                  );
                });
              })()}
              {composants.length > 0 && (
                <div className="flex justify-between text-xs font-medium pt-1 border-t border-border">
                  <span className="text-muted-foreground">Prix achat calculé</span>
                  <span>{formatMontant(composants.reduce((sum, c) => {
                    const p = produits.find(pr => pr.id === c.produitId);
                    if (!p) return sum;
                    if (c.poidsKg != null) {
                      const qte = p.unite?.toLowerCase() === 'kg' ? c.poidsKg : (p.poids && p.poids > 0 ? c.poidsKg / p.poids : c.poidsKg);
                      return sum + p.prixAchat * qte;
                    }
                    if (c.consommationPct != null) return sum + p.prixAchat * c.consommationPct / 100;
                    return sum + p.prixAchat * c.quantite;
                  }, 0))}</span>
                </div>
              )}
            </div>

            {/* Kit — groupe de lignes type */}
            <div className="border border-border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isTypeKit}
                    onChange={e => setIsTypeKit(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-sm font-semibold">Type Kit (groupe de lignes)</span>
                </label>
                {isTypeKit && (
                  <button
                    type="button"
                    onClick={() => setLignesKit(prev => [...prev, { description: '', quantite: 1, unite: 'pièce', prixUnitaireHT: 0, remise: 0 }])}
                    className="text-xs text-primary hover:underline flex items-center gap-1 px-2 py-1 rounded border border-primary/30 hover:bg-primary/5 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Ajouter une ligne
                  </button>
                )}
              </div>
              <div className="p-3 space-y-3">
              {isTypeKit && (
                <>
                  {lignesKit.length === 0 && (
                    <p className="text-xs text-muted-foreground">Aucune ligne — ce kit sera inséré comme groupe vide dans le devis</p>
                  )}
                  {lignesKit.map((lk, idx) => {
                    const lkProd = lk.produitId ? produits.find(p => p.id === lk.produitId) : null;
                    return (
                      <div
                        key={idx}
                        draggable
                        onDragStart={() => setKitDragIdx(idx)}
                        onDragOver={e => { e.preventDefault(); setKitDragOverIdx(idx); }}
                        onDrop={() => {
                          if (kitDragIdx === null || kitDragIdx === idx) { setKitDragIdx(null); setKitDragOverIdx(null); return; }
                          setLignesKit(prev => {
                            const next = [...prev];
                            const [item] = next.splice(kitDragIdx, 1);
                            next.splice(idx, 0, item);
                            return next;
                          });
                          setKitDragIdx(null);
                          setKitDragOverIdx(null);
                        }}
                        onDragEnd={() => { setKitDragIdx(null); setKitDragOverIdx(null); }}
                        className={`flex flex-wrap gap-1.5 items-end rounded-lg p-1 transition-all border
                          ${kitDragIdx === idx ? 'opacity-40 border-primary/20 bg-primary/5' : ''}
                          ${kitDragOverIdx === idx && kitDragIdx !== idx ? 'border-primary border-2 shadow-md bg-primary/5' : kitDragIdx === idx ? '' : 'border-transparent'}`}
                      >
                        <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0 cursor-grab active:cursor-grabbing mt-5" />
                        {/* Produit */}
                        <div className="flex flex-col gap-0.5 min-w-[200px] flex-1">
                          <span className="text-xs text-muted-foreground">Produit</span>
                          <ProduitCombobox
                            produits={produits.filter(p => !p.typeKit)}
                            value={lk.produitId || ''}
                            onSelect={produitId => {
                              const p = produits.find(pr => pr.id === produitId);
                              setLignesKit(prev => prev.map((l, i) => i !== idx ? l : {
                                ...l,
                                produitId: produitId || undefined,
                                description: p ? p.description : l.description,
                                unite: p ? p.unite : l.unite,
                                prixUnitaireHT: p ? p.prixHT : l.prixUnitaireHT,
                                consommation: p?.consommation ?? l.consommation,
                              }));
                            }}
                          />
                        </div>
                        {/* Description */}
                        <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
                          <span className="text-xs text-muted-foreground">Description</span>
                          <Input
                            value={lk.description}
                            onChange={e => setLignesKit(prev => prev.map((l, i) => i !== idx ? l : { ...l, description: e.target.value }))}
                            placeholder="Description…"
                            className="text-xs h-7"
                          />
                        </div>
                        {/* Qté */}
                        <div className="flex flex-col gap-0.5 w-14">
                          <span className="text-xs text-muted-foreground">Qté</span>
                          <Input
                            type="number" min={0.01} step={0.01}
                            value={lk.quantite}
                            onChange={e => setLignesKit(prev => prev.map((l, i) => i !== idx ? l : { ...l, quantite: parseFloat(e.target.value) || 1 }))}
                            className="text-xs h-7"
                          />
                        </div>
                        {/* Consommation */}
                        <div className="flex flex-col gap-0.5 w-20">
                          <span className="text-xs text-muted-foreground">Conso kg/m²</span>
                          <Input
                            type="number" min={0} step={0.001}
                            value={lk.consommation ?? ''}
                            placeholder="—"
                            onChange={e => setLignesKit(prev => prev.map((l, i) => i !== idx ? l : { ...l, consommation: parseFloat(e.target.value) || undefined }))}
                            className="text-xs h-7"
                          />
                        </div>
                        {/* Unité */}
                        <div className="flex flex-col gap-0.5 w-16">
                          <span className="text-xs text-muted-foreground">Unité</span>
                          <Input
                            value={lk.unite}
                            onChange={e => setLignesKit(prev => prev.map((l, i) => i !== idx ? l : { ...l, unite: e.target.value }))}
                            className="text-xs h-7"
                          />
                        </div>
                        {/* Prix HT */}
                        <div className="flex flex-col gap-0.5 w-20">
                          <span className="text-xs text-muted-foreground">Prix HT</span>
                          <Input
                            type="number" min={0} step={0.01}
                            value={lk.prixUnitaireHT}
                            onChange={e => setLignesKit(prev => prev.map((l, i) => i !== idx ? l : { ...l, prixUnitaireHT: parseFloat(e.target.value) || 0 }))}
                            className="text-xs h-7"
                          />
                        </div>
                        {/* Remise */}
                        <div className="flex flex-col gap-0.5 w-14">
                          <span className="text-xs text-muted-foreground">Rem%</span>
                          <Input
                            type="number" min={0} max={100} step={1}
                            value={lk.remise}
                            onChange={e => setLignesKit(prev => prev.map((l, i) => i !== idx ? l : { ...l, remise: parseFloat(e.target.value) || 0 }))}
                            className="text-xs h-7"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setLignesKit(prev => prev.filter((_, i) => i !== idx))}
                          className="p-1 hover:bg-destructive/10 rounded text-destructive"
                          title="Supprimer cette ligne"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                        {/* Note */}
                        <div className="w-full pl-5">
                          <Input
                            value={lk.note || ''}
                            onChange={e => setLignesKit(prev => prev.map((l, i) => i !== idx ? l : { ...l, note: e.target.value || undefined }))}
                            placeholder="Note (optionnelle)…"
                            className="h-6 text-xs text-muted-foreground bg-transparent border-transparent hover:border-input focus:border-input"
                          />
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              {isTypeKit && lignesKit.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLignesKit(prev => [...prev, { description: '', quantite: 1, unite: 'pièce', prixUnitaireHT: 0, remise: 0 }])}
                  className="w-full mt-1 py-2 text-xs text-primary border border-dashed border-primary/40 rounded-lg hover:bg-primary/5 transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Ajouter une ligne
                </button>
              )}
              </div>{/* fin p-3 space-y-3 */}
            </div>

            {/* Picker composant */}
            <Dialog open={composantPickerOpen} onOpenChange={open => { setComposantPickerOpen(open); if (!open) setComposantPickerSearch(''); }}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Layers className="w-4 h-4" /> Sélectionner un composant</DialogTitle>
                </DialogHeader>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder="Rechercher par référence ou désignation…"
                    value={composantPickerSearch}
                    onChange={e => setComposantPickerSearch(e.target.value)}
                    className="pl-8 text-sm"
                  />
                </div>
                <div className="max-h-72 overflow-y-auto border border-border rounded-md divide-y divide-border">
                  {(() => {
                    const available = produits
                      .filter(p => (!editing || p.id !== editing.id) && !composants.some(c => c.produitId === p.id))
                      .filter(p => !composantPickerSearch || `${p.reference} ${p.description}`.toLowerCase().includes(composantPickerSearch.toLowerCase()))
                      .sort((a, b) => a.reference.localeCompare(b.reference));
                    if (available.length === 0) return <p className="text-xs text-muted-foreground px-3 py-4 text-center">Aucun produit trouvé</p>;
                    return available.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted flex items-center justify-between gap-2"
                        onClick={() => {
                          const newComp = { produitId: p.id, quantite: 1 };
                          const updated = [...composants, newComp];
                          setComposants(updated);
                          setComposantSearches(prev => [...prev, `${p.reference} — ${p.description}`]);
                          setComposantPickerOpen(false);
                          const total = updated.reduce((sum, c) => {
                            const pr = produits.find(pr => pr.id === c.produitId);
                            return sum + (pr ? pr.prixAchat * c.quantite : 0);
                          }, 0);
                          if (total > 0) updateFormPrix({ prixAchat: Math.round(total * 100) / 100 });
                        }}
                      >
                        <span><span className="font-mono text-xs text-muted-foreground">{p.reference}</span> {p.description}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{formatMontant(p.prixAchat)}</span>
                      </button>
                    ));
                  })()}
                </div>
              </DialogContent>
            </Dialog>

          </div>)} {/* fin onglet Infos */}

          {/* ══ Onglet Stock & Entrepôts ═══════════════════════════════════ */}
          {produitTab === 'stock' && (() => {
            const reserve = editing ? (stockReserveParProduit[editing.id] || 0) : 0;
            const stockActuel = form.stock;
            const dispo = stockActuel - reserve;
            return (
              <div className="space-y-4 py-2">
                {/* Indicateurs disponible / réservé / final */}
                <div className="grid grid-cols-3 gap-3">
                  {/* Le chiffre d'ODOO est mis à hauteur du nôtre, dans la
                      même tuile — c'est là que l'œil va. Les deux restent
                      distincts : « Disponible » est ce que MonCRM tient,
                      la ligne du dessous ce que l'ERP constate, et l'écart
                      entre les deux est justement ce qu'il faut voir. */}
                  <div className="bg-card border border-border rounded-xl p-3 text-center">
                    <p className="text-2xl font-heading font-bold text-success">{stockActuel}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Disponible</p>
                    {editing?.stockOdoo !== undefined && (
                      <p className="text-[11px] font-semibold text-success/80 mt-1">
                        {editing.stockOdoo} chez Odoo
                      </p>
                    )}
                  </div>
                  <div className="bg-card border border-border rounded-xl p-3 text-center">
                    <p className="text-2xl font-heading font-bold text-warning">{reserve}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Réservé (cmd)</p>
                  </div>
                  <div className={`bg-card border rounded-xl p-3 text-center ${dispo < 0 ? 'border-destructive/50' : 'border-border'}`}>
                    <p className={`text-2xl font-heading font-bold ${dispo < 0 ? 'text-destructive' : dispo === 0 ? 'text-muted-foreground' : 'text-primary'}`}>{dispo}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Dispo finale</p>
                    {editing?.stockOdooPrevu !== undefined && (
                      <p className="text-[11px] font-semibold text-primary/80 mt-1">
                        {editing.stockOdooPrevu} prévu Odoo
                      </p>
                    )}
                  </div>
                </div>

                {/* Valeur de stock (cumul des achats datés) */}
                {editing && canAchat && (
                  <button type="button" onClick={() => setProduitTab('valorisation')} className="w-full flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3 hover:bg-muted/40 transition-colors text-left">
                    <div>
                      <p className="text-sm font-medium">Valeur de stock (PMP × stock)</p>
                      <p className="text-xs text-muted-foreground">Prix moyen pondéré des achats datés — voir onglet Valorisation</p>
                    </div>
                    <span className="text-lg font-bold text-primary">{formatMontant(valeurStockParProduit[editing.id] || 0)} €</span>
                  </button>
                )}

                {/* Champs stock */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Stock total</Label>
                    <InputNombre decimales={0} value={form.stock} onChange={v => setForm(p => ({ ...p, stock: v }))} />
                    {/* Le stock d'Odoo est montré A COTE, jamais fondu dans le
                        precedent : l'un est ce que MonCRM tient, l'autre ce que
                        l'ERP constate, et l'ecart est justement l'information. */}
                    {editing?.stockOdoo !== undefined && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Odoo : <strong>{editing.stockOdoo}</strong> dispo
                        {editing.stockOdooPrevu !== undefined
                          && editing.stockOdooPrevu !== editing.stockOdoo
                          && <> · <strong>{editing.stockOdooPrevu}</strong> prévu</>}
                        {editing.stockOdooMaj && ` — lu le ${formatDate(editing.stockOdooMaj)}`}
                      </p>
                    )}
                  </div>
                  <div><Label>Stock minimum</Label><InputNombre decimales={0} value={form.stockMin} onChange={v => setForm(p => ({ ...p, stockMin: v }))} /></div>
                </div>

                {/* Disponible à la vente */}
                <label className="flex items-center gap-2.5 px-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={(form as any).disponibleVente !== false}
                    onChange={e => setForm(p => ({ ...p, disponibleVente: e.target.checked }))}
                    className="rounded w-4 h-4 accent-primary"
                  />
                  <span className="text-sm font-medium">Disponible à la vente</span>
                  <span className="text-xs text-muted-foreground">(visible dans stock &amp; devis)</span>
                </label>

                {/* Propriétaire de la marchandise */}
                <div className="space-y-2 rounded-md border border-border p-3 bg-muted/20">
                  <p className="text-xs font-medium text-muted-foreground">Propriétaire de la marchandise</p>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="radio" name="proprietaire" value="isosign"
                        checked={((form as any).proprietaire ?? 'isosign') === 'isosign'}
                        onChange={() => setForm(p => ({ ...p, proprietaire: 'isosign', proprietaireFournisseurId: '' }))}
                        className="accent-primary"
                      /> ISOSIGN
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="radio" name="proprietaire" value="fournisseur"
                        checked={(form as any).proprietaire === 'fournisseur'}
                        onChange={() => setForm(p => ({ ...p, proprietaire: 'fournisseur' }))}
                        className="accent-primary"
                      /> Fournisseur (dépôt)
                    </label>
                  </div>
                  {(form as any).proprietaire === 'fournisseur' && (
                    <div>
                      <Label className="text-xs">Fournisseur propriétaire</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={(form as any).proprietaireFournisseurId || ''}
                        onChange={e => setForm(p => ({ ...p, proprietaireFournisseurId: e.target.value }))}
                      >
                        <option value="">— Choisir un fournisseur —</option>
                        {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.societe}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* ── Entrepôts ── */}
                <div className="space-y-2 rounded-md border border-border p-3 bg-muted/20">
                  <p className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                    <Warehouse className="w-3.5 h-3.5" /> Répartition par entrepôt
                  </p>
                  {entrepots.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">Aucun entrepôt configuré. Créez-en un depuis la page Stock → onglet "Par entrepôt".</p>
                  ) : editing ? (
                    <div className="space-y-1.5">
                      {entrepots.map(e => {
                        const stockIci = stockEntrepots.find(s => s.produitId === editing.id && s.entrepotId === e.id)?.stock ?? 0;
                        const isEdit = entrepotStockEdit?.id === e.id;
                        return (
                          <div key={e.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-background transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium flex items-center gap-1.5">
                                <Warehouse className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                {e.nom}
                                {e.estDefaut && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Défaut</span>}
                              </p>
                              {e.ville && <p className="text-xs text-muted-foreground pl-5">{e.ville}</p>}
                            </div>
                            {isEdit ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number" min={0}
                                  className="w-20 h-7 text-right text-sm"
                                  value={entrepotStockEdit.value}
                                  onChange={ev => setEntrepotStockEdit({ id: e.id, value: ev.target.value })}
                                  onKeyDown={async ev => {
                                    if (ev.key === 'Enter') {
                                      const v = parseInt(entrepotStockEdit.value);
                                      if (!isNaN(v) && v >= 0) {
                                        await upsertStockEntrepot(editing.id, e.id, v);
                                        const newTotal = stockEntrepots.filter(s => s.produitId === editing.id && s.entrepotId !== e.id).reduce((a, s) => a + s.stock, 0) + v;
                                        setForm(p => ({ ...p, stock: newTotal }));
                                        majProduitEdite(p => ({ ...p, stock: newTotal }));
                                        toast.success('Stock mis à jour');
                                      }
                                      setEntrepotStockEdit(null);
                                    }
                                    if (ev.key === 'Escape') setEntrepotStockEdit(null);
                                  }}
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const v = parseInt(entrepotStockEdit.value);
                                    if (!isNaN(v) && v >= 0) {
                                      await upsertStockEntrepot(editing.id, e.id, v);
                                      const newTotal = stockEntrepots.filter(s => s.produitId === editing.id && s.entrepotId !== e.id).reduce((a, s) => a + s.stock, 0) + v;
                                      setForm(p => ({ ...p, stock: newTotal }));
                                      majProduitEdite(p => ({ ...p, stock: newTotal }));
                                      toast.success('Stock mis à jour');
                                    }
                                    setEntrepotStockEdit(null);
                                  }}
                                  className="p-1 rounded text-success hover:bg-success/10"
                                ><Save className="w-3.5 h-3.5" /></button>
                                <button type="button" onClick={() => setEntrepotStockEdit(null)} className="p-1 rounded text-muted-foreground hover:bg-muted"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEntrepotStockEdit({ id: e.id, value: String(stockIci) })}
                                className="font-semibold text-sm hover:text-primary transition-colors px-2 py-0.5 rounded hover:bg-primary/5 shrink-0"
                              >
                                {stockIci} {form.unite}
                              </button>
                            )}
                          </div>
                        );
                      })}
                      <p className="text-xs text-muted-foreground px-2 pt-1">Cliquez sur une quantité pour la modifier.</p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-1">Enregistrez le produit d'abord pour affecter du stock aux entrepôts.</p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ══ Onglet Fournisseurs ════════════════════════════════════════ */}
          {produitTab === 'fournisseurs' && (
            <div className="py-2">
              {editing ? (
                composants.length > 0 ? (
                  <div className="border border-border rounded-lg p-3 bg-muted/20 text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-base leading-none">ℹ️</span>
                    <span>Produit composé — les fournisseurs et prix achat sont gérés au niveau de chaque composant.</span>
                  </div>
                ) : (
                  <ProduitFournisseursPanel produitId={editing.id} qteCommande={Math.max(1, form.stockMin - form.stock)} />
                )
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">Enregistrez le produit d'abord pour gérer les fournisseurs.</p>
              )}
            </div>
          )}

          {/* ══ Onglet Devis ═══════════════════════════════════════════════ */}
          {produitTab === 'devis' && (
            <div className="py-2">
              {!editing ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Enregistrez le produit d'abord pour voir les devis associés.</p>
              ) : produitDevisRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Ce produit n'apparaît dans aucun devis.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 px-1">
                    <span>{produitDevisRows.length} devis · {produitDevisRows.reduce((s, r) => s + r.qte, 0)} u. au total</span>
                    <span className="font-semibold text-foreground">{formatMontant(produitDevisRows.reduce((s, r) => s + r.montantHT, 0))} € HT</span>
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted text-xs text-muted-foreground">
                          <th className="text-left px-3 py-2 font-medium">N°</th>
                          <th className="text-left px-3 py-2 font-medium">Client</th>
                          <th className="text-left px-3 py-2 font-medium">Date</th>
                          <th className="text-left px-3 py-2 font-medium">Statut</th>
                          <th className="text-right px-3 py-2 font-medium">Qté</th>
                          <th className="text-right px-3 py-2 font-medium">Montant HT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {produitDevisRows.map(r => (
                          <tr key={r.id} className="border-t border-border hover:bg-muted/40 cursor-pointer" onClick={() => { setDialogOpen(false); navigate(`/devis?editDevis=${r.id}`); }}>
                            <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.numero}</td>
                            <td className="px-3 py-2 truncate max-w-[140px]">{clientLabel(r.clientId)}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatDate(r.date)}</td>
                            <td className="px-3 py-2"><span className="text-xs capitalize">{r.statut}</span></td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.qte}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMontant(r.montantHT)} €</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ Onglet Commandes (client) ══════════════════════════════════ */}
          {produitTab === 'commandes' && (
            <div className="py-2">
              {!editing ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Enregistrez le produit d'abord pour voir les commandes associées.</p>
              ) : produitCommandesRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Ce produit n'apparaît dans aucune commande client.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 px-1">
                    <span>{produitCommandesRows.length} commande(s) · {produitCommandesRows.reduce((s, r) => s + r.qte, 0)} u. au total</span>
                    <span className="font-semibold text-foreground">{formatMontant(produitCommandesRows.reduce((s, r) => s + r.montantHT, 0))} € HT</span>
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted text-xs text-muted-foreground">
                          <th className="text-left px-3 py-2 font-medium">N°</th>
                          <th className="text-left px-3 py-2 font-medium">Client</th>
                          <th className="text-left px-3 py-2 font-medium">Date</th>
                          <th className="text-left px-3 py-2 font-medium">Statut</th>
                          <th className="text-right px-3 py-2 font-medium">Qté</th>
                          <th className="text-right px-3 py-2 font-medium">Montant HT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {produitCommandesRows.map(r => (
                          <tr key={r.id} className="border-t border-border hover:bg-muted/40 cursor-pointer" onClick={() => { setDialogOpen(false); navigate(`/commandes-client?search=${encodeURIComponent(r.numero)}`); }}>
                            <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.numero}</td>
                            <td className="px-3 py-2 truncate max-w-[140px]">{clientLabel(r.clientId)}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatDate(r.date)}</td>
                            <td className="px-3 py-2"><span className="text-xs capitalize">{r.statut}</span></td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.qte}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMontant(r.montantHT)} €</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ Onglet Commandes fournisseur ═══════════════════════════════ */}
          {produitTab === 'commandesF' && (
            <div className="py-2">
              {!editing ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Enregistrez le produit d'abord pour voir les commandes fournisseur associées.</p>
              ) : produitCommandesFournRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Ce produit n'apparaît dans aucune commande fournisseur.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 px-1">
                    <span>{produitCommandesFournRows.length} commande(s) · {produitCommandesFournRows.reduce((s, r) => s + r.qte, 0)} u. au total</span>
                    <span className="font-semibold text-foreground">{formatMontant(produitCommandesFournRows.reduce((s, r) => s + r.montantHT, 0))} € HT (achat)</span>
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted text-xs text-muted-foreground">
                          <th className="text-left px-3 py-2 font-medium">N°</th>
                          <th className="text-left px-3 py-2 font-medium">Fournisseur</th>
                          <th className="text-left px-3 py-2 font-medium">Date</th>
                          <th className="text-left px-3 py-2 font-medium">Statut</th>
                          <th className="text-right px-3 py-2 font-medium">Qté</th>
                          <th className="text-right px-3 py-2 font-medium">Montant HT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {produitCommandesFournRows.map(r => (
                          <tr key={r.id} className="border-t border-border hover:bg-muted/40 cursor-pointer" onClick={() => { setDialogOpen(false); navigate(`/commandes?search=${encodeURIComponent(r.numero)}`); }}>
                            <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.numero}</td>
                            <td className="px-3 py-2 truncate max-w-[140px]">{fournLabel(r.fournisseurId)}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatDate(r.date)}</td>
                            <td className="px-3 py-2"><span className="text-xs capitalize">{r.statut.replace('_', ' ')}</span></td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.qte}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMontant(r.montantHT)} €</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ Onglet Valorisation ════════════════════════════════════════ */}
          {produitTab === 'valorisation' && (() => {
            const autoAchats = editing ? (achatsParProduit.get(editing.id) || []).filter(a => a.source === 'commande') : [];
            const totalAuto = autoAchats.reduce((s, a) => s + a.prix * a.quantite, 0);
            const qteAuto = autoAchats.reduce((s, a) => s + a.quantite, 0);
            const totalManuel = achatsManuel.reduce((s, a) => s + (a.prix || 0) * (a.quantite || 0), 0);
            const qteManuel = achatsManuel.reduce((s, a) => s + (a.quantite || 0), 0);
            const totalGeneral = totalAuto + totalManuel;
            const qteTotale = qteAuto + qteManuel;
            const pmp = qteTotale > 0 ? totalGeneral / qteTotale : 0;
            const valeurStockActuel = pmp * (form.stock || 0);
            return (
              <div className="py-2 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-card border border-border rounded-xl p-3 text-center">
                    <p className="text-lg font-heading font-bold">{formatMontant(pmp)} €</p>
                    <p className="text-xs text-muted-foreground mt-0.5">PMP (prix moyen pondéré)</p>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-3 text-center">
                    <p className="text-lg font-heading font-bold">{form.stock || 0}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Stock courant</p>
                  </div>
                  <div className="bg-primary/5 border border-primary/30 rounded-xl p-3 text-center">
                    <p className="text-lg font-heading font-bold text-primary">{formatMontant(valeurStockActuel)} €</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Valeur stock (PMP × stock)</p>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Cumul des achats — Σ (prix × qté) sur {qteTotale} u.</span>
                  <span className="font-semibold">{formatMontant(totalGeneral)} €</span>
                </div>

                {/* Achats issus des commandes fournisseur (auto, lecture seule) */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Achats — commandes fournisseur (auto)</p>
                  {!editing ? (
                    <p className="text-xs text-muted-foreground">Enregistrez le produit d'abord.</p>
                  ) : autoAchats.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucune commande fournisseur pour ce produit.</p>
                  ) : (
                    <div className="border border-border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-muted text-xs text-muted-foreground">
                          <th className="text-left px-3 py-1.5 font-medium">Date</th>
                          <th className="text-left px-3 py-1.5 font-medium">Réf.</th>
                          <th className="text-right px-3 py-1.5 font-medium">Prix achat</th>
                          <th className="text-right px-3 py-1.5 font-medium">Qté</th>
                          <th className="text-right px-3 py-1.5 font-medium">Valeur</th>
                        </tr></thead>
                        <tbody>
                          {autoAchats.map((a, i) => (
                            <tr key={i} className="border-t border-border">
                              <td className="px-3 py-1.5 whitespace-nowrap">{formatDate(a.date)}</td>
                              <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{a.ref || '—'}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{formatMontant(a.prix)} €</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{a.quantite}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatMontant(a.prix * a.quantite)} €</td>
                            </tr>
                          ))}
                          <tr className="border-t border-border bg-muted/30 text-xs font-semibold">
                            <td className="px-3 py-1.5" colSpan={4}>Sous-total commandes</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{formatMontant(totalAuto)} €</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Achats manuels (éditables) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Achats — saisie manuelle</p>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAchatsManuel(prev => [...prev, { date: new Date().toISOString().split('T')[0], prix: 0, quantite: 0, source: 'manuel' }])}>
                      <Plus className="w-3.5 h-3.5" /> Ligne
                    </Button>
                  </div>
                  {achatsManuel.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucune saisie manuelle. Ajoutez une ligne pour enregistrer un achat daté.</p>
                  ) : (
                    <div className="border border-border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-muted text-xs text-muted-foreground">
                          <th className="text-left px-2 py-1.5 font-medium">Date</th>
                          <th className="text-right px-2 py-1.5 font-medium">Prix achat (€)</th>
                          <th className="text-right px-2 py-1.5 font-medium">Qté</th>
                          <th className="text-right px-2 py-1.5 font-medium">Valeur</th>
                          <th className="w-8"></th>
                        </tr></thead>
                        <tbody>
                          {achatsManuel.map((a, idx) => (
                            <tr key={idx} className="border-t border-border">
                              <td className="px-2 py-1"><Input type="date" value={a.date} onChange={e => setAchatsManuel(prev => prev.map((x, i) => i === idx ? { ...x, date: e.target.value } : x))} className="h-7 text-xs" /></td>
                              <td className="px-2 py-1"><Input type="number" step="0.01" value={a.prix || ''} onChange={e => setAchatsManuel(prev => prev.map((x, i) => i === idx ? { ...x, prix: parseFloat(e.target.value) || 0 } : x))} className="h-7 text-xs text-right w-24 ml-auto" /></td>
                              <td className="px-2 py-1"><Input type="number" step="any" value={a.quantite || ''} onChange={e => setAchatsManuel(prev => prev.map((x, i) => i === idx ? { ...x, quantite: parseFloat(e.target.value) || 0 } : x))} className="h-7 text-xs text-right w-20 ml-auto" /></td>
                              <td className="px-2 py-1 text-right tabular-nums font-medium whitespace-nowrap">{formatMontant((a.prix || 0) * (a.quantite || 0))} €</td>
                              <td className="px-2 py-1 text-center"><button type="button" onClick={() => setAchatsManuel(prev => prev.filter((_, i) => i !== idx))} className="text-destructive hover:opacity-70"><Trash2 className="w-3.5 h-3.5" /></button></td>
                            </tr>
                          ))}
                          <tr className="border-t border-border bg-muted/30 text-xs font-semibold">
                            <td className="px-2 py-1.5" colSpan={3}>Sous-total manuel</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{formatMontant(totalManuel)} €</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">La saisie manuelle est enregistrée avec le produit (bouton Modifier).</p>
                </div>
              </div>
            );
          })()}

          </div> {/* fin wrapper onglets */}

            <div className="sticky bottom-0 bg-background flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 pb-1 border-t border-border mt-2">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDialogOpen(false)}>Annuler</Button>
              {fromDevis && editing && (
                <Button variant="secondary" className="w-full sm:w-auto" onClick={() => save(true)}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Enregistrer & retour au devis
                </Button>
              )}
              <Button className="w-full sm:w-auto" onClick={() => save(false)}>{editing ? 'Modifier' : 'Ajouter'}</Button>
            </div>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Aperçu de l'import</DialogTitle></DialogHeader>
          {importPreview && (
            <>
              {/* Mode selection */}
              <div className="flex gap-2 mb-2">
                <Button
                  variant={importMode === 'add' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setImportMode('add')}
                >
                  Ajouter (nouveaux)
                </Button>
                <Button
                  variant={importMode === 'update' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setImportMode('update')}
                >
                  Mettre à jour (existants)
                </Button>
              </div>

              {importMode === 'update' && (
                <p className="text-xs text-muted-foreground">
                  Les produits seront mis à jour par correspondance sur la <strong>référence</strong>. Sélectionnez les colonnes à mettre à jour :
                </p>
              )}

              {/* Column mapping */}
              <div className="border border-border rounded-lg p-3 bg-muted/30 space-y-2">
                <p className="text-xs font-semibold">Correspondance des colonnes :</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {importFields.map(f => (
                    <div key={f.key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="rounded border-input shrink-0"
                        checked={importSelectedCols.has(f.key)}
                        onChange={() => {
                          setImportSelectedCols(prev => {
                            const next = new Set(prev);
                            next.has(f.key) ? next.delete(f.key) : next.add(f.key);
                            return next;
                          });
                        }}
                        disabled={importMode === 'update' && f.key === 'reference'}
                      />
                      <span className="text-xs w-28 shrink-0 truncate" title={f.label}>{f.label}</span>
                      <select
                        className="flex-1 text-xs rounded border border-input bg-background px-2 py-1"
                        value={importMapping[f.key] || ''}
                        onChange={e => {
                          setImportMapping(prev => {
                            const next = { ...prev };
                            if (e.target.value) {
                              next[f.key] = e.target.value;
                              // Auto-check when a column is selected
                              setImportSelectedCols(p => new Set([...p, f.key]));
                            } else {
                              delete next[f.key];
                              setImportSelectedCols(p => { const n = new Set(p); n.delete(f.key); return n; });
                            }
                            return next;
                          });
                        }}
                      >
                        <option value="">— non mappé —</option>
                        {excelColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-sm text-muted-foreground">{importPreview.length} ligne(s) détectée(s)</p>
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {Object.keys(importPreview[0] || {}).map((k, i) => <th key={i} className="px-2 py-1 text-left">{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b">
                        {Object.values(row).map((v, j) => <td key={j} className="px-2 py-1 whitespace-nowrap">{String(v)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importPreview.length > 10 && <p className="text-xs text-muted-foreground">... et {importPreview.length - 10} autres lignes</p>}
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setImportDialogOpen(false); setImportPreview(null); }}>Annuler</Button>
            <Button onClick={importArticles}>
              {importMode === 'update' ? `Mettre à jour` : `Importer ${importPreview?.length || 0} produit(s)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
