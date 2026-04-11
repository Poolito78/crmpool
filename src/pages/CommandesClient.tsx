import { useState } from 'react';
import { useCRM } from '@/lib/StoreContext';
import { generateId, calculerTotalDevis, calculerTotalLigne, formatMontant, formatDate, STATUTS_COMMANDE_CLIENT, type CommandeClient, type StatutCommandeClient, type LigneDevis } from '@/lib/store';
import { Plus, Search, Trash2, Pencil, Eye, FileText, ShoppingCart, Send, Receipt, CalendarDays, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import ClientCombobox from '@/components/ClientCombobox';
import CommandeFournisseurDialog from '@/components/CommandeFournisseurDialog';
import CommandeEmailDialog from '@/components/CommandeEmailDialog';
const allStatuts = Object.keys(STATUTS_COMMANDE_CLIENT) as StatutCommandeClient[];

export default function CommandesClient() {
  const { commandesClient, updateCommandesClient, clients, devis, produits, fournisseurs, produitFournisseurs, commandesFournisseur, updateCommandesFournisseur } = useCRM();
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState<string>('tous');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [previewCommande, setPreviewCommande] = useState<CommandeClient | null>(null);

  // AR Dialog state
  const [arDialogOpen, setArDialogOpen] = useState(false);
  const [arCommande, setArCommande] = useState<CommandeClient | null>(null);
  const [arDateDepart, setArDateDepart] = useState('');
  const [arDateLivraison, setArDateLivraison] = useState('');

  // Facturer Dialog state
  const [factureDialogOpen, setFactureDialogOpen] = useState(false);
  const [factureCommande, setFactureCommande] = useState<CommandeClient | null>(null);
  const [factureLignesSelectees, setFactureLignesSelectees] = useState<string[]>([]);

  // Commande fournisseur dialog
  const [cmdFournisseurDevis, setCmdFournisseurDevis] = useState<any>(null);
  const [emailTarget, setEmailTarget] = useState<any>(null);

  // Form state
  const [clientId, setClientId] = useState('');
  const [devisId, setDevisId] = useState('');
  const [numero, setNumero] = useState('');
  const [dateCreation, setDateCreation] = useState(new Date().toISOString().split('T')[0]);
  const [statut, setStatut] = useState<StatutCommandeClient>('a_traiter');
  const [referenceAffaire, setReferenceAffaire] = useState('');
  const [notes, setNotes] = useState('');
  const [fraisPortHT, setFraisPortHT] = useState(0);

  function resetForm() {
    setClientId('');
    setDevisId('');
    setNumero(`CMD-${String(commandesClient.length + 1).padStart(4, '0')}`);
    setDateCreation(new Date().toISOString().split('T')[0]);
    setStatut('a_traiter');
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

  // ---- Action: Commande Fournisseur ----
  function openCmdFournisseur(cmd: CommandeClient) {
    if (!cmd.devisId) {
      toast.error('Aucun devis associé à cette commande');
      return;
    }
    const linkedDevis = devis.find(d => d.id === cmd.devisId);
    if (!linkedDevis) {
      toast.error('Devis introuvable');
      return;
    }
    setCmdFournisseurDevis(linkedDevis);
  }

  function openEmailFacture(cmd: CommandeClient) {
    const client = clients.find(c => c.id === cmd.clientId);
    if (!client) { toast.error('Client introuvable'); return; }
    setEmailTarget({ type: 'facture', commande: cmd, contact: client });
  }

  // ---- Action: Envoi AR ----
  function openArDialog(cmd: CommandeClient) {
    setArCommande(cmd);
    setArDateDepart(cmd.dateDepart || new Date().toISOString().split('T')[0]);
    setArDateLivraison(cmd.dateLivraisonPrevue || '');
    setArDialogOpen(true);
  }

  function saveAr() {
    if (!arCommande) return;
    if (!arDateDepart) { toast.error('Renseignez la date de départ'); return; }
    if (!arDateLivraison) { toast.error('Renseignez la date de livraison prévue'); return; }
    updateCommandesClient(prev => prev.map(c => c.id === arCommande.id ? {
      ...c,
      statut: 'accuse_envoye' as StatutCommandeClient,
      dateDepart: arDateDepart,
      dateLivraisonPrevue: arDateLivraison,
    } : c));
    toast.success(`AR envoyé — départ ${formatDate(arDateDepart)}, livraison prévue ${formatDate(arDateLivraison)}`);
    setArDialogOpen(false);
    setArCommande(null);
  }

  // ---- Action: Facturer ----
  function openFactureDialog(cmd: CommandeClient) {
    setFactureCommande(cmd);
    setFactureLignesSelectees(cmd.lignes.map(l => l.id));
    setFactureDialogOpen(true);
  }

  function toggleLigneFacture(ligneId: string) {
    setFactureLignesSelectees(prev =>
      prev.includes(ligneId) ? prev.filter(id => id !== ligneId) : [...prev, ligneId]
    );
  }

  function saveFacture() {
    if (!factureCommande) return;
    if (factureLignesSelectees.length === 0) {
      toast.error('Sélectionnez au moins un produit à facturer');
      return;
    }
    updateCommandesClient(prev => prev.map(c => c.id === factureCommande.id ? {
      ...c, statut: 'facture' as StatutCommandeClient,
    } : c));
    toast.success(`Commande ${factureCommande.numero} marquée comme facturée (${factureLignesSelectees.length} produit(s))`);
    setFactureDialogOpen(false);
    setFactureCommande(null);
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
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
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
              <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Départ / Livraison</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Échéance</th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">Total TTC</th>
              <th className="text-center py-3 px-4 font-medium text-muted-foreground">Statut</th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(cmd => {
              const client = clients.find(c => c.id === cmd.clientId);
              const statutInfo = STATUTS_COMMANDE_CLIENT[cmd.statut];
              const isOverdue = cmd.dateEcheance && new Date(cmd.dateEcheance) < new Date() && cmd.statut === 'facture';
              return (
                <tr key={cmd.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs">{cmd.numero}</td>
                  <td className="py-3 px-4">
                    <div className="font-medium">{client?.nom || '—'}</div>
                    {client?.societe && <div className="text-xs text-muted-foreground">{client.societe}</div>}
                  </td>
                  <td className="py-3 px-4 hidden sm:table-cell text-muted-foreground">{cmd.referenceAffaire || '—'}</td>
                  <td className="py-3 px-4 hidden md:table-cell text-muted-foreground">{formatDate(cmd.dateCreation)}</td>
                  <td className="py-3 px-4 hidden lg:table-cell">
                    {cmd.dateDepart || cmd.dateLivraisonPrevue ? (
                      <div className="text-xs space-y-0.5">
                        {cmd.dateDepart && <div className="text-muted-foreground">Départ: <span className="font-medium text-foreground">{formatDate(cmd.dateDepart)}</span></div>}
                        {cmd.dateLivraisonPrevue && <div className="text-muted-foreground">Livr.: <span className="font-medium text-foreground">{formatDate(cmd.dateLivraisonPrevue)}</span></div>}
                      </div>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="py-3 px-4 hidden lg:table-cell">
                    {cmd.dateEcheance ? (
                      <span className={`text-xs font-medium ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {formatDate(cmd.dateEcheance)}
                        {isOverdue && <span className="block text-[10px]">Échu</span>}
                      </span>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
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
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      <button onClick={() => openCmdFournisseur(cmd)} className="p-1.5 rounded hover:bg-muted" title="Cmd Fournisseur">
                        <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => openArDialog(cmd)} className="p-1.5 rounded hover:bg-muted" title="Envoi AR + Dates">
                        <Send className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => openFactureDialog(cmd)} className="p-1.5 rounded hover:bg-muted" title="Facturer">
                        <Receipt className="w-4 h-4 text-muted-foreground" />
                      </button>
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
              <tr><td colSpan={9} className="py-12 text-center text-muted-foreground">Aucune commande client</td></tr>
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
              <ClientCombobox clients={clients} value={clientId} onSelect={setClientId} />
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

      {/* AR Dialog — Envoi accusé de réception avec dates */}
      <Dialog open={arDialogOpen} onOpenChange={setArDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              Envoi AR — {arCommande?.numero}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Confirmez l'envoi de l'accusé de réception avec les dates de départ et livraison prévues.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" />Date de départ</Label>
                <Input type="date" value={arDateDepart} onChange={e => setArDateDepart(e.target.value)} />
              </div>
              <div>
                <Label className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" />Livraison prévue</Label>
                <Input type="date" value={arDateLivraison} onChange={e => setArDateLivraison(e.target.value)} />
              </div>
            </div>
            {arCommande && arCommande.lignes.length > 0 && (
              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="bg-muted/50 border-b border-border">
                    <th className="text-left py-2 px-3">Description</th>
                    <th className="text-right py-2 px-3">Qté</th>
                    <th className="text-right py-2 px-3">Total HT</th>
                  </tr></thead>
                  <tbody>
                    {arCommande.lignes.map((l, i) => {
                      const t = calculerTotalLigne(l);
                      return (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-1.5 px-3">{l.description}</td>
                          <td className="py-1.5 px-3 text-right">{l.quantite}</td>
                          <td className="py-1.5 px-3 text-right">{formatMontant(t.totalHT)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setArDialogOpen(false)} className="flex-1">Annuler</Button>
              <Button onClick={saveAr} className="flex-1"><Send className="w-4 h-4 mr-1" />Envoyer AR</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Facturer Dialog */}
      <Dialog open={factureDialogOpen} onOpenChange={setFactureDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Facturer — {factureCommande?.numero}
            </DialogTitle>
          </DialogHeader>
          {factureCommande && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sélectionnez les produits livrés à facturer :
              </p>
              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="bg-muted/50 border-b border-border">
                    <th className="py-2 px-3 w-8"></th>
                    <th className="text-left py-2 px-3">Description</th>
                    <th className="text-right py-2 px-3">Qté</th>
                    <th className="text-right py-2 px-3">Total HT</th>
                  </tr></thead>
                  <tbody>
                    {factureCommande.lignes.map((l, i) => {
                      const t = calculerTotalLigne(l);
                      const checked = factureLignesSelectees.includes(l.id);
                      return (
                        <tr key={i} className={`border-b border-border/50 cursor-pointer hover:bg-muted/30 ${checked ? 'bg-primary/5' : ''}`} onClick={() => toggleLigneFacture(l.id)}>
                          <td className="py-1.5 px-3">
                            <Checkbox checked={checked} onCheckedChange={() => toggleLigneFacture(l.id)} />
                          </td>
                          <td className="py-1.5 px-3">{l.description}</td>
                          <td className="py-1.5 px-3 text-right">{l.quantite}</td>
                          <td className="py-1.5 px-3 text-right">{formatMontant(t.totalHT)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border pt-3 text-sm">
                <div className="flex justify-between font-medium">
                  <span>Total à facturer</span>
                  <span>{formatMontant(
                    factureCommande.lignes
                      .filter(l => factureLignesSelectees.includes(l.id))
                      .reduce((acc, l) => acc + calculerTotalLigne(l).totalHT, 0)
                  )}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setFactureDialogOpen(false)} className="flex-1">Annuler</Button>
                <Button onClick={saveFacture} className="flex-1"><Receipt className="w-4 h-4 mr-1" />Facturer</Button>
              </div>
            </div>
          )}
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
                  {previewCommande.dateDepart && <div><span className="text-muted-foreground">Départ :</span> <span className="font-medium">{formatDate(previewCommande.dateDepart)}</span></div>}
                  {previewCommande.dateLivraisonPrevue && <div><span className="text-muted-foreground">Livraison prévue :</span> <span className="font-medium">{formatDate(previewCommande.dateLivraisonPrevue)}</span></div>}
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

      {/* Commande Fournisseur Dialog */}
      <CommandeFournisseurDialog
        open={!!cmdFournisseurDevis}
        onOpenChange={(open) => { if (!open) setCmdFournisseurDevis(null); }}
        devis={cmdFournisseurDevis}
        produits={produits}
        fournisseurs={fournisseurs}
        produitFournisseurs={produitFournisseurs}
        onSaveCommandes={(commandes) => {
          updateCommandesFournisseur(prev => [...prev, ...commandes]);
        }}
      />

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
