import { useState } from 'react';
import { useCRM } from '@/lib/StoreContext';
import { generateId, type Fournisseur } from '@/lib/store';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const emptyFournisseur: Omit<Fournisseur, 'id' | 'dateCreation'> = {
  nom: '', email: '', telephone: '', adresse: '', ville: '', codePostal: '', societe: '', notes: ''
};

export default function Fournisseurs() {
  const { fournisseurs, updateFournisseurs } = useCRM();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Fournisseur | null>(null);
  const [form, setForm] = useState(emptyFournisseur);

  const filtered = fournisseurs.filter(f =>
    [f.nom, f.email, f.societe, f.telephone].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  function openNew() { setEditing(null); setForm(emptyFournisseur); setDialogOpen(true); }
  function openEdit(f: Fournisseur) {
    setEditing(f);
    setForm({ nom: f.nom, email: f.email, telephone: f.telephone, adresse: f.adresse, ville: f.ville, codePostal: f.codePostal, societe: f.societe, notes: f.notes || '' });
    setDialogOpen(true);
  }

  function save() {
    if (!form.nom.trim() || !form.societe.trim()) { toast.error('Nom et société requis'); return; }
    if (editing) {
      updateFournisseurs(prev => prev.map(f => f.id === editing.id ? { ...f, ...form } : f));
      toast.success('Fournisseur modifié');
    } else {
      updateFournisseurs(prev => [...prev, { ...form, id: generateId(), dateCreation: new Date().toISOString().split('T')[0] }]);
      toast.success('Fournisseur ajouté');
    }
    setDialogOpen(false);
  }

  function remove(id: string) {
    updateFournisseurs(prev => prev.filter(f => f.id !== id));
    toast.success('Fournisseur supprimé');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={openNew} className="shrink-0"><Plus className="w-4 h-4 mr-2" /> Nouveau fournisseur</Button>
      </div>

      <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Société</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Téléphone</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ville</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => (
              <tr key={f.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">{f.societe}</td>
                <td className="px-4 py-3 text-muted-foreground">{f.nom}</td>
                <td className="px-4 py-3 text-muted-foreground">{f.email}</td>
                <td className="px-4 py-3 text-muted-foreground">{f.telephone}</td>
                <td className="px-4 py-3 text-muted-foreground">{f.ville}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => openEdit(f)} className="p-1.5 rounded-md hover:bg-muted"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => remove(f.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center py-8 text-muted-foreground">Aucun fournisseur</p>}
      </div>

      <div className="md:hidden space-y-3">
        {filtered.map(f => (
          <div key={f.id} className="bg-card rounded-xl border border-border p-4">
            <div className="flex justify-between items-start">
              <div><p className="font-medium">{f.societe}</p><p className="text-sm text-muted-foreground">{f.nom}</p></div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(f)} className="p-1.5 rounded-md hover:bg-muted"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => remove(f.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="mt-2 text-sm text-muted-foreground space-y-0.5">
              <p>{f.email}</p><p>{f.telephone}</p><p>{f.ville}</p>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Modifier' : 'Nouveau fournisseur'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            {[
              { key: 'societe', label: 'Société *' },
              { key: 'nom', label: 'Nom contact *' },
              { key: 'email', label: 'Email', type: 'email' },
              { key: 'telephone', label: 'Téléphone', type: 'tel' },
              { key: 'adresse', label: 'Adresse' },
              { key: 'ville', label: 'Ville' },
              { key: 'codePostal', label: 'Code postal' },
            ].map(f => (
              <div key={f.key}>
                <Label>{f.label}</Label>
                <Input type={f.type || 'text'} value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
              </div>
            ))}
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
