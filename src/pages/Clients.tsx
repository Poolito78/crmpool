import { useState } from 'react';
import { useCRM } from '@/lib/StoreContext';
import { generateId, type Client } from '@/lib/store';
import { Plus, Search, Edit2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const emptyClient: Omit<Client, 'id' | 'dateCreation'> = {
  nom: '', email: '', telephone: '', adresse: '', ville: '', codePostal: '', societe: '', notes: ''
};

export default function Clients() {
  const { clients, updateClients } = useCRM();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyClient);

  const filtered = clients.filter(c =>
    [c.nom, c.email, c.societe, c.telephone, c.ville].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  function openNew() {
    setEditingClient(null);
    setForm(emptyClient);
    setDialogOpen(true);
  }

  function openEdit(c: Client) {
    setEditingClient(c);
    setForm({ nom: c.nom, email: c.email, telephone: c.telephone, adresse: c.adresse, ville: c.ville, codePostal: c.codePostal, societe: c.societe || '', notes: c.notes || '' });
    setDialogOpen(true);
  }

  function save() {
    if (!form.nom.trim()) { toast.error('Le nom est requis'); return; }
    if (editingClient) {
      updateClients(prev => prev.map(c => c.id === editingClient.id ? { ...c, ...form } : c));
      toast.success('Client modifié');
    } else {
      updateClients(prev => [...prev, { ...form, id: generateId(), dateCreation: new Date().toISOString().split('T')[0] }]);
      toast.success('Client ajouté');
    }
    setDialogOpen(false);
  }

  function remove(id: string) {
    updateClients(prev => prev.filter(c => c.id !== id));
    toast.success('Client supprimé');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={openNew} className="shrink-0">
          <Plus className="w-4 h-4 mr-2" /> Nouveau client
        </Button>
      </div>

      {/* Cards on mobile, table on desktop */}
      <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nom</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Société</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Téléphone</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ville</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">{c.nom}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.societe || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.telephone}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.ville}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => openEdit(c)} className="p-1.5 rounded-md hover:bg-muted"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => remove(c.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center py-8 text-muted-foreground">Aucun client trouvé</p>}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered.map(c => (
          <div key={c.id} className="bg-card rounded-xl border border-border p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">{c.nom}</p>
                {c.societe && <p className="text-sm text-muted-foreground">{c.societe}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(c)} className="p-1.5 rounded-md hover:bg-muted"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => remove(c.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="mt-2 text-sm text-muted-foreground space-y-0.5">
              <p>{c.email}</p>
              <p>{c.telephone}</p>
              <p>{c.ville}</p>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center py-8 text-muted-foreground">Aucun client trouvé</p>}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClient ? 'Modifier le client' : 'Nouveau client'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {[
              { key: 'nom', label: 'Nom *', type: 'text' },
              { key: 'societe', label: 'Société', type: 'text' },
              { key: 'email', label: 'Email', type: 'email' },
              { key: 'telephone', label: 'Téléphone', type: 'tel' },
              { key: 'adresse', label: 'Adresse', type: 'text' },
              { key: 'ville', label: 'Ville', type: 'text' },
              { key: 'codePostal', label: 'Code postal', type: 'text' },
            ].map(f => (
              <div key={f.key}>
                <Label>{f.label}</Label>
                <Input
                  type={f.type}
                  value={(form as any)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <Label>Notes</Label>
              <textarea
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                rows={3}
                value={form.notes}
                onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={save}>{editingClient ? 'Modifier' : 'Ajouter'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
