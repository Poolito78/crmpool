import { useState } from 'react';
import { useCRM } from '@/lib/StoreContext';
import { generateId, formatMontant, type Produit } from '@/lib/store';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const emptyProduit = {
  reference: '', nom: '', description: '', prixAchat: 0, coefficient: 2, prixHT: 0, coeffRevendeur: 1.6, remiseRevendeur: 30, prixRevendeur: 0, tva: 20, unite: 'pièce', stock: 0, stockMin: 0, fournisseurId: '', categorie: ''
};

function calcPrixVente(prixAchat: number, coeff: number) {
  return Math.round(prixAchat * coeff * 100) / 100;
}
function calcPrixRevendeur(prixAchat: number, coeffRevendeur: number) {
  return Math.round(prixAchat * coeffRevendeur * 100) / 100;
}
function calcMargeBrute(prixVente: number, prixAchat: number) {
  return prixVente - prixAchat;
}
function calcTauxMarge(prixVente: number, prixAchat: number) {
  if (prixAchat === 0) return 0;
  return ((prixVente - prixAchat) / prixAchat) * 100;
}

export default function Produits() {
  const { produits, updateProduits, fournisseurs } = useCRM();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Produit | null>(null);
  const [form, setForm] = useState(emptyProduit);

  // Ensure old products without new fields get defaults
  const safeProduits = produits.map(p => ({
    ...p,
    prixAchat: p.prixAchat ?? 0,
    coefficient: p.coefficient ?? (p.prixAchat ? p.prixHT / p.prixAchat : 1),
    coeffRevendeur: p.coeffRevendeur ?? 1.6,
    remiseRevendeur: p.remiseRevendeur ?? 30,
    prixRevendeur: p.prixRevendeur ?? 0,
  }));

  const filtered = safeProduits.filter(p =>
    [p.nom, p.reference, p.categorie].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  function openNew() { setEditing(null); setForm(emptyProduit); setDialogOpen(true); }
  function openEdit(p: Produit) {
    setEditing(p);
    setForm({ reference: p.reference, nom: p.nom, description: p.description || '', prixAchat: p.prixAchat, coefficient: p.coefficient, prixHT: p.prixHT, coeffRevendeur: p.coeffRevendeur, remiseRevendeur: p.remiseRevendeur, prixRevendeur: p.prixRevendeur, tva: p.tva, unite: p.unite, stock: p.stock, stockMin: p.stockMin, fournisseurId: p.fournisseurId || '', categorie: p.categorie || '' });
    setDialogOpen(true);
  }

  function updateFormPrix(updates: Partial<typeof form>) {
    setForm(prev => {
      const next = { ...prev, ...updates };
      // Recalculate derived prices
      next.prixHT = calcPrixVente(next.prixAchat, next.coefficient);
      next.prixRevendeur = calcPrixRevendeur(next.prixAchat, next.coeffRevendeur);
      return next;
    });
  }

  function save() {
    if (!form.nom.trim() || !form.reference.trim()) { toast.error('Référence et nom requis'); return; }
    if (editing) {
      updateProduits(prev => prev.map(p => p.id === editing.id ? { ...p, ...form } : p));
      toast.success('Produit modifié');
    } else {
      updateProduits(prev => [...prev, { ...form, id: generateId(), dateCreation: new Date().toISOString().split('T')[0] }]);
      toast.success('Produit ajouté');
    }
    setDialogOpen(false);
  }

  function remove(id: string) {
    updateProduits(prev => prev.filter(p => p.id !== id));
    toast.success('Produit supprimé');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={openNew} className="shrink-0"><Plus className="w-4 h-4 mr-2" /> Nouveau produit</Button>
      </div>

      <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
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
                    <td className="px-3 py-3 font-mono text-xs">{p.reference}</td>
                    <td className="px-3 py-3 font-medium">{p.nom}</td>
                    <td className="px-3 py-3 text-muted-foreground">{p.categorie || '—'}</td>
                    <td className="px-3 py-3 text-right">{formatMontant(p.prixAchat)}</td>
                    <td className="px-3 py-3 text-right font-mono">{p.coefficient.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right font-semibold">{formatMontant(p.prixHT)}</td>
                    <td className="px-3 py-3 text-right">
                      <span className={marge > 0 ? 'text-emerald-600' : 'text-destructive'}>
                        {formatMontant(marge)} <span className="text-xs text-muted-foreground">({tauxMarge.toFixed(0)}%)</span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-muted-foreground">{formatMontant(p.prixRevendeur)}</td>
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
                <div>
                  <p className="font-medium">{p.nom}</p>
                  <p className="text-xs text-muted-foreground font-mono">{p.reference}</p>
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
                <span className={`text-right ${marge > 0 ? 'text-emerald-600' : 'text-destructive'}`}>{formatMontant(marge)} ({tauxMarge.toFixed(0)}%)</span>
                <span className="text-muted-foreground">P. Revendeur:</span>
                <span className="text-right">{formatMontant(p.prixRevendeur)}</span>
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
                  <Label className="text-xs">Taux marge</Label>
                  <Input value={`${calcTauxMarge(form.prixHT, form.prixAchat).toFixed(1)}%`} readOnly className="bg-muted" />
                </div>
                <div>
                  <Label className="text-xs">TVA (%)</Label>
                  <Input type="number" value={form.tva} onChange={e => setForm(p => ({ ...p, tva: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Prix Revendeur (remise {form.remiseRevendeur}%)</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Coeff. Revendeur</Label>
                    <Input type="number" step="0.01" value={form.coeffRevendeur} onChange={e => updateFormPrix({ coeffRevendeur: parseFloat(e.target.value) || 1 })} />
                  </div>
                  <div>
                    <Label className="text-xs">Remise (%)</Label>
                    <Input type="number" value={form.remiseRevendeur} onChange={e => setForm(p => ({ ...p, remiseRevendeur: parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Prix Revendeur</Label>
                    <Input value={formatMontant(form.prixRevendeur)} readOnly className="bg-muted font-semibold" />
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
    </div>
  );
}
