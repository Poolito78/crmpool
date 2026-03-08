import { useState, useMemo, useRef } from 'react';
import { useCRM } from '@/lib/StoreContext';
import { generateId, type Client, type AdresseLivraison } from '@/lib/store';
import { Plus, Search, Edit2, Trash2, MapPin, ChevronDown, ChevronUp, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const emptyClient: Omit<Client, 'id' | 'dateCreation'> = {
  nom: '', email: '', telephone: '', adresse: '', ville: '', codePostal: '', societe: '', notes: '', adressesLivraison: [], estRevendeur: false, remisesParCategorie: {}
};

const emptyAdresse: Omit<AdresseLivraison, 'id'> = {
  libelle: '', adresse: '', ville: '', codePostal: '', contact: '', telephone: '', parDefaut: false
};

const importFields: { key: string; label: string; aliases: string[]; type: 'text' }[] = [
  { key: 'nom', label: 'Nom', aliases: ['nom', 'name', 'contact', 'nom contact', 'nom client'], type: 'text' },
  { key: 'societe', label: 'Société', aliases: ['société', 'societe', 'entreprise', 'company', 'raison sociale'], type: 'text' },
  { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'mail', 'courriel'], type: 'text' },
  { key: 'telephone', label: 'Téléphone', aliases: ['téléphone', 'telephone', 'tel', 'tél', 'phone', 'portable', 'mobile'], type: 'text' },
  { key: 'adresse', label: 'Adresse', aliases: ['adresse', 'address', 'rue'], type: 'text' },
  { key: 'ville', label: 'Ville', aliases: ['ville', 'city'], type: 'text' },
  { key: 'codePostal', label: 'Code postal', aliases: ['code postal', 'codepostal', 'cp', 'zip', 'postal'], type: 'text' },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'commentaire', 'remarques', 'observation'], type: 'text' },
];

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

export default function Clients() {
  const { clients, updateClients, produits } = useCRM();
  
  // Extract unique categories from products
  const categories = useMemo(() => {
    const cats = new Set<string>();
    produits.forEach(p => { if (p.categorie) cats.add(p.categorie); });
    return Array.from(cats).sort();
  }, [produits]);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyClient);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [adresseForm, setAdresseForm] = useState(emptyAdresse);
  const [editingAdresse, setEditingAdresse] = useState<string | null>(null);
  const [showAdresseForm, setShowAdresseForm] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});
  const [importSelectedCols, setImportSelectedCols] = useState<Set<string>>(new Set());
  const [importMode, setImportMode] = useState<'add' | 'update'>('add');
  const [importMatchKey, setImportMatchKey] = useState<'nom' | 'societe'>('nom');

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
    setForm({ nom: c.nom, email: c.email, telephone: c.telephone, adresse: c.adresse, ville: c.ville, codePostal: c.codePostal, societe: c.societe || '', notes: c.notes || '', adressesLivraison: c.adressesLivraison || [], estRevendeur: c.estRevendeur || false, remisesParCategorie: c.remisesParCategorie || {} });
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

  function confirmRemove(id: string) {
    setDeleteTargetId(id);
    setDeleteConfirmOpen(true);
  }

  function executeDelete() {
    if (deleteTargetId) {
      updateClients(prev => prev.filter(c => c.id !== deleteTargetId));
      toast.success('Client supprimé');
    }
    setDeleteConfirmOpen(false);
    setDeleteTargetId(null);
  }

  function addOrUpdateAdresse() {
    if (!adresseForm.libelle.trim() || !adresseForm.adresse.trim()) {
      toast.error('Libellé et adresse requis');
      return;
    }
    let newAdresses = [...form.adressesLivraison];
    if (adresseForm.parDefaut) {
      newAdresses = newAdresses.map(a => ({ ...a, parDefaut: false }));
    }
    if (editingAdresse) {
      newAdresses = newAdresses.map(a => a.id === editingAdresse ? { ...adresseForm, id: editingAdresse } : a);
    } else {
      if (newAdresses.length === 0) adresseForm.parDefaut = true;
      newAdresses.push({ ...adresseForm, id: generateId() });
    }
    setForm(prev => ({ ...prev, adressesLivraison: newAdresses }));
    setAdresseForm(emptyAdresse);
    setEditingAdresse(null);
    setShowAdresseForm(false);
  }

  function removeAdresse(id: string) {
    const newAdresses = form.adressesLivraison.filter(a => a.id !== id);
    if (newAdresses.length > 0 && !newAdresses.some(a => a.parDefaut)) {
      newAdresses[0].parDefaut = true;
    }
    setForm(prev => ({ ...prev, adressesLivraison: newAdresses }));
  }

  function editAdresse(a: AdresseLivraison) {
    setAdresseForm({ libelle: a.libelle, adresse: a.adresse, ville: a.ville, codePostal: a.codePostal, contact: a.contact || '', telephone: a.telephone || '', parDefaut: a.parDefaut });
    setEditingAdresse(a.id);
    setShowAdresseForm(true);
  }

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

  function importClients() {
    if (!importPreview) return;
    const selectedFields = importFields.filter(f => importSelectedCols.has(f.key));

    if (importMode === 'update') {
      let updated = 0;
      updateClients(prev => prev.map(c => {
        const matchingRow = importPreview.find(row => {
          const val = getMappedValue(row, importMatchKey);
          const clientVal = importMatchKey === 'nom' ? c.nom : (c.societe || '');
          return val.toLowerCase() === clientVal.trim().toLowerCase();
        });
        if (!matchingRow) return c;

        const updates: Record<string, any> = {};
        for (const field of selectedFields) {
          if (field.key === importMatchKey) continue;
          const val = getMappedValue(matchingRow, field.key);
          if (val) updates[field.key] = val;
        }
        if (Object.keys(updates).length > 0) {
          updated++;
          return { ...c, ...updates };
        }
        return c;
      }));
      toast.success(`${updated} client(s) mis à jour`);
    } else {
      const mapped: Client[] = importPreview.map((row: any) => ({
        id: generateId(),
        nom: getMappedValue(row, 'nom'),
        societe: getMappedValue(row, 'societe'),
        email: getMappedValue(row, 'email'),
        telephone: getMappedValue(row, 'telephone'),
        adresse: getMappedValue(row, 'adresse'),
        ville: getMappedValue(row, 'ville'),
        codePostal: getMappedValue(row, 'codePostal'),
        notes: getMappedValue(row, 'notes'),
        adressesLivraison: [],
        dateCreation: new Date().toISOString().split('T')[0],
      })).filter(c => c.nom || c.societe);

      const existingNames = new Set(clients.map(c => c.nom.trim().toLowerCase()));
      const unique = mapped.filter(c => {
        const name = c.nom.trim().toLowerCase();
        if (!name) return true;
        if (existingNames.has(name)) return false;
        existingNames.add(name);
        return true;
      });
      const skipped = mapped.length - unique.length;

      updateClients(prev => [...prev, ...unique]);
      toast.success(`${unique.length} client(s) importé(s)${skipped > 0 ? `, ${skipped} doublon(s) ignoré(s)` : ''}`);
    }

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
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4 mr-2" /> Importer Excel</Button>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Nouveau client</Button>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nom</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Société</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Téléphone</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ville</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Livraison</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <>
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    {c.nom}
                    {c.estRevendeur && <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">Revendeur</Badge>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.societe || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.telephone}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.ville}</td>
                  <td className="px-4 py-3">
                    {(c.adressesLivraison?.length || 0) > 0 ? (
                      <button
                        onClick={() => setExpandedClient(expandedClient === c.id ? null : c.id)}
                        className="flex items-center gap-1 text-primary hover:underline text-xs"
                      >
                        <MapPin className="w-3 h-3" />
                        {c.adressesLivraison.length} adresse{c.adressesLivraison.length > 1 ? 's' : ''}
                        {expandedClient === c.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded-md hover:bg-muted"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => confirmRemove(c.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
                {expandedClient === c.id && c.adressesLivraison?.length > 0 && (
                  <tr key={`${c.id}-addr`}>
                    <td colSpan={7} className="px-4 py-2 bg-muted/20">
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {c.adressesLivraison.map(a => (
                          <div key={a.id} className="bg-card rounded-lg border border-border p-3 text-xs space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{a.libelle}</span>
                              {a.parDefaut && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Par défaut</Badge>}
                            </div>
                            <p className="text-muted-foreground">{a.adresse}</p>
                            <p className="text-muted-foreground">{a.codePostal} {a.ville}</p>
                            {a.contact && <p className="text-muted-foreground">Contact: {a.contact}</p>}
                            {a.telephone && <p className="text-muted-foreground">Tél: {a.telephone}</p>}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
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
                <button onClick={() => confirmRemove(c.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="mt-2 text-sm text-muted-foreground space-y-0.5">
              <p>{c.email}</p>
              <p>{c.telephone}</p>
              <p>{c.ville}</p>
            </div>
            {(c.adressesLivraison?.length || 0) > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setExpandedClient(expandedClient === c.id ? null : c.id)}
                  className="flex items-center gap-1 text-primary text-xs"
                >
                  <MapPin className="w-3 h-3" />
                  {c.adressesLivraison.length} adresse{c.adressesLivraison.length > 1 ? 's' : ''} de livraison
                  {expandedClient === c.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {expandedClient === c.id && (
                  <div className="mt-2 space-y-2">
                    {c.adressesLivraison.map(a => (
                      <div key={a.id} className="bg-muted/30 rounded-lg p-3 text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{a.libelle}</span>
                          {a.parDefaut && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Par défaut</Badge>}
                        </div>
                        <p className="text-muted-foreground">{a.adresse}, {a.codePostal} {a.ville}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center py-8 text-muted-foreground">Aucun client trouvé</p>}
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer ce client ? Cette action ne peut pas être annulée.
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

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setShowAdresseForm(false); setEditingAdresse(null); } }}>
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
              { key: 'adresse', label: 'Adresse (facturation)', type: 'text' },
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

            {/* Catégorie Revendeur */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-3 mb-3">
                <Checkbox
                  id="estRevendeur"
                  checked={form.estRevendeur || false}
                  onCheckedChange={(checked) => {
                    const isRevendeur = checked === true;
                    setForm(prev => ({
                      ...prev,
                      estRevendeur: isRevendeur,
                      remisesParCategorie: isRevendeur && Object.keys(prev.remisesParCategorie || {}).length === 0
                        ? categories.reduce((acc, cat) => ({ ...acc, [cat]: 30 }), {} as Record<string, number>)
                        : prev.remisesParCategorie || {},
                    }));
                  }}
                />
                <Label htmlFor="estRevendeur" className="text-base font-semibold cursor-pointer">
                  Client revendeur
                </Label>
                {form.estRevendeur && (
                  <Badge variant="secondary" className="text-xs">Remise auto 30%</Badge>
                )}
              </div>
              {form.estRevendeur && (
                <div className="bg-muted/30 rounded-lg border border-border p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Remise par catégorie de produit (%) — modifiable individuellement :</p>
                  {categories.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {categories.map(cat => (
                        <div key={cat} className="flex items-center gap-2">
                          <Label className="text-xs min-w-[100px] truncate" title={cat}>{cat}</Label>
                          <Input
                            type="number"
                            step="1"
                            min="0"
                            max="100"
                            className="h-7 text-xs w-20"
                            value={form.remisesParCategorie?.[cat] ?? 30}
                            onChange={e => setForm(prev => ({
                              ...prev,
                              remisesParCategorie: {
                                ...prev.remisesParCategorie,
                                [cat]: parseFloat(e.target.value) || 0,
                              },
                            }))}
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Aucune catégorie de produit définie. Ajoutez des catégories aux produits pour configurer les remises.</p>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Adresses de livraison
                </Label>
                <Button type="button" variant="outline" size="sm" onClick={() => { setAdresseForm(emptyAdresse); setEditingAdresse(null); setShowAdresseForm(true); }}>
                  <Plus className="w-3 h-3 mr-1" /> Ajouter
                </Button>
              </div>

              {form.adressesLivraison.length > 0 && (
                <div className="space-y-2 mb-3">
                  {form.adressesLivraison.map(a => (
                    <div key={a.id} className="flex items-start justify-between bg-muted/30 rounded-lg p-3 text-sm">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{a.libelle}</span>
                          {a.parDefaut && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Par défaut</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{a.adresse}, {a.codePostal} {a.ville}</p>
                        {a.contact && <p className="text-xs text-muted-foreground">Contact: {a.contact} {a.telephone ? `· ${a.telephone}` : ''}</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button type="button" onClick={() => editAdresse(a)} className="p-1 rounded hover:bg-muted"><Edit2 className="w-3 h-3" /></button>
                        <button type="button" onClick={() => removeAdresse(a.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showAdresseForm && (
                <div className="bg-muted/20 rounded-lg border border-border p-3 space-y-3">
                  <p className="text-sm font-medium">{editingAdresse ? 'Modifier l\'adresse' : 'Nouvelle adresse'}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <Label className="text-xs">Libellé *</Label>
                      <Input placeholder="Ex: Entrepôt, Chantier A..." value={adresseForm.libelle} onChange={e => setAdresseForm(p => ({ ...p, libelle: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Adresse *</Label>
                      <Input value={adresseForm.adresse} onChange={e => setAdresseForm(p => ({ ...p, adresse: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Ville</Label>
                      <Input value={adresseForm.ville} onChange={e => setAdresseForm(p => ({ ...p, ville: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Code postal</Label>
                      <Input value={adresseForm.codePostal} onChange={e => setAdresseForm(p => ({ ...p, codePostal: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Contact</Label>
                      <Input value={adresseForm.contact} onChange={e => setAdresseForm(p => ({ ...p, contact: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Téléphone</Label>
                      <Input value={adresseForm.telephone} onChange={e => setAdresseForm(p => ({ ...p, telephone: e.target.value }))} />
                    </div>
                    <div className="col-span-2 flex items-center gap-2">
                      <input type="checkbox" id="parDefaut" checked={adresseForm.parDefaut} onChange={e => setAdresseForm(p => ({ ...p, parDefaut: e.target.checked }))} className="rounded" />
                      <label htmlFor="parDefaut" className="text-xs">Adresse par défaut</label>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setShowAdresseForm(false); setEditingAdresse(null); }}>Annuler</Button>
                    <Button type="button" size="sm" onClick={addOrUpdateAdresse}>{editingAdresse ? 'Modifier' : 'Ajouter'}</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={save}>{editingClient ? 'Modifier' : 'Ajouter'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Aperçu de l'import clients</DialogTitle></DialogHeader>
          {importPreview && (
            <>
              {/* Mode selection */}
              <div className="flex gap-2 mb-2">
                <Button variant={importMode === 'add' ? 'default' : 'outline'} size="sm" onClick={() => setImportMode('add')}>
                  Ajouter (nouveaux)
                </Button>
                <Button variant={importMode === 'update' ? 'default' : 'outline'} size="sm" onClick={() => setImportMode('update')}>
                  Mettre à jour (existants)
                </Button>
              </div>

              {importMode === 'update' && (
                <p className="text-xs text-muted-foreground">
                  Les clients seront mis à jour par correspondance sur le <strong>nom</strong>. Sélectionnez les colonnes à mettre à jour :
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
                        onChange={e => {
                          const next = new Set(importSelectedCols);
                          e.target.checked ? next.add(f.key) : next.delete(f.key);
                          setImportSelectedCols(next);
                        }}
                      />
                      <Label className="text-xs w-24 shrink-0">{f.label}</Label>
                      <select
                        className="flex-1 text-xs rounded border border-input bg-background px-2 py-1"
                        value={importMapping[f.key] || ''}
                        onChange={e => setImportMapping(prev => ({ ...prev, [f.key]: e.target.value }))}
                      >
                        <option value="">— Non mappé —</option>
                        {excelColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="overflow-x-auto max-h-60">
                <table className="w-full text-xs border">
                  <thead>
                    <tr className="bg-muted/50">
                      {importFields.filter(f => importSelectedCols.has(f.key) && importMapping[f.key]).map(f => (
                        <th key={f.key} className="px-2 py-1 text-left border-b font-medium">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b">
                        {importFields.filter(f => importSelectedCols.has(f.key) && importMapping[f.key]).map(f => (
                          <td key={f.key} className="px-2 py-1">{getMappedValue(row, f.key)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importPreview.length > 10 && <p className="text-xs text-muted-foreground mt-1">... et {importPreview.length - 10} autres lignes</p>}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setImportDialogOpen(false); setImportPreview(null); }}>Annuler</Button>
                <Button onClick={importClients}>
                  {importMode === 'update' ? `Mettre à jour` : `Importer ${importPreview.length} client(s)`}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
