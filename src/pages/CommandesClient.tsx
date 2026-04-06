import { useState } from 'react';
import { useCRM } from '@/lib/StoreContext';
import { generateId, calculerTotalDevis, calculerTotalLigne, formatMontant, formatDate, STATUTS_COMMANDE_CLIENT, type CommandeClient, type StatutCommandeClient, type LigneDevis } from '@/lib/store';
import { Plus, Search, Trash2, Pencil, Eye, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import ClientCombobox from '@/components/ClientCombobox';

const allStatuts = Object.keys(STATUTS_COMMANDE_CLIENT) as StatutCommandeClient[];

export default function CommandesClient() {
  const { commandesClient, updateCommandesClient, clients, devis } = useCRM();
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState<string>('tous');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [previewCommande, setPreviewCommande] = useState<CommandeClient | null>(null);

  // Form state
  const [clientId, setClientId] = useState('');
  const [devisId, setDevisId] = useState('');
  const [numero, setNumero] = useState('');
  const [dateCreation, setDateCreation] = useState(new Date().toISOString().split('T')[0]);
  const [statut, setStatut] = useState<StatutCommandeClient>('accuse_envoye');
  const [referenceAffaire, setReferenceAffaire] = useState('');
  const [notes, setNotes] = useState('');
  const [fraisPortHT, setFraisPortHT] = useState(0);

  function resetForm() {
    setClientId('');
    setDevisId('');
    setNumero(`CMD-${String(commandesClient.length + 1).padStart(4, '0')}`);
    setDateCreation(new Date().toISOString().split('T')[0]);
    setStatut('accuse_envoye');
    setReferenceAffaire('');
    setNotes('');
    setFraisPortHT(0);
    setEditingId(null);
  }

  function openNew() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(cmd: CommandeClient) {
    setEditingId(cmd.id);
    setClientId(cmd.clientId);
    setDevisId(cmd.devisId || '');
    setNumero(cmd.numero);
    setDateCreation(cmd.dateCreation);
    setStatut(cmd.statut);
    setReferenceAffaire(cmd.referenceAffaire || '');
    setNotes(cmd.notes || '');
    setFraisPortHT(cmd.fraisPortHT);
    setDialogOpen(true);
  }

  function createFromDevis(devisItem: typeof devis[0]) {
    const client = clients.find(c => c.id === devisItem.clientId);
    const total = calculerTotalDevis(devisItem.lignes, devisItem.fraisPortHT, devisItem.fraisPortTVA);
    resetForm();
    setClientId(devisItem.clientId);
    setDevisId(devisItem.id);
    setNumero(`CMD-${String(commandesClient.length + 1).padStart(4, '0')}`);
    setReferenceAffaire(devisItem.referenceAffaire || '');
    setFraisPortHT(devisItem.fraisPortHT || 0);
    setDialogOpen(true);
  }

  function save() {
    if (!clientId) { toast.error('Sélectionnez un client'); return; }

    const linkedDevis = devisId ? devis.find(d => d.id === devisId) : null;
    const lignes = linkedDevis ? linkedDevis.lignes : [];
    const total = linkedDevis
      ? calculerTotalDevis(linkedDevis.lignes, fraisPortHT, linkedDevis.fraisPortTVA)
      : { totalHT: 0, totalTVA: 0, totalTTC: 0 };

    if (editingId) {
      updateCommandesClient(prev => prev.map(c => c.id === editingId ? {
        ...c, clientId, devisId: devisId || undefined, numero, dateCreation, statut,
        lignes, totalHT: total.totalHT, totalTVA: total.totalTVA, totalTTC: total.totalTTC,
        fraisPortHT, referenceAffaire: referenceAffaire || undefined, notes: notes || undefined,
      } : c));
      toast.success('Commande modifiée');
    } else {
      const newCmd: CommandeClient = {
        id: generateId(), clientId, devisId: devisId || undefined, numero, dateCreation, statut,
        lignes, totalHT: total.totalHT, totalTVA: total.totalTVA, totalTTC: total.totalTTC,
        fraisPortHT, referenceAffaire: referenceAffaire || undefined, notes: notes || undefined,
      };
      updateCommandesClient(prev => [...prev, newCmd]);
      toast.success('Commande créée');
    }
    setDialogOpen(false);
  }

  function updateStatut(id: string, newStatut: StatutCommandeClient) {
    updateCommandesClient(prev => prev.map(c => c.id === id ? { ...c, statut: newStatut } : c));
    toast.success(`Statut → ${STATUTS_COMMANDE_CLIENT[newStatut].label}`);
  }

  function confirmDelete() {
    if (!deleteTargetId) return;
    updateCommandesClient(prev => prev.filter(c => c.id !== deleteTargetId));
    toast.success('Commande supprimée');
    setDeleteConfirmOpen(false);
  }

  const filtered = commandesClient
    .filter(c => {
      if (filterStatut !== 'tous' && c.statut !== filterStatut) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      const client = clients.find(cl => cl.id === c.clientId);
      return c.numero.toLowerCase().includes(s) ||
        client?.nom.toLowerCase().includes(s) ||
        client?.societe?.toLowerCase().includes(s) ||
        c.referenceAffaire?.toLowerCase().includes(s);
    })
    .sort((a, b) => b.dateCreation.localeCompare(a.dateCreation));

  const acceptedDevis = devis.filter(d => d.statut === 'accepté');

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2 shrink-0">
          <Button onClick={openNew} size="sm"><Plus className="w-4 h-4 mr-1" />Nouvelle commande</Button>
        </div>
      </div>

      {/* Filter by status */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setFilterStatut('tous')} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filterStatut === 'tous' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
          Tous ({commandesClient.length})
        </button>
        {allStatuts.map(s => {
          const count = commandesClient.filter(c => c.statut === s).length;
          return (
            <button key={s} onClick={() => setFilterStatut(s)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filterStatut === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
              {STATUTS_COMMANDE_CLIENT[s].label} ({count})
            </button>
          );
        })}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {allStatuts.map(s => {
          const cmds = commandesClient.filter(c => c.statut === s);
          const total = cmds.reduce((acc, c) => acc + c.totalTTC, 0);
          return (
            <div key={s} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{STATUTS_COMMANDE_CLIENT[s].label}</p>
              <p className="text-lg font-bold">{cmds.length}</p>
              <p className="text-xs text-muted-foreground">{formatMontant(total)}</p>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">N°</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Client</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden sm:table-cell">Réf. Affaire</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Date</th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">Total TTC</th>
              <th className="text-center py-3 px-4 font-medium text-muted-foreground">Statut</th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(cmd => {
              const client = clients.find(c => c.id === cmd.clientId);
              const statutInfo = STATUTS_COMMANDE_CLIENT[cmd.statut];
              return (
                <tr key={cmd.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs">{cmd.numero}</td>
                  <td className="py-3 px-4">
                    <div className="font-medium">{client?.nom || '—'}</div>
                    {client?.societe && <div className="text-xs text-muted-foreground">{client.societe}</div>}
                  </td>
                  <td className="py-3 px-4 hidden sm:table-cell text-muted-foreground">{cmd.referenceAffaire || '—'}</td>
                  <td className="py-3 px-4 hidden md:table-cell text-muted-foreground">{formatDate(cmd.dateCreation)}</td>
                  <td className="py-3 px-4 text-right font-medium">{formatMontant(cmd.totalTTC)}</td>
                  <td className="py-3 px-4 text-center">
                    <select
                      value={cmd.statut}
                      onChange={e => updateStatut(cmd.id, e.target.value as StatutCommandeClient)}
                      className={`text-xs font-medium px-2 py-1 rounded cursor-pointer border-0 ${statutInfo.color}`}
                    >
                      {allStatuts.map(s => (
                        <option key={s} value={s}>{STATUTS_COMMANDE_CLIENT[s].label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setPreviewCommande(cmd)} className="p-1.5 rounded hover:bg-muted" title="Aperçu">
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => openEdit(cmd)} className="p-1.5 rounded hover:bg-muted" title="Modifier">
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => { setDeleteTargetId(cmd.id); setDeleteConfirmOpen(true); }} className="p-1.5 rounded hover:bg-destructive/10" title="Supprimer">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">Aucune commande client</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Modifier la commande' : 'Nouvelle commande client'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Client *</Label>
              <ClientCombobox clients={clients} value={clientId} onChange={setClientId} />
            </div>
            <div>
              <Label>Devis associé</Label>
              <select value={devisId} onChange={e => {
                setDevisId(e.target.value);
                const d = devis.find(dv => dv.id === e.target.value);
                if (d) {
                  setClientId(d.clientId);
                  setReferenceAffaire(d.referenceAffaire || '');
                  setFraisPortHT(d.fraisPortHT || 0);
                }
              }} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— Aucun —</option>
                {devis.map(d => {
                  const cl = clients.find(c => c.id === d.clientId);
                  return <option key={d.id} value={d.id}>{d.numero} — {cl?.nom || '?'} ({d.statut})</option>;
                })}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Numéro</Label>
                <Input value={numero} onChange={e => setNumero(e.target.value)} />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={dateCreation} onChange={e => setDateCreation(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Statut</Label>
                <select value={statut} onChange={e => setStatut(e.target.value as StatutCommandeClient)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  {allStatuts.map(s => <option key={s} value={s}>{STATUTS_COMMANDE_CLIENT[s].label}</option>)}
                </select>
              </div>
              <div>
                <Label>Réf. Affaire</Label>
                <Input value={referenceAffaire} onChange={e => setReferenceAffaire(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Frais de port HT</Label>
              <Input type="number" step="0.01" value={fraisPortHT || ''} onChange={e => setFraisPortHT(parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Notes</Label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]" />
            </div>
            <Button onClick={save} className="w-full">{editingId ? 'Enregistrer' : 'Créer la commande'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewCommande} onOpenChange={() => setPreviewCommande(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Commande {previewCommande?.numero}
            </DialogTitle>
          </DialogHeader>
          {previewCommande && (() => {
            const client = clients.find(c => c.id === previewCommande.clientId);
            const statutInfo = STATUTS_COMMANDE_CLIENT[previewCommande.statut];
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Client :</span> <span className="font-medium">{client?.nom}</span></div>
                  <div><span className="text-muted-foreground">Société :</span> <span className="font-medium">{client?.societe || '—'}</span></div>
                  <div><span className="text-muted-foreground">Date :</span> <span className="font-medium">{formatDate(previewCommande.dateCreation)}</span></div>
                  <div><span className="text-muted-foreground">Statut :</span> <span className={`text-xs font-medium px-2 py-0.5 rounded ${statutInfo.color}`}>{statutInfo.label}</span></div>
                  {previewCommande.referenceAffaire && <div className="col-span-2"><span className="text-muted-foreground">Réf. Affaire :</span> <span className="font-medium">{previewCommande.referenceAffaire}</span></div>}
                </div>
                {previewCommande.lignes.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold mb-2">Lignes</p>
                    <div className="border border-border rounded-md overflow-hidden">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-muted/50 border-b border-border">
                          <th className="text-left py-2 px-3">Description</th>
                          <th className="text-right py-2 px-3">Qté</th>
                          <th className="text-right py-2 px-3">PU HT</th>
                          <th className="text-right py-2 px-3">Total HT</th>
                        </tr></thead>
                        <tbody>
                          {previewCommande.lignes.map((l, i) => {
                            const t = calculerTotalLigne(l);
                            return (
                              <tr key={i} className="border-b border-border/50">
                                <td className="py-1.5 px-3">{l.description}</td>
                                <td className="py-1.5 px-3 text-right">{l.quantite}</td>
                                <td className="py-1.5 px-3 text-right">{formatMontant(l.prixUnitaireHT)}</td>
                                <td className="py-1.5 px-3 text-right">{formatMontant(t.totalHT)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="border-t border-border pt-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Total HT</span><span className="font-medium">{formatMontant(previewCommande.totalHT)}</span></div>
                  {previewCommande.fraisPortHT > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Frais de port</span><span>{formatMontant(previewCommande.fraisPortHT)}</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">TVA</span><span>{formatMontant(previewCommande.totalTVA)}</span></div>
                  <div className="flex justify-between text-base font-bold"><span>Total TTC</span><span>{formatMontant(previewCommande.totalTTC)}</span></div>
                </div>
                {previewCommande.notes && <div className="text-xs text-muted-foreground bg-muted p-2 rounded">{previewCommande.notes}</div>}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette commande ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
