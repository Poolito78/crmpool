import { useState, useRef, useMemo } from 'react';
import { useCRM } from '@/lib/StoreContext';
import { generateId, type Fournisseur } from '@/lib/store';
import { Plus, Search, Edit2, Trash2, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { exportToExcel } from '@/lib/exportExcel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const emptyFournisseur: Omit<Fournisseur, 'id' | 'dateCreation'> = {
  nom: '', email: '', telephone: '', adresse: '', ville: '', codePostal: '', societe: '', notes: '', francoPort: 0, coutTransport: 0, delaiReglement: '45j FDM', encoursMax: 0
};

const importFields: { key: string; label: string; aliases: string[]; type: 'text' | 'number'; default?: any }[] = [
  { key: 'societe', label: 'Société', aliases: ['société', 'societe', 'entreprise', 'raison sociale'], type: 'text' },
  { key: 'nom', label: 'Nom contact', aliases: ['nom', 'contact', 'nom contact'], type: 'text' },
  { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'mail', 'courriel'], type: 'text' },
  { key: 'telephone', label: 'Téléphone', aliases: ['téléphone', 'telephone', 'tel', 'tél'], type: 'text' },
  { key: 'adresse', label: 'Adresse', aliases: ['adresse', 'rue'], type: 'text' },
  { key: 'ville', label: 'Ville', aliases: ['ville', 'city'], type: 'text' },
  { key: 'codePostal', label: 'Code postal', aliases: ['code postal', 'codepostal', 'cp'], type: 'text' },
  { key: 'francoPort', label: 'Franco de port', aliases: ['franco de port', 'francoport', 'franco', 'franco port'], type: 'number' },
  { key: 'coutTransport', label: 'Coût transport', aliases: ['coût transport', 'couttransport', 'transport', 'frais transport'], type: 'number' },
  { key: 'delaiReglement', label: 'Délai règlement', aliases: ['délai règlement', 'delai reglement', 'délai de règlement', 'delai de reglement', 'paiement'], type: 'number', default: 30 },
  { key: 'encoursMax', label: 'Encours max', aliases: ['encours', 'encours max', 'montant encours', 'encours maximum'], type: 'number' },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'commentaire', 'remarques'], type: 'text' },
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
  const [importMode, setImportMode] = useState<'add' | 'update'>('add');
  const [importSelectedCols, setImportSelectedCols] = useState<Set<string>>(new Set());
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});

  const filtered = fournisseurs.filter(f =>
    [f.nom, f.email, f.societe, f.telephone].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  const excelColumns = useMemo(() => {
    if (!importPreview || importPreview.length === 0) return [];
    return Object.keys(importPreview[0]);
  }, [importPreview]);

  function openNew() { setEditing(null); setForm(emptyFournisseur); setDialogOpen(true); }
  function openEdit(f: Fournisseur) {
    setEditing(f);
    setForm({ nom: f.nom, email: f.email, telephone: f.telephone, adresse: f.adresse, ville: f.ville, codePostal: f.codePostal, societe: f.societe, notes: f.notes || '', francoPort: f.francoPort ?? 0, coutTransport: f.coutTransport ?? 0, delaiReglement: f.delaiReglement ?? 30, encoursMax: f.encoursMax ?? 0 });
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

  function importFournisseursAction() {
    if (!importPreview) return;
    const selectedFields = importFields.filter(f => importSelectedCols.has(f.key));

    if (importMode === 'update') {
      let updated = 0;
      updateFournisseurs(prev => prev.map(f => {
        const matchingRow = importPreview.find(row => {
          const societe = getMappedValue(row, 'societe');
          return societe.toLowerCase() === f.societe.trim().toLowerCase();
        });
        if (!matchingRow) return f;

        const updates: Record<string, any> = {};
        for (const field of selectedFields) {
          if (field.key === 'societe') continue; // clé de correspondance
          if (field.type === 'number') {
            updates[field.key] = getMappedNum(matchingRow, field.key, field.default ?? 0);
          } else {
            const val = getMappedValue(matchingRow, field.key);
            if (val || field.default) updates[field.key] = val || field.default || '';
          }
        }

        if (Object.keys(updates).length > 0) {
          updated++;
          return { ...f, ...updates };
        }
        return f;
      }));
      toast.success(`${updated} fournisseur(s) mis à jour`);
    } else {
      const mapped: Fournisseur[] = importPreview.map((row: any) => ({
        id: generateId(),
        nom: getMappedValue(row, 'nom'),
        email: getMappedValue(row, 'email'),
        telephone: getMappedValue(row, 'telephone'),
        adresse: getMappedValue(row, 'adresse'),
        ville: getMappedValue(row, 'ville'),
        codePostal: getMappedValue(row, 'codePostal'),
        societe: getMappedValue(row, 'societe'),
        notes: getMappedValue(row, 'notes'),
        francoPort: getMappedNum(row, 'francoPort'),
        coutTransport: getMappedNum(row, 'coutTransport'),
        delaiReglement: getMappedNum(row, 'delaiReglement', 30),
        encoursMax: getMappedNum(row, 'encoursMax'),
        dateCreation: new Date().toISOString().split('T')[0],
      })).filter(f => f.nom || f.societe);

      const existingSocietes = new Set(fournisseurs.map(f => f.societe.trim().toLowerCase()));
      const unique = mapped.filter(f => {
        const s = f.societe.trim().toLowerCase();
        if (!s) return true;
        if (existingSocietes.has(s)) return false;
        existingSocietes.add(s);
        return true;
      });
      const skipped = mapped.length - unique.length;

      updateFournisseurs(prev => [...prev, ...unique]);
      toast.success(`${unique.length} fournisseur(s) importé(s)${skipped > 0 ? `, ${skipped} doublon(s) ignoré(s)` : ''}`);
    }

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
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4 mr-2" /> Importer</Button>
          <Button variant="outline" onClick={() => exportToExcel(fournisseurs.map(f => ({ Nom: f.nom, Société: f.societe, Email: f.email, Téléphone: f.telephone, Adresse: f.adresse, Ville: f.ville, 'Code postal': f.codePostal, 'Franco port': f.francoPort, 'Coût transport': f.coutTransport, Notes: f.notes || '' })), 'fournisseurs', 'Fournisseurs')}><Download className="w-4 h-4 mr-2" /> Exporter</Button>
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
            <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
              <p className="text-sm font-semibold text-foreground">Conditions de paiement</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Délai de règlement (jours FDM)</Label>
                  <Input type="number" step="1" value={form.delaiReglement} onChange={e => setForm(prev => ({ ...prev, delaiReglement: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <Label className="text-xs">Encours max (€)</Label>
                  <Input type="number" step="0.01" value={form.encoursMax} onChange={e => setForm(prev => ({ ...prev, encoursMax: parseFloat(e.target.value) || 0 }))} />
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
                  Les fournisseurs seront mis à jour par correspondance sur la <strong>société</strong>. Sélectionnez les colonnes à mettre à jour :
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
                        disabled={importMode === 'update' && f.key === 'societe'}
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
            <Button onClick={importFournisseursAction}>
              {importMode === 'update' ? `Mettre à jour` : `Importer ${importPreview?.length || 0} fournisseur(s)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
