import { useState, useRef } from 'react';
import { useCRM } from '@/lib/StoreContext';
import { generateId, type Fournisseur } from '@/lib/store';
import { Plus, Search, Edit2, Trash2, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const emptyFournisseur: Omit<Fournisseur, 'id' | 'dateCreation'> = {
  nom: '', email: '', telephone: '', adresse: '', ville: '', codePostal: '', societe: '', notes: '', francoPort: 0, coutTransport: 0
};

export default function Fournisseurs() {
  const { fournisseurs, updateFournisseurs } = useCRM();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Fournisseur | null>(null);
  const [form, setForm] = useState(emptyFournisseur);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const filtered = fournisseurs.filter(f =>
    [f.nom, f.email, f.societe, f.telephone].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  function openNew() { setEditing(null); setForm(emptyFournisseur); setDialogOpen(true); }
  function openEdit(f: Fournisseur) {
    setEditing(f);
    setForm({ nom: f.nom, email: f.email, telephone: f.telephone, adresse: f.adresse, ville: f.ville, codePostal: f.codePostal, societe: f.societe, notes: f.notes || '', francoPort: f.francoPort ?? 0, coutTransport: f.coutTransport ?? 0 });
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

  function confirmRemove(id: string) {
    setDeleteTargetId(id);
    setDeleteConfirmOpen(true);
  }

  function executeDelete() {
    if (deleteTargetId) {
      updateFournisseurs(prev => prev.filter(f => f.id !== deleteTargetId));
      toast.success('Fournisseur supprimé');
    }
    setDeleteConfirmOpen(false);
    setDeleteTargetId(null);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet);
        if (json.length === 0) { toast.error('Fichier vide'); return; }
        setImportPreview(json);
        setImportDialogOpen(true);
      } catch { toast.error('Erreur de lecture du fichier'); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function importFournisseurs() {
    if (!importPreview) return;
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
    const mapped: Fournisseur[] = importPreview.map((row: any) => ({
      id: generateId(),
      nom: findCol(row, ['nom', 'contact', 'nom contact']),
      email: findCol(row, ['email', 'e-mail', 'mail', 'courriel']),
      telephone: findCol(row, ['téléphone', 'telephone', 'tel', 'tél']),
      adresse: findCol(row, ['adresse', 'rue']),
      ville: findCol(row, ['ville', 'city']),
      codePostal: findCol(row, ['code postal', 'codepostal', 'cp']),
      societe: findCol(row, ['société', 'societe', 'entreprise', 'raison sociale']),
      notes: findCol(row, ['notes', 'commentaire', 'remarques']),
      francoPort: findNum(row, ['franco de port', 'francoport', 'franco', 'franco port']),
      coutTransport: findNum(row, ['coût transport', 'couttransport', 'transport', 'frais transport']),
      dateCreation: new Date().toISOString().split('T')[0],
    })).filter(f => f.nom || f.societe);

    if (mapped.length === 0) { toast.error('Aucun fournisseur valide trouvé'); return; }
    updateFournisseurs(prev => [...prev, ...mapped]);
    toast.success(`${mapped.length} fournisseur(s) importé(s)`);
    setImportDialogOpen(false);
    setImportPreview(null);
  }

  return (
    <div className="space-y-4">
      <input type="file" ref={fileInputRef} accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4 mr-2" /> Importer Excel</Button>
          <Button onClick={openNew} className="shrink-0"><Plus className="w-4 h-4 mr-2" /> Nouveau fournisseur</Button>
        </div>
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
                    <button onClick={() => confirmRemove(f.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
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
                <button onClick={() => confirmRemove(f.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="mt-2 text-sm text-muted-foreground space-y-0.5">
              <p>{f.email}</p><p>{f.telephone}</p><p>{f.ville}</p>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer ce fournisseur ? Cette action ne peut pas être annulée.
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
            <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
              <p className="text-sm font-semibold text-foreground">Conditions de livraison</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Franco de port (€)</Label>
                  <Input type="number" step="0.01" value={form.francoPort} onChange={e => setForm(prev => ({ ...prev, francoPort: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <Label className="text-xs">Coût transport (€)</Label>
                  <Input type="number" step="0.01" value={form.coutTransport} onChange={e => setForm(prev => ({ ...prev, coutTransport: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={save}>{editing ? 'Modifier' : 'Ajouter'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Aperçu de l'import ({importPreview?.length || 0} fournisseurs)</DialogTitle></DialogHeader>
          {importPreview && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-border">
                <thead>
                  <tr className="bg-muted/50">
                    {Object.keys(importPreview[0] || {}).map(k => (
                      <th key={k} className="px-2 py-1 text-left font-medium border-b border-border">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importPreview.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-b border-border">
                      {Object.values(row).map((v, j) => (
                        <td key={j} className="px-2 py-1">{String(v ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {importPreview.length > 10 && <p className="text-xs text-muted-foreground mt-2">... et {importPreview.length - 10} autres lignes</p>}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setImportDialogOpen(false); setImportPreview(null); }}>Annuler</Button>
            <Button onClick={importFournisseurs}>Importer {importPreview?.length || 0} fournisseur(s)</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
