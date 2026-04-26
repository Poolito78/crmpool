import { useState, useRef, useEffect, useMemo, useCallback, Fragment } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useCRM } from '@/lib/StoreContext';
import { generateId, formatMontant, calculerFournisseurPrioritaire, type Produit, type ComposantProduit } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search, Edit2, Trash2, Upload, ArrowLeft, Filter, X, Download, Layers, Trash, Copy, ChevronUp, ChevronDown, ChevronsUpDown, Columns2 } from 'lucide-react';
import ProduitFournisseursPanel from '@/components/ProduitFournisseursPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { exportToExcel } from '@/lib/exportExcel';

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
  { key: 'stock',        label: 'Stock',            align: 'right' as const },
] as const;
type ColKey = typeof COLUMNS[number]['key'];
const DEFAULT_VISIBLE_COLS: ColKey[] = ['reference', 'description', 'categorie', 'prixAchat', 'coefficient', 'prixRevendeur', 'prixHT', 'stock'];

const emptyProduit = {
  reference: '', description: '', descriptionDetaillee: '', prixAchat: 0, coefficient: 1.6, prixHT: 0, coeffRevendeur: 1.6, remiseRevendeur: 30, prixRevendeur: 0, tva: 20, unite: 'pièce', poids: 0, consommation: 0, stock: 0, stockMin: 0, fournisseurId: '', categorie: ''
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
  const { produits, updateProduits, fournisseurs, produitFournisseurs, updateProduitFournisseurs, devis, updateDevis } = useCRM();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
    try {
      const s = localStorage.getItem('produits_visible_cols');
      if (s) return new Set(JSON.parse(s) as ColKey[]);
    } catch {}
    return new Set(DEFAULT_VISIBLE_COLS);
  });
  const [colChooserOpen, setColChooserOpen] = useState(false);
  const colChooserRef = useRef<HTMLDivElement>(null);
  const [sortCol, setSortCol] = useState<ColKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Produit | null>(null);
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
  const [showPrixPublic, setShowPrixPublic] = useState(false);

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
    if (needsUpdate) {
      setTimeout(() => updateProduits(prev => prev.map(p => {
        const safeP = safe.find(s => s.id === p.id);
        if (!safeP) return p;
        return {
          ...p, // préserve composants et tous les champs depuis l'état actuel
          prixAchat: safeP.prixAchat,
          coefficient: safeP.coefficient,
          coeffRevendeur: safeP.coeffRevendeur,
          remiseRevendeur: safeP.remiseRevendeur,
          prixRevendeur: safeP.prixRevendeur,
          prixHT: safeP.prixHT,
        };
      })), 0);
    }
    return safe;
  }, [produits]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = safeProduits.filter(p => {
    // Global search
    if (search && ![p.description, p.reference, p.categorie].some(v => v?.toLowerCase().includes(search.toLowerCase()))) return false;
    // Column filters
    for (const [key, val] of Object.entries(columnFilters)) {
      if (!val) continue;
      const v = val.toLowerCase();
      switch (key) {
        case 'reference':    if (!p.reference?.toLowerCase().includes(v)) return false; break;
        case 'description':  if (!p.description?.toLowerCase().includes(v)) return false; break;
        case 'categorie':    if (!p.categorie?.toLowerCase().includes(v)) return false; break;
        case 'fournisseur': { const pfsF = produitFournisseurs.filter(pf => pf.produitId === p.id); const names = pfsF.map(pf => fournisseurs.find(f => f.id === pf.fournisseurId)?.societe || '').join(' '); if (!names.toLowerCase().includes(v)) return false; break; }
        case 'prixAchat':    if (!formatMontant(p.prixAchat).toLowerCase().includes(v) && !String(p.prixAchat).includes(v)) return false; break;
        case 'coefficient':  if (!String(p.coefficient.toFixed(2)).includes(v)) return false; break;
        case 'prixHT':       if (!formatMontant(p.prixHT).toLowerCase().includes(v) && !String(p.prixHT).includes(v)) return false; break;
        case 'prixRevendeur':if (!formatMontant(p.prixRevendeur).toLowerCase().includes(v) && !String(p.prixRevendeur).includes(v)) return false; break;
        case 'poids':        if (!String(p.poids || 0).includes(v)) return false; break;
        case 'consommation': if (!String(p.consommation || 0).includes(v)) return false; break;
        case 'tva':          if (!String(p.tva).includes(v)) return false; break;
        case 'stock':        if (!String(p.stock).includes(v)) return false; break;
      }
    }
    return true;
  });

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
        case 'stock':        av = a.stock; bv = b.stock; break;
      }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === 'asc' ? av - (bv as number) : (bv as number) - av;
    });
  }, [filtered, sortCol, sortDir, fournisseurs, produitFournisseurs]);

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => {
    setSelected(prev => prev.size === sortedFiltered.length ? new Set() : new Set(sortedFiltered.map(p => p.id)));
  };
  
  function confirmDelete(id?: string) {
    setDeleteTarget(id || null);
    setDeleteConfirmOpen(true);
  }
  
  function removeSelected() {
    if (selected.size === 0) return;
    confirmDelete();
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

  function openNew() { setEditing(null); setForm(emptyProduit); setComposants([]); setComposantSearches([]); setComposantOpenIdx(null); setDialogOpen(true); }

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
    setEditing(p);
    const comps = p.composants || [];
    // Recalculate prixAchat from composants if composite
    let prixAchat = p.prixAchat;
    if (comps.length > 0) {
      const total = comps.reduce((sum, c) => {
        const cp = produits.find(pr => pr.id === c.produitId);
        return sum + (cp ? cp.prixAchat * c.quantite : 0);
      }, 0);
      if (total > 0) prixAchat = Math.round(total * 100) / 100;
    }
    const prixRevendeur = calcPrixRevendeurFromCoeff(prixAchat, p.coefficient);
    const prixHT = calcPrixPublicFromRevendeur(prixRevendeur, p.remiseRevendeur);
    setForm({ reference: p.reference, description: p.description, descriptionDetaillee: p.descriptionDetaillee || '', prixAchat, coefficient: p.coefficient, prixHT, coeffRevendeur: p.coeffRevendeur, remiseRevendeur: p.remiseRevendeur, prixRevendeur, tva: p.tva, unite: p.unite, poids: p.poids || 0, consommation: p.consommation || 0, stock: p.stock, stockMin: p.stockMin, fournisseurId: p.fournisseurId || '', categorie: p.categorie || '' });
    setComposants(comps);
    setComposantSearches(comps.map(c => { const pr = produits.find(x => x.id === c.produitId); return pr ? `${pr.reference} — ${pr.description}` : ''; }));
    setComposantOpenIdx(null);
    setDialogOpen(true);
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

    if (editing) {
      const updatedProd = { ...editing, ...form, composants: composantsToSave || undefined };
      updateProduits(prev => prev.map(p => p.id === editing.id ? updatedProd : p));
      // Écriture directe Supabase pour garantir la persistance des composants
      supabase.from('produits').update({ composants: composantsToSave as any }).eq('id', editing.id).then(({ error }) => {
        if (error) console.error('Erreur sauvegarde composants:', error);
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
      toast.success('Produit modifié');
    } else {
      const newId = generateId();
      const newProd = { ...form, id: newId, composants: composantsToSave || undefined, dateCreation: new Date().toISOString().split('T')[0] };
      updateProduits(prev => [...prev, newProd]);
      // Écriture directe Supabase pour garantir la persistance des composants
      if (composantsToSave) {
        supabase.from('produits').update({ composants: composantsToSave as any }).eq('id', newId).then(({ error }) => {
          if (error) console.error('Erreur sauvegarde composants nouveau produit:', error);
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

  // Auto-save produit en temps réel
  const autoSaveProdRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!editing || !dialogOpen) return;
    clearTimeout(autoSaveProdRef.current);
    autoSaveProdRef.current = setTimeout(() => {
      if (form.reference.trim() && form.description.trim()) {
        const composantsValides = composants.filter(c => c.produitId && c.produitId !== '');
        updateProduits(prev => prev.map(p => p.id === editing.id ? { ...p, ...form, composants: composantsValides.length > 0 ? composantsValides : undefined } : p));
      }
    }, 500);
    return () => clearTimeout(autoSaveProdRef.current);
  }, [form, composants, editing, dialogOpen]);

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
    <div className="space-y-4">
      {fromDevis && (
        <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-lg px-4 py-3">
          <Button variant="outline" size="sm" onClick={() => { setFromDevis(false); navigate(returnDevisId ? `/devis?editDevis=${returnDevisId}` : '/devis'); }}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Retour au devis
          </Button>
          <span className="text-sm text-muted-foreground">Vous consultez la fiche produit depuis l'édition d'un devis</span>
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2 shrink-0">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
          {selected.size > 0 && (
            <Button variant="destructive" size="sm" onClick={removeSelected}>
              <Trash2 className="w-4 h-4 mr-2" /> Supprimer {selected.size} sélectionné(s)
            </Button>
          )}
          {produits.length > 0 && selected.size === 0 && (
            <Button variant="destructive" size="sm" onClick={() => { toggleAll(); }}>
              <Trash2 className="w-4 h-4 mr-2" /> Tout sélectionner
            </Button>
          )}
          <Button variant={showFilters ? "secondary" : "outline"} size="sm" onClick={() => { setShowFilters(!showFilters); if (showFilters) setColumnFilters({}); }}>
            <Filter className="w-4 h-4 mr-2" /> Filtres
          </Button>
          {/* Sélecteur de colonnes */}
          <div className="relative" ref={colChooserRef}>
            <Button variant="outline" size="sm" onClick={() => setColChooserOpen(v => !v)}>
              <Columns2 className="w-4 h-4 mr-2" /> Colonnes
            </Button>
            {colChooserOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-xl p-3 min-w-[190px]">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Colonnes visibles</p>
                {COLUMNS.map(col => (
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
                  Réinitialiser
                </button>
              </div>
            )}
          </div>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4 mr-2" /> Importer</Button>
          <Button variant="outline" onClick={() => exportToExcel(produits.map(p => ({ Référence: p.reference, Description: p.description, 'Prix Achat': p.prixAchat, Coefficient: p.coefficient, 'Prix HT': p.prixHT, 'Coeff Revendeur': p.coeffRevendeur, 'Remise Revendeur %': p.remiseRevendeur, 'Prix Revendeur': p.prixRevendeur, 'TVA %': p.tva, Unité: p.unite, 'Poids (kg)': p.poids || '', 'Consommation (kg/m²)': p.consommation || '', Stock: p.stock, 'Stock Min': p.stockMin, Catégorie: p.categorie || '', Fournisseur: fournisseurs.find(f => f.id === p.fournisseurId)?.societe || '' })), 'produits', 'Produits')}><Download className="w-4 h-4 mr-2" /> Exporter</Button>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Nouveau produit</Button>
        </div>
      </div>

      <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-3 w-8">
                  <input type="checkbox" checked={sortedFiltered.length > 0 && selected.size === sortedFiltered.length} onChange={toggleAll} className="rounded border-input" />
                </th>
                {COLUMNS.filter(c => visibleCols.has(c.key)).map(col => {
                  const isSorted = sortCol === col.key;
                  const SortIcon = isSorted ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
                  return (
                    <th
                      key={col.key}
                      className={`px-3 py-3 font-medium text-muted-foreground select-none cursor-pointer hover:text-foreground whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                      onClick={() => handleSort(col.key)}
                    >
                      <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                        {col.align === 'right' && <SortIcon className={`w-3 h-3 shrink-0 ${isSorted ? 'text-primary' : 'opacity-40'}`} />}
                        <span>{col.label}</span>
                        {col.align === 'left' && <SortIcon className={`w-3 h-3 shrink-0 ${isSorted ? 'text-primary' : 'opacity-40'}`} />}
                      </div>
                    </th>
                  );
                })}
                <th className="px-3 py-3"></th>
              </tr>
              {showFilters && (
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-1"></th>
                  {COLUMNS.filter(c => visibleCols.has(c.key)).map(col => (
                    <th key={col.key} className="px-3 py-1">
                      <Input
                        placeholder="Filtrer..."
                        value={columnFilters[col.key] || ''}
                        onChange={e => setColumnFilters(prev => ({ ...prev, [col.key]: e.target.value }))}
                        className={`h-7 text-xs ${col.align === 'right' ? 'text-right' : ''}`}
                      />
                    </th>
                  ))}
                  <th className="px-3 py-1">
                    {Object.values(columnFilters).some(v => v) && (
                      <button onClick={() => setColumnFilters({})} className="p-1 rounded hover:bg-muted" title="Effacer les filtres">
                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </th>
                </tr>
              )}
            </thead>
            <tbody>
              {sortedFiltered.map(p => {
                const pfs = produitFournisseurs.filter(pf => pf.produitId === p.id);
                const prioFourn = calculerFournisseurPrioritaire(p.id, Math.max(1, p.stockMin - p.stock), produitFournisseurs, fournisseurs);
                const prioFournName = prioFourn ? fournisseurs.find(f => f.id === prioFourn.fournisseurId)?.societe : null;
                const isCompose = !!(p.composants && p.composants.length > 0);
                const prioFournObj = prioFourn ? fournisseurs.find(f => f.id === prioFourn.fournisseurId) : null;
                const renderCell = (key: ColKey) => {
                  switch (key) {
                    case 'reference':    return <td className="px-3 py-3 font-mono text-xs">{p.reference}{isCompose && <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-sans">Composé</span>}</td>;
                    case 'description':  return <td className="px-3 py-3 font-medium">{p.description}</td>;
                    case 'categorie':    return <td className="px-3 py-3 text-muted-foreground">{p.categorie || '—'}</td>;
                    case 'fournisseur':  return <td className="px-3 py-3 text-muted-foreground">{prioFournObj?.societe || prioFournObj?.nom || '—'}{pfs.length > 1 && <span className="ml-1 text-xs text-muted-foreground/60">+{pfs.length - 1}</span>}</td>;
                    case 'prixAchat':    return <td className="px-3 py-3 text-right">{formatMontant(p.prixAchat)}</td>;
                    case 'coefficient':  return <td className="px-3 py-3 text-right font-mono">{p.coefficient.toFixed(2)}</td>;
                    case 'prixRevendeur':return <td className="px-3 py-3 text-right font-semibold">{formatMontant(p.prixRevendeur)}<span className="block text-xs text-muted-foreground">{formatMontant(calcMargeBrute(p.prixRevendeur, p.prixAchat))} ({calcTauxMarque(p.prixRevendeur, p.prixAchat).toFixed(0)}%)</span></td>;
                    case 'prixHT':       return <td className="px-3 py-3 text-right text-muted-foreground">{formatMontant(p.prixHT)}<span className="block text-xs">{formatMontant(calcMargeBrute(p.prixHT, p.prixAchat))} ({calcTauxMarque(p.prixHT, p.prixAchat).toFixed(0)}%)</span></td>;
                    case 'poids':        return <td className="px-3 py-3 text-right">{p.poids ? `${p.poids} kg` : '—'}</td>;
                    case 'consommation': return <td className="px-3 py-3 text-right">{p.consommation ? `${p.consommation}` : '—'}</td>;
                    case 'tva':          return <td className="px-3 py-3 text-right">{p.tva}%</td>;
                    case 'stock':        return <td className={`px-3 py-3 text-right font-medium ${p.stock < p.stockMin ? 'text-warning' : ''}`}>{p.stock}{pfs.length > 0 && <span className="block text-xs text-muted-foreground">{prioFournName ? `⭐ ${prioFournName}` : `${pfs.length} fourn.`}</span>}</td>;
                    default:             return <td />;
                  }
                };
                return (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer" onClick={e => { if ((e.target as HTMLElement).closest('input, button')) return; openEdit(p); }}>
                    <td className="px-3 py-3"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded border-input" /></td>
                    {COLUMNS.filter(c => visibleCols.has(c.key)).map(col => (
                      <Fragment key={col.key}>{renderCell(col.key)}</Fragment>
                    ))}
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded-md hover:bg-muted" title="Modifier"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => duplicate(p)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground" title="Dupliquer"><Copy className="w-4 h-4" /></button>
                        <button onClick={() => remove(p.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <p className="text-center py-8 text-muted-foreground">Aucun produit</p>}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {sortedFiltered.map(p => {
          const marge = calcMargeBrute(p.prixHT, p.prixAchat);
          const tauxMarge = calcTauxMarge(p.prixHT, p.prixAchat);
          return (
            <div key={p.id} className="bg-card rounded-xl border border-border p-4 cursor-pointer" onClick={e => { if ((e.target as HTMLElement).closest('input, button')) return; openEdit(p); }}>
              <div className="flex justify-between items-start">
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded border-input mt-1" />
                  <div>
                    <p className="font-medium">{p.description}{p.composants && p.composants.length > 0 && <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Composé</span>}</p>
                    <p className="text-xs text-muted-foreground font-mono">{p.reference}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded-md hover:bg-muted" title="Modifier"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => duplicate(p)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground" title="Dupliquer"><Copy className="w-4 h-4" /></button>
                  <button onClick={() => remove(p.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-sm">
                <span className="text-muted-foreground">P. Achat:</span>
                <span className="text-right">{formatMontant(p.prixAchat)}</span>
                <span className="text-muted-foreground">Coeff × {p.coefficient.toFixed(2)}</span>
                <span className="text-right font-semibold">{formatMontant(p.prixHT)}</span>
                <span className="text-muted-foreground">Marge brute:</span>
                <span className={`text-right ${marge > 0 ? 'text-emerald-600' : 'text-destructive'}`}>{formatMontant(marge)} ({calcTauxMarque(p.prixHT, p.prixAchat).toFixed(0)}% marge)</span>
                <span className="text-muted-foreground">P. Revendeur:</span>
                <span className="text-right">{formatMontant(p.prixRevendeur)} <span className="text-xs">(coeff pub. {calcCoeffPublic(p.prixHT, p.prixAchat).toFixed(2)} · {calcTauxMarque(p.prixRevendeur, p.prixAchat).toFixed(0)}% marge)</span></span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{p.categorie || '—'}</span>
                <span className={p.stock <= p.stockMin ? 'text-warning font-medium' : 'text-muted-foreground'}>Stock: {p.stock}</span>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-full max-w-[98vw] sm:max-w-xl md:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Modifier' : 'Nouveau produit'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Référence *</Label><Input value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} /></div>
              <div><Label>Catégorie</Label><Input value={form.categorie} onChange={e => setForm(p => ({ ...p, categorie: e.target.value }))} /></div>
            </div>
            <div><Label>Description *</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div><Label>Description détaillée</Label><Input value={form.descriptionDetaillee} onChange={e => setForm(p => ({ ...p, descriptionDetaillee: e.target.value }))} placeholder="Affiché dans le devis si renseigné" /></div>

            {/* Tarif — revendeur par défaut, public en option */}
            <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Tarif</p>
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
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Prix Achat *{composants.length > 0 && <span className="ml-1 text-primary font-normal">(calculé)</span>}</Label>
                  {composants.length > 0
                    ? <Input value={formatMontant(form.prixAchat)} readOnly className="bg-muted font-semibold" />
                    : <Input type="number" step="0.01" value={form.prixAchat} onChange={e => updateFormPrix({ prixAchat: parseFloat(e.target.value) || 0 })} />
                  }
                </div>
                <div>
                  <Label className="text-xs">Coefficient</Label>
                  <Input type="number" step="0.01" value={form.coefficient} onChange={e => updateFormPrix({ coefficient: parseFloat(e.target.value) || 1 })} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">Prix Revendeur HT</Label>
                  <Input value={formatMontant(form.prixRevendeur)} readOnly className="bg-muted font-semibold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Marge brute revend.</Label>
                  <Input value={formatMontant(calcMargeBrute(form.prixRevendeur, form.prixAchat))} readOnly className="bg-muted" />
                </div>
                <div>
                  <Label className="text-xs">Marge %</Label>
                  <Input value={`${calcTauxMarque(form.prixRevendeur, form.prixAchat).toFixed(1)}%`} readOnly className="bg-muted" />
                </div>
              </div>

              {/* Tarif Public — masqué par défaut */}
              {showPrixPublic && (
                <>
                  <div className="border-t border-border pt-3 mt-1">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Tarif Public (déduit via remise)</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Remise revendeur %</Label>
                        <Input type="number" step="1" value={form.remiseRevendeur} onChange={e => updateFormPrix({ remiseRevendeur: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div>
                        <Label className="text-xs">Coeff. public</Label>
                        <Input value={calcCoeffPublic(form.prixHT, form.prixAchat).toFixed(2)} readOnly className="bg-muted" />
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <Label className="text-xs">Prix Vente HT (public)</Label>
                        <Input value={formatMontant(form.prixHT)} readOnly className="bg-muted font-semibold" />
                      </div>
                    </div>
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
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div><Label>TVA %</Label><Input type="number" value={form.tva} onChange={e => setForm(p => ({ ...p, tva: parseFloat(e.target.value) || 20 }))} /></div>
              <div><Label>Unité</Label><Input value={form.unite} onChange={e => setForm(p => ({ ...p, unite: e.target.value }))} /></div>
              <div><Label>Poids (kg)</Label><Input type="number" step="0.01" value={form.poids || ''} onChange={e => setForm(p => ({ ...p, poids: parseFloat(e.target.value) || 0 }))} /></div>
              <div><Label>Conso. (kg/m²)</Label><Input type="number" step="0.01" value={form.consommation || ''} onChange={e => setForm(p => ({ ...p, consommation: parseFloat(e.target.value) || 0 }))} placeholder="Ex: 1.5" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Stock</Label><Input type="number" value={form.stock} onChange={e => setForm(p => ({ ...p, stock: parseInt(e.target.value) || 0 }))} /></div>
              <div><Label>Stock minimum</Label><Input type="number" value={form.stockMin} onChange={e => setForm(p => ({ ...p, stockMin: parseInt(e.target.value) || 0 }))} /></div>
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
                function prixComposant(c: typeof composants[0]) {
                  const p = produits.find(pr => pr.id === c.produitId);
                  if (!p) return 0;
                  // En mode % : coût = pct% du prix unitaire (ex: 28% d'un sac à 8,92€ = 2,50€)
                  if (c.consommationPct != null) return p.prixAchat * c.consommationPct / 100;
                  return p.prixAchat * c.quantite;
                }
                function recalcPrix(updated: typeof composants) {
                  const total = updated.reduce((sum, c) => sum + prixComposant(c), 0);
                  if (total > 0) updateFormPrix({ prixAchat: Math.round(total * 100) / 100 });
                }
                // Propage les modifications de quantité aux composants en mode %
                // Formule : pct/100 × quantite_base (kg/m²)
                function calcQtyPct(pct: number, baseComp: typeof composants[0]) {
                  return Math.round(baseComp.quantite * pct / 100 * 10000) / 10000 || 0.0001;
                }
                function propagatePct(updated: typeof composants) {
                  return updated.map(c => {
                    if (c.consommationPct != null) {
                      // Priorité : composant lié → sinon baseQuantite manuelle
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
                  const modePercent = comp.consommationPct != null;
                  const availableProduits = produits
                    .filter(p => (!editing || p.id !== editing.id) && !composants.some((c, i) => i !== idx && c.produitId === p.id))
                    .filter(p => !search || `${p.reference} ${p.description}`.toLowerCase().includes(search.toLowerCase()))
                    .sort((a, b) => a.reference.localeCompare(b.reference));
                  // Composants disponibles comme base pour le % (tous sauf soi-même, avec un produit sélectionné)
                  const basesDisponibles = composants.filter((c, i) => i !== idx && c.produitId);

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
                            <p className="text-xs text-primary mt-0.5 truncate">{compProd.reference} — {compProd.description}</p>
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

                        {/* Quantité fixe ou calculée en % */}
                        {modePercent ? (
                          <div className="flex items-center gap-1 shrink-0 flex-wrap">
                            {/* Pourcentage */}
                            <Input
                              type="number" min={0.01} max={100} step={0.1}
                              value={comp.consommationPct ?? ''}
                              onChange={e => {
                                const pct = parseFloat(e.target.value) || 0;
                                const baseQty = comp.baseComposantId
                                  ? (composants.find(c => c.produitId === comp.baseComposantId)?.quantite ?? comp.baseQuantite ?? 0)
                                  : (comp.baseQuantite ?? 0);
                                const newQty = baseQty > 0 ? Math.round(baseQty * pct / 100 * 10000) / 10000 || 0.0001 : comp.quantite;
                                const updated = [...composants];
                                updated[idx] = { ...updated[idx], consommationPct: pct, quantite: newQty };
                                setComposants(updated);
                                recalcPrix(updated);
                              }}
                              className="w-16 text-sm"
                              placeholder="%"
                            />
                            <span className="text-xs text-muted-foreground">% ×</span>
                            {/* Base : saisie manuelle */}
                            <Input
                              type="number" min={0.001} step={0.001}
                              value={comp.baseQuantite ?? ''}
                              onChange={e => {
                                const baseQty = parseFloat(e.target.value) || 0;
                                const pct = comp.consommationPct ?? 0;
                                const newQty = baseQty > 0 && pct > 0 ? Math.round(baseQty * pct / 100 * 10000) / 10000 || 0.0001 : comp.quantite;
                                const updated = [...composants];
                                updated[idx] = { ...updated[idx], baseQuantite: baseQty, baseComposantId: '', quantite: newQty };
                                setComposants(updated);
                                recalcPrix(updated);
                              }}
                              className="w-20 text-sm"
                              placeholder="base"
                            />
                            {/* Lier à un autre composant (optionnel) */}
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
                                className="text-xs border border-border rounded px-1.5 py-1 bg-background text-foreground max-w-[110px]"
                                title="Lier à un autre composant (synchronise la base automatiquement)"
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
                          <div className="flex items-center gap-1 shrink-0">
                            <Input
                              type="number" min={0.01} step={0.01}
                              value={comp.quantite}
                              onChange={e => {
                                const updated = [...composants];
                                updated[idx] = { ...updated[idx], quantite: parseFloat(e.target.value) || 1 };
                                const propagated = propagatePct(updated);
                                setComposants(propagated);
                                recalcPrix(propagated);
                              }}
                              className="w-20 text-sm"
                              placeholder="Qté"
                            />
                            <button type="button" title="Définir en % d'un autre composant"
                              onClick={() => {
                                const updated = [...composants];
                                updated[idx] = { ...updated[idx], consommationPct: 10, baseComposantId: '' };
                                setComposants(updated);
                              }}
                              className="text-xs px-1.5 py-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary"
                            >%</button>
                          </div>
                        )}

                        <span className="text-xs text-muted-foreground w-16 shrink-0 text-right pt-2">
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
                    return sum + (c.consommationPct != null ? p.prixAchat * c.consommationPct / 100 : p.prixAchat * c.quantite);
                  }, 0))}</span>
                </div>
              )}
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

            {editing && (
              composants.length > 0 ? (
                <div className="border border-border rounded-lg p-3 bg-muted/20 text-xs text-muted-foreground flex items-start gap-2">
                  <span className="text-base leading-none">ℹ️</span>
                  <span>Produit composé — les fournisseurs et prix achat sont gérés au niveau de chaque composant.</span>
                </div>
              ) : (
                <ProduitFournisseursPanel produitId={editing.id} qteCommande={Math.max(1, form.stockMin - form.stock)} />
              )
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              {fromDevis && editing && (
                <Button variant="secondary" onClick={() => save(true)}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Enregistrer & retour au devis
                </Button>
              )}
              <Button onClick={() => save(false)}>{editing ? 'Modifier' : 'Ajouter'}</Button>
            </div>
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
