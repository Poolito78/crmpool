import { useState, useRef, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useCRM } from '@/lib/StoreContext';
import { generateId, formatMontant, type Produit } from '@/lib/store';
import { Plus, Search, Edit2, Trash2, Upload, ArrowLeft, Filter, X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { exportToExcel } from '@/lib/exportExcel';

const emptyProduit = {
  reference: '', description: '', descriptionDetaillee: '', prixAchat: 0, coefficient: 1.6, prixHT: 0, coeffRevendeur: 1.6, remiseRevendeur: 30, prixRevendeur: 0, tva: 20, unite: 'pièce', poids: 0, stock: 0, stockMin: 0, fournisseurId: '', categorie: ''
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
  const { produits, updateProduits, fournisseurs, devis, updateDevis } = useCRM();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
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
    const safe = produits.map(p => {
      const prixAchat = p.prixAchat ?? 0;
      const remise = 30; // Force 30%
      const prixRevendeur = p.prixRevendeur ?? 0;
      const coefficient = prixAchat > 0 && prixRevendeur > 0
        ? prixRevendeur / prixAchat
        : (p.coefficient ?? 1.6);
      const recalcRevendeur = calcPrixRevendeurFromCoeff(prixAchat, coefficient);
      const recalcPublic = calcPrixPublicFromRevendeur(recalcRevendeur, remise);
      if (p.remiseRevendeur !== 30 || p.prixHT !== recalcPublic) needsUpdate = true;
      return {
        ...p,
        prixAchat,
        coefficient,
        coeffRevendeur: coefficient,
        remiseRevendeur: remise,
        prixRevendeur: recalcRevendeur,
        prixHT: recalcPublic,
      };
    });
    // Persist the fix
    if (needsUpdate) {
      setTimeout(() => updateProduits(() => safe), 0);
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
        case 'reference': if (!p.reference?.toLowerCase().includes(v)) return false; break;
        case 'description': if (!p.description?.toLowerCase().includes(v)) return false; break;
        case 'categorie': if (!p.categorie?.toLowerCase().includes(v)) return false; break;
        case 'prixAchat': if (!formatMontant(p.prixAchat).toLowerCase().includes(v) && !String(p.prixAchat).includes(v)) return false; break;
        case 'coefficient': if (!String(p.coefficient.toFixed(2)).includes(v)) return false; break;
        case 'prixHT': if (!formatMontant(p.prixHT).toLowerCase().includes(v) && !String(p.prixHT).includes(v)) return false; break;
        case 'prixRevendeur': if (!formatMontant(p.prixRevendeur).toLowerCase().includes(v) && !String(p.prixRevendeur).includes(v)) return false; break;
        case 'stock': if (!String(p.stock).includes(v)) return false; break;
      }
    }
    return true;
  });

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  
  const toggleAll = () => {
    setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(p => p.id)));
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

  function openNew() { setEditing(null); setForm(emptyProduit); setDialogOpen(true); }
  function openEdit(p: Produit) {
    setEditing(p);
    setForm({ reference: p.reference, description: p.description, descriptionDetaillee: p.descriptionDetaillee || '', prixAchat: p.prixAchat, coefficient: p.coefficient, prixHT: p.prixHT, coeffRevendeur: p.coeffRevendeur, remiseRevendeur: p.remiseRevendeur, prixRevendeur: p.prixRevendeur, tva: p.tva, unite: p.unite, poids: p.poids || 0, stock: p.stock, stockMin: p.stockMin, fournisseurId: p.fournisseurId || '', categorie: p.categorie || '' });
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
    if (editing) {
      updateProduits(prev => prev.map(p => p.id === editing.id ? { ...p, ...form } : p));
      // Répercuter les modifications dans les lignes de devis liées
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
      updateProduits(prev => [...prev, { ...form, id: generateId(), dateCreation: new Date().toISOString().split('T')[0] }]);
      toast.success('Produit ajouté');
    }
    setDialogOpen(false);
    if (andReturnToDevis && fromDevis) {
      setFromDevis(false);
      navigate(returnDevisId ? `/devis?editDevis=${returnDevisId}` : '/devis');
    }
  }

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
    { key: 'stock', label: 'Stock', aliases: ['stock'], type: 'number' },
    { key: 'stockMin', label: 'Stock min', aliases: ['stock min', 'stockmin', 'stock minimum'], type: 'number' },
    { key: 'categorie', label: 'Catégorie', aliases: ['catégorie', 'categorie', 'famille'], type: 'text' },
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

    if (importMode === 'update') {
      let updated = 0;
      updateProduits(prev => prev.map(p => {
        const matchingRow = importPreview.find(row => {
          const ref = getMappedValue(row, 'reference');
          return ref.toLowerCase() === p.reference.trim().toLowerCase();
        });
        if (!matchingRow) return p;

        const updates: Record<string, any> = {};
        for (const field of selectedFields) {
          if (field.key === 'reference') continue;
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
        return {
          id: generateId(),
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
          fournisseurId: '',
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

      updateProduits(prev => [...prev, ...unique]);
      toast.success(`${unique.length} produit(s) importé(s)${skipped > 0 ? `, ${skipped} doublon(s) ignoré(s)` : ''}`);
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
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4 mr-2" /> Importer</Button>
          <Button variant="outline" onClick={() => exportToExcel(produits.map(p => ({ Référence: p.reference, Description: p.description, 'Prix Achat': p.prixAchat, Coefficient: p.coefficient, 'Prix HT': p.prixHT, 'Coeff Revendeur': p.coeffRevendeur, 'Remise Revendeur %': p.remiseRevendeur, 'Prix Revendeur': p.prixRevendeur, 'TVA %': p.tva, Unité: p.unite, Poids: p.poids || '', Stock: p.stock, 'Stock Min': p.stockMin, Catégorie: p.categorie || '', Fournisseur: fournisseurs.find(f => f.id === p.fournisseurId)?.societe || '' })), 'produits', 'Produits')}><Download className="w-4 h-4 mr-2" /> Exporter</Button>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Nouveau produit</Button>
        </div>
      </div>

      <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-3 w-8"><input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} className="rounded border-input" /></th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">Réf.</th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">Description</th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">Catégorie</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground">P. Achat</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground">Coeff.</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground">P. Revend.</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground">P. Public HT</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground">Stock</th>
                <th className="px-3 py-3"></th>
              </tr>
              {showFilters && (
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-1"></th>
                  {[
                    { key: 'reference', align: 'left' },
                    { key: 'description', align: 'left' },
                    { key: 'categorie', align: 'left' },
                    { key: 'prixAchat', align: 'right' },
                    { key: 'coefficient', align: 'right' },
                    { key: 'prixRevendeur', align: 'right' },
                    { key: 'prixHT', align: 'right' },
                    { key: 'stock', align: 'right' },
                  ].map(col => (
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
              {filtered.map(p => {
                const marge = calcMargeBrute(p.prixHT, p.prixAchat);
                const tauxMarge = calcTauxMarge(p.prixHT, p.prixAchat);
                return (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-3"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded border-input" /></td>
                    <td className="px-3 py-3 font-mono text-xs">{p.reference}</td>
                    <td className="px-3 py-3 font-medium">{p.description}</td>
                    <td className="px-3 py-3 text-muted-foreground">{p.categorie || '—'}</td>
                    <td className="px-3 py-3 text-right">{formatMontant(p.prixAchat)}</td>
                    <td className="px-3 py-3 text-right font-mono">{p.coefficient.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {formatMontant(p.prixRevendeur)}
                      <span className="block text-xs text-muted-foreground">
                        {formatMontant(calcMargeBrute(p.prixRevendeur, p.prixAchat))} ({calcTauxMarque(p.prixRevendeur, p.prixAchat).toFixed(0)}% marge)
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-muted-foreground">
                      {formatMontant(p.prixHT)}
                      <span className="block text-xs text-muted-foreground">
                        {formatMontant(calcMargeBrute(p.prixHT, p.prixAchat))} ({calcTauxMarque(p.prixHT, p.prixAchat).toFixed(0)}% marge)
                      </span>
                    </td>
                    <td className={`px-3 py-3 text-right font-medium ${p.stock <= p.stockMin ? 'text-warning' : ''}`}>{p.stock}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded-md hover:bg-muted"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => remove(p.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
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
        {filtered.map(p => {
          const marge = calcMargeBrute(p.prixHT, p.prixAchat);
          const tauxMarge = calcTauxMarge(p.prixHT, p.prixAchat);
          return (
            <div key={p.id} className="bg-card rounded-xl border border-border p-4">
              <div className="flex justify-between items-start">
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded border-input mt-1" />
                  <div>
                    <p className="font-medium">{p.description}</p>
                    <p className="text-xs text-muted-foreground font-mono">{p.reference}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded-md hover:bg-muted"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => remove(p.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Modifier' : 'Nouveau produit'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Référence *</Label><Input value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} /></div>
              <div><Label>Catégorie</Label><Input value={form.categorie} onChange={e => setForm(p => ({ ...p, categorie: e.target.value }))} /></div>
            </div>
            <div><Label>Description *</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div><Label>Description détaillée</Label><Input value={form.descriptionDetaillee} onChange={e => setForm(p => ({ ...p, descriptionDetaillee: e.target.value }))} placeholder="Affiché dans le devis si renseigné" /></div>

            {/* Tarif Revendeur - coefficient pilote */}
            <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
              <p className="text-sm font-semibold text-foreground">Tarif Revendeur (coefficient)</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Prix Achat *</Label>
                  <Input type="number" step="0.01" value={form.prixAchat} onChange={e => updateFormPrix({ prixAchat: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label className="text-xs">Coefficient</Label>
                  <Input type="number" step="0.01" value={form.coefficient} onChange={e => updateFormPrix({ coefficient: parseFloat(e.target.value) || 1 })} />
                </div>
                <div>
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
            </div>

            {/* Prix public déduit de la remise */}
            <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
              <p className="text-sm font-semibold text-foreground">Tarif Public (déduit via remise)</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Remise revendeur %</Label>
                  <Input type="number" step="1" value={form.remiseRevendeur} onChange={e => updateFormPrix({ remiseRevendeur: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label className="text-xs">Coeff. public</Label>
                  <Input value={calcCoeffPublic(form.prixHT, form.prixAchat).toFixed(2)} readOnly className="bg-muted" />
                </div>
                <div>
                  <Label className="text-xs">Prix Vente HT (public)</Label>
                  <Input value={formatMontant(form.prixHT)} readOnly className="bg-muted font-semibold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
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

            <div className="grid grid-cols-4 gap-4">
              <div><Label>TVA %</Label><Input type="number" value={form.tva} onChange={e => setForm(p => ({ ...p, tva: parseFloat(e.target.value) || 20 }))} /></div>
              <div><Label>Unité</Label><Input value={form.unite} onChange={e => setForm(p => ({ ...p, unite: e.target.value }))} /></div>
              <div><Label>Poids (kg)</Label><Input type="number" step="0.01" value={form.poids || ''} onChange={e => setForm(p => ({ ...p, poids: parseFloat(e.target.value) || 0 }))} /></div>
              <div><Label>Stock</Label><Input type="number" value={form.stock} onChange={e => setForm(p => ({ ...p, stock: parseInt(e.target.value) || 0 }))} /></div>
            </div>
            <div><Label>Stock minimum</Label><Input type="number" value={form.stockMin} onChange={e => setForm(p => ({ ...p, stockMin: parseInt(e.target.value) || 0 }))} /></div>

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
