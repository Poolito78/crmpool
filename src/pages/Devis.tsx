import { useState } from 'react';
import { useCRM } from '@/lib/StoreContext';
import { generateId, calculerTotalDevis, calculerTotalLigne, formatMontant, formatDate, type Devis as DevisType, type LigneDevis } from '@/lib/store';
import { Plus, Search, Eye, Trash2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import DevisPreview from '@/components/DevisPreview';

const statutColors: Record<string, string> = {
  brouillon: 'bg-muted text-muted-foreground',
  envoyé: 'bg-info/10 text-info',
  accepté: 'bg-success/10 text-success',
  refusé: 'bg-destructive/10 text-destructive',
  expiré: 'bg-muted text-muted-foreground',
};

export default function Devis() {
  const { devis, updateDevis, clients, produits } = useCRM();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewDevis, setPreviewDevis] = useState<DevisType | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const [clientId, setClientId] = useState('');
  const [dateValidite, setDateValidite] = useState('');
  const [statut, setStatut] = useState<DevisType['statut']>('brouillon');
  const [notes, setNotes] = useState('');
  const [conditions, setConditions] = useState('Paiement à 30 jours à compter de la date de facturation.');
  const [lignes, setLignes] = useState<LigneDevis[]>([]);

  const filtered = devis.filter(d => {
    const client = clients.find(c => c.id === d.clientId);
    return [d.numero, client?.nom, d.statut].some(v => v?.toLowerCase().includes(search.toLowerCase()));
  });

  function openNew() {
    setClientId('');
    setDateValidite(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
    setStatut('brouillon');
    setNotes('');
    setConditions('Paiement à 30 jours à compter de la date de facturation.');
    setLignes([{ id: generateId(), description: '', quantite: 1, prixUnitaireHT: 0, tva: 20, remise: 0 }]);
    setDialogOpen(true);
  }

  function addLigne() {
    setLignes(prev => [...prev, { id: generateId(), description: '', quantite: 1, prixUnitaireHT: 0, tva: 20, remise: 0 }]);
  }

  function updateLigne(id: string, field: string, value: any) {
    setLignes(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  }

  function removeLigne(id: string) {
    setLignes(prev => prev.filter(l => l.id !== id));
  }

  function selectProduit(ligneId: string, produitId: string) {
    const p = produits.find(pr => pr.id === produitId);
    if (p) {
      setLignes(prev => prev.map(l => l.id === ligneId ? { ...l, produitId: p.id, description: p.nom, prixUnitaireHT: p.prixHT, tva: p.tva } : l));
    }
  }

  function save() {
    if (!clientId) { toast.error('Sélectionnez un client'); return; }
    if (lignes.length === 0) { toast.error('Ajoutez au moins une ligne'); return; }
    const numero = `DEV-${new Date().getFullYear()}-${String(devis.length + 1).padStart(3, '0')}`;
    const newDevis: DevisType = {
      id: generateId(), numero, clientId, dateCreation: new Date().toISOString().split('T')[0],
      dateValidite, statut, lignes, notes, conditions
    };
    updateDevis(prev => [...prev, newDevis]);
    toast.success('Devis créé');
    setDialogOpen(false);
  }

  function updateStatut(id: string, newStatut: DevisType['statut']) {
    updateDevis(prev => prev.map(d => d.id === id ? { ...d, statut: newStatut } : d));
    toast.success('Statut mis à jour');
  }

  function confirmRemove(id: string) {
    setDeleteTargetId(id);
    setDeleteConfirmOpen(true);
  }

  function executeDelete() {
    if (deleteTargetId) {
      updateDevis(prev => prev.filter(d => d.id !== deleteTargetId));
      toast.success('Devis supprimé');
      setDeleteTargetId(null);
      setDeleteConfirmOpen(false);
    }
  }

  const total = calculerTotalDevis(lignes);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={openNew} className="shrink-0"><Plus className="w-4 h-4 mr-2" /> Nouveau devis</Button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.map(d => {
          const client = clients.find(c => c.id === d.clientId);
          const t = calculerTotalDevis(d.lignes);
          return (
            <div key={d.id} className="bg-card rounded-xl border border-border p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-heading font-semibold">{d.numero}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statutColors[d.statut]}`}>{d.statut}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{client?.nom || '—'} • {formatDate(d.dateCreation)}</p>
                  {d.notes && <p className="text-xs text-muted-foreground mt-1">{d.notes}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-heading font-bold text-lg">{formatMontant(t.totalTTC)}</p>
                    <p className="text-xs text-muted-foreground">TTC</p>
                  </div>
                  <div className="flex gap-1">
                    <select
                      className="text-xs rounded border border-input bg-background px-2 py-1"
                      value={d.statut}
                      onChange={e => updateStatut(d.id, e.target.value as DevisType['statut'])}
                    >
                      <option value="brouillon">Brouillon</option>
                      <option value="envoyé">Envoyé</option>
                      <option value="accepté">Accepté</option>
                      <option value="refusé">Refusé</option>
                      <option value="expiré">Expiré</option>
                    </select>
                    <button onClick={() => setPreviewDevis(d)} className="p-1.5 rounded-md hover:bg-muted"><Eye className="w-4 h-4" /></button>
                    <button onClick={() => remove(d.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-center py-8 text-muted-foreground">Aucun devis</p>}
      </div>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nouveau devis</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>Client *</Label>
                <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={clientId} onChange={e => setClientId(e.target.value)}>
                  <option value="">— Sélectionner —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.nom}{c.societe ? ` (${c.societe})` : ''}</option>)}
                </select>
              </div>
              <div>
                <Label>Date de validité</Label>
                <Input type="date" value={dateValidite} onChange={e => setDateValidite(e.target.value)} />
              </div>
              <div>
                <Label>Statut</Label>
                <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={statut} onChange={e => setStatut(e.target.value as any)}>
                  <option value="brouillon">Brouillon</option>
                  <option value="envoyé">Envoyé</option>
                </select>
              </div>
            </div>

            {/* Lines */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-base font-semibold">Lignes du devis</Label>
                <Button variant="outline" size="sm" onClick={addLigne}><Plus className="w-3 h-3 mr-1" /> Ligne</Button>
              </div>
              <div className="space-y-3">
                {lignes.map((l, i) => (
                  <div key={l.id} className="bg-muted/30 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Ligne {i + 1}</span>
                      <button onClick={() => removeLigne(l.id)} className="text-destructive hover:text-destructive/80"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Produit</Label>
                        <select className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm" value={l.produitId || ''} onChange={e => selectProduit(l.id, e.target.value)}>
                          <option value="">— Libre —</option>
                          {produits.map(p => <option key={p.id} value={p.id}>{p.reference} - {p.nom}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs">Description</Label>
                        <Input value={l.description} onChange={e => updateLigne(l.id, 'description', e.target.value)} className="h-8 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div><Label className="text-xs">Qté</Label><Input type="number" value={l.quantite} onChange={e => updateLigne(l.id, 'quantite', parseFloat(e.target.value) || 0)} className="h-8 text-sm" /></div>
                      <div><Label className="text-xs">Prix HT</Label><Input type="number" step="0.01" value={l.prixUnitaireHT} onChange={e => updateLigne(l.id, 'prixUnitaireHT', parseFloat(e.target.value) || 0)} className="h-8 text-sm" /></div>
                      <div><Label className="text-xs">TVA %</Label><Input type="number" value={l.tva} onChange={e => updateLigne(l.id, 'tva', parseFloat(e.target.value) || 0)} className="h-8 text-sm" /></div>
                      <div><Label className="text-xs">Remise %</Label><Input type="number" value={l.remise} onChange={e => updateLigne(l.id, 'remise', parseFloat(e.target.value) || 0)} className="h-8 text-sm" /></div>
                    </div>
                    <p className="text-xs text-right text-muted-foreground">Total TTC: {formatMontant(calculerTotalLigne(l).totalTTC)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-1 text-sm">
              <div className="flex justify-between"><span>Total HT</span><span className="font-semibold">{formatMontant(total.totalHT)}</span></div>
              <div className="flex justify-between"><span>Total TVA</span><span>{formatMontant(total.totalTVA)}</span></div>
              <div className="flex justify-between border-t border-border pt-1 mt-1"><span className="font-semibold">Total TTC</span><span className="font-heading font-bold text-lg">{formatMontant(total.totalTTC)}</span></div>
            </div>

            <div><Label>Notes</Label><textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
            <div><Label>Conditions</Label><textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" rows={2} value={conditions} onChange={e => setConditions(e.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={save}><FileText className="w-4 h-4 mr-2" /> Créer le devis</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      {previewDevis && (
        <Dialog open={!!previewDevis} onOpenChange={() => setPreviewDevis(null)}>
          <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto p-0">
            <DevisPreview devis={previewDevis} client={clients.find(c => c.id === previewDevis.clientId)} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
