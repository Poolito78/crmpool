import { useState, useMemo, useRef } from 'react';
import { Upload, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { exportToExcel } from '@/lib/exportExcel';
import { useCRM } from '@/lib/StoreContext';
import { generateId, type Client } from '@/lib/store';

const importFields: { key: string; label: string; aliases: string[] }[] = [
  { key: 'nom', label: 'Nom', aliases: ['nom', 'name', 'contact', 'nom contact', 'nom client'] },
  { key: 'societe', label: 'Société', aliases: ['société', 'societe', 'entreprise', 'company', 'raison sociale'] },
  { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'mail', 'courriel'] },
  { key: 'telephone', label: 'Téléphone', aliases: ['téléphone', 'telephone', 'tel', 'tél', 'phone', 'portable', 'mobile'] },
  { key: 'adresse', label: 'Adresse', aliases: ['adresse', 'address', 'rue'] },
  { key: 'ville', label: 'Ville', aliases: ['ville', 'city'] },
  { key: 'codePostal', label: 'Code postal', aliases: ['code postal', 'codepostal', 'cp', 'zip', 'postal'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'commentaire', 'remarques', 'observation'] },
];

function autoDetectMapping(excelCols: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const field of importFields) {
    for (const alias of field.aliases) {
      const match = excelCols.find(col => col.trim().toLowerCase() === alias.toLowerCase());
      if (match && !Object.values(mapping).includes(match)) { mapping[field.key] = match; break; }
    }
  }
  return mapping;
}

// Boutons + assistant d'import / export des clients (utilisés dans Paramètres → Clients).
export default function ClientsImportExport() {
  const { clients, updateClients } = useCRM();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});
  const [importSelectedCols, setImportSelectedCols] = useState<Set<string>>(new Set());
  const [importMode, setImportMode] = useState<'add' | 'update'>('add');
  const [importMatchKey, setImportMatchKey] = useState<'nom' | 'societe'>('nom');

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
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
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
        if (Object.keys(updates).length > 0) { updated++; return { ...c, ...updates }; }
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
      const existingKeys = new Set(clients.map(c => (importMatchKey === 'nom' ? c.nom : (c.societe || '')).trim().toLowerCase()));
      const unique = mapped.filter(c => {
        const key = (importMatchKey === 'nom' ? c.nom : (c.societe || '')).trim().toLowerCase();
        if (!key || existingKeys.has(key)) return false;
        existingKeys.add(key);
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
    <div className="flex flex-wrap gap-2 items-center">
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4 mr-2" /> Importer (Excel/CSV)</Button>
      <Button variant="outline" size="sm" onClick={() => exportToExcel(clients.map(c => ({ Nom: c.nom, Société: c.societe || '', Email: c.email, Téléphone: c.telephone, Adresse: c.adresse, Ville: c.ville, 'Code postal': c.codePostal, Notes: c.notes || '', Revendeur: c.estRevendeur ? 'Oui' : 'Non' })), 'clients', 'Clients')}><Download className="w-4 h-4 mr-2" /> Exporter (Excel)</Button>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Aperçu de l'import clients</DialogTitle></DialogHeader>
          {importPreview && (
            <>
              <div className="flex gap-2 mb-2">
                <Button variant={importMode === 'add' ? 'default' : 'outline'} size="sm" onClick={() => setImportMode('add')}>Ajouter (nouveaux)</Button>
                <Button variant={importMode === 'update' ? 'default' : 'outline'} size="sm" onClick={() => setImportMode('update')}>Mettre à jour (existants)</Button>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-muted-foreground">Correspondance par :</span>
                <Button variant={importMatchKey === 'nom' ? 'default' : 'outline'} size="sm" onClick={() => setImportMatchKey('nom')}>Nom</Button>
                <Button variant={importMatchKey === 'societe' ? 'default' : 'outline'} size="sm" onClick={() => setImportMatchKey('societe')}>Société</Button>
              </div>
              {importMode === 'update' && (
                <p className="text-xs text-muted-foreground">Les clients seront mis à jour par correspondance sur <strong>{importMatchKey === 'nom' ? 'le nom' : 'la société'}</strong>. Sélectionnez les colonnes à mettre à jour :</p>
              )}
              <div className="border border-border rounded-lg p-3 bg-muted/30 space-y-2">
                <p className="text-xs font-semibold">Correspondance des colonnes :</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {importFields.map(f => (
                    <div key={f.key} className="flex items-center gap-2">
                      <input type="checkbox" className="rounded border-input shrink-0" checked={importSelectedCols.has(f.key)} onChange={e => { const next = new Set(importSelectedCols); e.target.checked ? next.add(f.key) : next.delete(f.key); setImportSelectedCols(next); }} />
                      <Label className="text-xs w-24 shrink-0">{f.label}</Label>
                      <select className="flex-1 text-xs rounded border border-input bg-background px-2 py-1" value={importMapping[f.key] || ''} onChange={e => setImportMapping(prev => ({ ...prev, [f.key]: e.target.value }))}>
                        <option value="">— Non mappé —</option>
                        {excelColumns.map(col => (<option key={col} value={col}>{col}</option>))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto max-h-60">
                <table className="w-full text-xs border">
                  <thead>
                    <tr className="bg-muted/50">
                      {importFields.filter(f => importSelectedCols.has(f.key) && importMapping[f.key]).map(f => (<th key={f.key} className="px-2 py-1 text-left border-b font-medium">{f.label}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b">
                        {importFields.filter(f => importSelectedCols.has(f.key) && importMapping[f.key]).map(f => (<td key={f.key} className="px-2 py-1">{getMappedValue(row, f.key)}</td>))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importPreview.length > 10 && <p className="text-xs text-muted-foreground mt-1">... et {importPreview.length - 10} autres lignes</p>}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setImportDialogOpen(false); setImportPreview(null); }}>Annuler</Button>
                <Button onClick={importClients}>{importMode === 'update' ? 'Mettre à jour' : `Importer ${importPreview.length} client(s)`}</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
