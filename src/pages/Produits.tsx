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
  reference: '', nom: '', description: '', prixHT: 0, tva: 20, unite: 'pièce', stock: 0, stockMin: 0, fournisseurId: '', categorie: ''
};

export default function Produits() {
  const { produits, updateProduits, fournisseurs } = useCRM();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Produit | null>(null);
  const [form, setForm] = useState(emptyProduit);

  const filtered = produits.filter(p =>
    [p.nom, p.reference, p.categorie].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  function openNew() { setEditing(null); setForm(emptyProduit); setDialogOpen(true); }
  function openEdit(p: Produit) {
    setEditing(p);
    setForm({ reference: p.reference, nom: p.nom, description: p.description || '', prixHT: p.prixHT, tva: p.tva, unite: p.unite, stock: p.stock, stockMin: p.stockMin, fournisseurId: p.fournisseurId || '', categorie: p.categorie || '' });
    setDialogOpen(true);
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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Réf.</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nom</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Catégorie</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Prix HT</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Stock</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Unité</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono text-xs">{p.reference}</td>
                <td className="px-4 py-3 font-medium">{p.nom}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.categorie || '—'}</td>
                <td className="px-4 py-3 text-right">{formatMontant(p.prixHT)}</td>
                <td className={`px-4 py-3 text-right font-medium ${p.stock <= p.stockMin ? 'text-warning' : ''}`}>{p.stock}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.unite}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-md hover:bg-muted"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => remove(p.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center py-8 text-muted-foreground">Aucun produit</p>}
      </div>

      <div className="md:hidden space-y-3">
        {filtered.map(p => (
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
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{p.categorie || '—'}</span>
              <span className="font-semibold">{formatMontant(p.prixHT)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{p.unite}</span>
              <span className={p.stock <= p.stockMin ? 'text-warning font-medium' : 'text-muted-foreground'}>Stock: {p.stock}</span>
            </div>
          </div>
        ))}
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
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Prix HT (€)</Label><Input type="number" step="0.01" value={form.prixHT} onChange={e => setForm(p => ({ ...p, prixHT: parseFloat(e.target.value) || 0 }))} /></div>
              <div><Label>TVA (%)</Label><Input type="number" value={form.tva} onChange={e => setForm(p => ({ ...p, tva: parseFloat(e.target.value) || 0 }))} /></div>
              <div><Label>Unité</Label><Input value={form.unite} onChange={e => setForm(p => ({ ...p, unite: e.target.value }))} /></div>
            </div>
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
