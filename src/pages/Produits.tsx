import { useState, useRef } from 'react';
import { useCRM } from '@/lib/StoreContext';
import { generateId, formatMontant, type Produit } from '@/lib/store';
import { Plus, Search, Edit2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const emptyProduit = {
  reference: '', nom: '', description: '', prixAchat: 0, coefficient: 2, prixHT: 0, coeffRevendeur: 1.6, remiseRevendeur: 30, prixRevendeur: 0, tva: 20, unite: 'pièce', stock: 0, stockMin: 0, fournisseurId: '', categorie: ''
};

function calcPrixVente(prixAchat: number, coeff: number) {
  return Math.round(prixAchat * coeff * 100) / 100;
}
function calcPrixRevendeur(prixVenteHT: number, remise: number) {
  return Math.round(prixVenteHT * (1 - remise / 100) * 100) / 100;
}
function calcCoeffRevendeur(prixRevendeur: number, prixAchat: number) {
  if (prixAchat === 0) return 0;
  return prixRevendeur / prixAchat;
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
  const { produits, updateProduits, fournisseurs } = useCRM();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Produit | null>(null);
  const [form, setForm] = useState(emptyProduit);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null); // null = supprimer plusieurs, else = supprimer un seul

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

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
        setImportDialogOpen(true);
      } catch { toast.error('Erreur de lecture du fichier'); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function importArticles() {
    if (!importPreview) return;

    // Helper: find value by checking multiple possible column names (case-insensitive)
    function findCol(row: any, keys: string[]): string {
      const rowKeys = Object.keys(row);
      for (const k of keys) {
        const found = rowKeys.find(rk => rk.trim().toLowerCase() === k.toLowerCase());
        if (found && row[found] !== undefined && row[found] !== null && String(row[found]).trim() !== '') return String(row[found]).trim();
      }
      return '';
    }
    function findNum(row: any, keys: string[], def = 0): number {
      const val = findCol(row, keys);
      const n = parseFloat(val);
      return isNaN(n) ? def : n;
    }

    const mapped: Produit[] = importPreview.map((row: any) => {
      const prixAchat = findNum(row, ['p achat kg ou u', 'achat kg ou u', 'prix achat', 'prixachat', 'pa', 'prix_achat']);
      const coefficient = findNum(row, ['coefficient', 'coeff'], 2);
      const prixHT = findNum(row, ['prix ht', 'prixht', 'pv ht', 'prix_ht']) || calcPrixVente(prixAchat, coefficient);
      const remiseRevendeur = findNum(row, ['remise revendeur', 'remiserevendeur', 'remise'], 30);
      const prixRevendeur = findNum(row, ['prix revendeur', 'prixrevendeur']) || calcPrixRevendeur(prixHT, remiseRevendeur);
      const coeffRevendeur = calcCoeffRevendeur(prixRevendeur, prixAchat);
      const reference = findCol(row, ['article', 'référence', 'reference', 'ref', 'code article']);
      const nom = findCol(row, ['produit', 'nom', 'désignation', 'designation', 'libellé', 'libelle']);
      return {
        id: generateId(),
        reference,
        nom,
        description: findCol(row, ['description']),
        prixAchat,
        coefficient: prixAchat > 0 && prixHT > 0 ? prixHT / prixAchat : coefficient,
        prixHT,
        coeffRevendeur,
        remiseRevendeur,
        prixRevendeur,
        tva: findNum(row, ['tva'], 20),
        unite: findCol(row, ['unité', 'unite']) || 'pièce',
        stock: findNum(row, ['stock']),
        stockMin: findNum(row, ['stock min', 'stockmin', 'stock minimum']),
        fournisseurId: '',
        categorie: findCol(row, ['catégorie', 'categorie', 'famille']),
        dateCreation: new Date().toISOString().split('T')[0],
      };
    }).filter(p => p.nom || p.reference);

    // Filtrer les doublons par référence (code article)
    const existingRefs = new Set(produits.map(p => p.reference.trim().toLowerCase()));
    const unique = mapped.filter(p => {
      const ref = p.reference.trim().toLowerCase();
      if (!ref) return true; // pas de référence = on importe quand même
      if (existingRefs.has(ref)) return false;
      existingRefs.add(ref);
      return true;
    });
    const skipped = mapped.length - unique.length;

    updateProduits(prev => [...prev, ...unique]);
    toast.success(`${unique.length} produit(s) importé(s)${skipped > 0 ? `, ${skipped} doublon(s) ignoré(s)` : ''}`);
    setImportDialogOpen(false);
    setImportPreview(null);
  }

  return (
    <div className="space-y-4">
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
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4 mr-2" /> Importer Excel</Button>
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
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">Nom</th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">Catégorie</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground">P. Achat</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground">Coeff.</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground">P. Vente HT</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground">Marge</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground">P. Revend.</th>
                <th className="text-right px-3 py-3 font-medium text-muted-foreground">Stock</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const marge = calcMargeBrute(p.prixHT, p.prixAchat);
                const tauxMarge = calcTauxMarge(p.prixHT, p.prixAchat);
                return (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-3"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded border-input" /></td>
                    <td className="px-3 py-3 font-mono text-xs">{p.reference}</td>
                    <td className="px-3 py-3 font-medium">{p.nom}</td>
                    <td className="px-3 py-3 text-muted-foreground">{p.categorie || '—'}</td>
                    <td className="px-3 py-3 text-right">{formatMontant(p.prixAchat)}</td>
                    <td className="px-3 py-3 text-right font-mono">{p.coefficient.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right font-semibold">{formatMontant(p.prixHT)}</td>
                    <td className="px-3 py-3 text-right">
                      <span className={marge > 0 ? 'text-emerald-600' : 'text-destructive'}>
                        {formatMontant(marge)} <span className="text-xs text-muted-foreground">({calcTauxMarque(p.prixHT, p.prixAchat).toFixed(0)}% marque · {calcTauxMarge(p.prixHT, p.prixAchat).toFixed(0)}% marge)</span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-muted-foreground">
                      {formatMontant(p.prixRevendeur)}
                       <span className="block text-xs text-muted-foreground">
                         coeff {calcCoeffRevendeur(p.prixRevendeur, p.prixAchat).toFixed(2)} · {formatMontant(calcMargeBrute(p.prixRevendeur, p.prixAchat))} ({calcTauxMarque(p.prixRevendeur, p.prixAchat).toFixed(0)}% marque · {calcTauxMarge(p.prixRevendeur, p.prixAchat).toFixed(0)}% marge)
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
                    <p className="font-medium">{p.nom}</p>
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
                <span className={`text-right ${marge > 0 ? 'text-emerald-600' : 'text-destructive'}`}>{formatMontant(marge)} ({calcTauxMarque(p.prixHT, p.prixAchat).toFixed(0)}% marque · {calcTauxMarge(p.prixHT, p.prixAchat).toFixed(0)}% marge)</span>
                <span className="text-muted-foreground">P. Revendeur:</span>
                <span className="text-right">{formatMontant(p.prixRevendeur)} <span className="text-xs">(coeff {calcCoeffRevendeur(p.prixRevendeur, p.prixAchat).toFixed(2)} · {calcTauxMarque(p.prixRevendeur, p.prixAchat).toFixed(0)}% marque · {calcTauxMarge(p.prixRevendeur, p.prixAchat).toFixed(0)}% marge)</span></span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{p.categorie || '—'}</span>
                <span className={p.stock <= p.stockMin ? 'text-warning font-medium' : 'text-muted-foreground'}>Stock: {p.stock}</span>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Modifier' : 'Nouveau produit'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Référence *</Label><Input value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} /></div>
              <div><Label>Catégorie</Label><Input value={form.categorie} onChange={e => setForm(p => ({ ...p, categorie: e.target.value }))} /></div>
            </div>
            <div><Label>Nom *</Label><Input value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} /></div>
            <div><Label>Description</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>

            {/* Pricing section */}
            <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
              <p className="text-sm font-semibold text-foreground">Tarification</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Prix Achat (€)</Label>
                  <Input type="number" step="0.01" value={form.prixAchat} onChange={e => updateFormPrix({ prixAchat: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label className="text-xs">Coefficient</Label>
                  <Input type="number" step="0.01" value={form.coefficient} onChange={e => updateFormPrix({ coefficient: parseFloat(e.target.value) || 1 })} />
                </div>
                <div>
                  <Label className="text-xs">Prix Vente HT</Label>
                  <Input value={formatMontant(form.prixHT)} readOnly className="bg-muted font-semibold" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Marge brute</Label>
                  <Input value={formatMontant(calcMargeBrute(form.prixHT, form.prixAchat))} readOnly className="bg-muted text-emerald-600 font-semibold" />
                </div>
                <div>
                   <Label className="text-xs">Taux marque</Label>
                   <Input value={`${calcTauxMarque(form.prixHT, form.prixAchat).toFixed(1)}%`} readOnly className="bg-muted" />
                </div>
                <div>
                   <Label className="text-xs">Taux marge</Label>
                   <Input value={`${calcTauxMarge(form.prixHT, form.prixAchat).toFixed(1)}%`} readOnly className="bg-muted" />
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Prix Revendeur (remise sur prix vente public)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Remise (%)</Label>
                    <Input type="number" value={form.remiseRevendeur} onChange={e => updateFormPrix({ remiseRevendeur: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label className="text-xs">Prix Revendeur HT</Label>
                    <Input value={formatMontant(form.prixRevendeur)} readOnly className="bg-muted font-semibold" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <Label className="text-xs">Coeff. Revendeur</Label>
                    <Input value={form.coeffRevendeur.toFixed(2)} readOnly className="bg-muted" />
                  </div>
                  <div>
                    <Label className="text-xs">Marge brute Revendeur</Label>
                    <Input value={formatMontant(calcMargeBrute(form.prixRevendeur, form.prixAchat))} readOnly className="bg-muted text-emerald-600 font-semibold" />
                  </div>
                </div>
              </div>
            </div>

            <div><Label>Unité</Label><Input value={form.unite} onChange={e => setForm(p => ({ ...p, unite: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Stock</Label><Input type="number" value={form.stock} onChange={e => setForm(p => ({ ...p, stock: parseInt(e.target.value) || 0 }))} /></div>
              <div><Label>Stock min.</Label><Input type="number" value={form.stockMin} onChange={e => setForm(p => ({ ...p, stockMin: parseInt(e.target.value) || 0 }))} /></div>
            </div>
            <div>
              <Label>Fournisseur</Label>
              <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={form.fournisseurId} onChange={e => setForm(p => ({ ...p, fournisseurId: e.target.value }))}>
                <option value="">— Aucun —</option>
                {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.societe}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={save}>{editing ? 'Modifier' : 'Ajouter'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import preview dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Aperçu de l'import ({importPreview?.length || 0} lignes)</DialogTitle></DialogHeader>
          {importPreview && importPreview.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground">Colonnes détectées : {Object.keys(importPreview[0]).join(', ')}</p>
              <div className="overflow-x-auto border border-border rounded-lg max-h-60">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      {Object.keys(importPreview[0]).map(k => <th key={k} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
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
            <Button onClick={importArticles}>Importer {importPreview?.length || 0} produit(s)</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
