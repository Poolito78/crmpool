import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useCRM } from '@/lib/StoreContext';
import { type CommandeFournisseur, type LigneReception, formatMontant, formatDate } from '@/lib/store';
import { ShoppingCart, CheckCircle, Clock, Package, Trash2, Search, Pencil, Eye, Mail, FileText, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { logHistorique } from '@/lib/historique';
import CommandeFournisseurEditDialog from '@/components/CommandeFournisseurEditDialog';
import CommandeFournisseurPreviewDialog from '@/components/CommandeFournisseurPreviewDialog';
import CommandeEmailDialog from '@/components/CommandeEmailDialog';
import ReceptionCommandeDialog from '@/components/ReceptionCommandeDialog';

const statutConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  en_attente: { label: 'En attente', color: 'bg-warning/10 text-warning', icon: Clock },
  passee: { label: 'Passée', color: 'bg-info/10 text-info', icon: ShoppingCart },
  recue: { label: 'Reçue', color: 'bg-success/10 text-success', icon: CheckCircle },
  payee: { label: 'Payée', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle },
};

export default function Commandes() {
  const navigate = useNavigate();
  const { commandesFournisseur, updateCommandesFournisseur, fournisseurs, devis, produits, commandesClient } = useCRM();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [filterStatut, setFilterStatut] = useState<string>('tous');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editCommande, setEditCommande] = useState<CommandeFournisseur | null>(null);
  const [previewCommande, setPreviewCommande] = useState<CommandeFournisseur | null>(null);
  const [emailTarget, setEmailTarget] = useState<any>(null);
  const [receptionCommande, setReceptionCommande] = useState<CommandeFournisseur | null>(null);

  const filtered = commandesFournisseur
    .filter(cf => {
      const fourn = fournisseurs.find(f => f.id === cf.fournisseurId);
      const dv = devis.find(d => d.id === cf.devisId);
      const matchSearch = [cf.numero, fourn?.societe, fourn?.nom, dv?.numero].some(v => v?.toLowerCase().includes(search.toLowerCase()));
      if (!matchSearch) return false;
      if (filterStatut !== 'tous' && cf.statut !== filterStatut) return false;
      return true;
    })
    .sort((a, b) => new Date(b.dateCreation).getTime() - new Date(a.dateCreation).getTime());

  function updateStatut(id: string, statut: CommandeFournisseur['statut']) {
    const cf = commandesFournisseur.find(c => c.id === id);
    if (statut === 'recue') {
      if (cf) { setReceptionCommande(cf); return; }
    }
    updateCommandesFournisseur(prev => prev.map(c => c.id === id ? { ...c, statut } : c));
    toast.success('Statut mis à jour');
    logHistorique({ entiteType: 'commande_fournisseur', entiteId: id, entiteNumero: cf?.numero ?? id, action: 'statut', details: { ancienStatut: cf?.statut, nouveauStatut: statut, fournisseur: fournisseurs.find(f => f.id === cf?.fournisseurId)?.societe } });
  }

  function handleReception(data: { dateReception: string; dateLivraisonClientPrevue: string; dateEcheance: string; lignesRecues: LigneReception[] }) {
    if (!receptionCommande) return;
    updateCommandesFournisseur(prev => prev.map(cf =>
      cf.id === receptionCommande.id
        ? { ...cf, statut: 'recue' as const, ...data }
        : cf
    ));
    logHistorique({ entiteType: 'commande_fournisseur', entiteId: receptionCommande.id, entiteNumero: receptionCommande.numero, action: 'reception', details: { dateReception: data.dateReception, dateLivraisonClientPrevue: data.dateLivraisonClientPrevue, dateEcheance: data.dateEcheance, fournisseur: fournisseurs.find(f => f.id === receptionCommande.fournisseurId)?.societe } });
    setReceptionCommande(null);
    toast.success('Réception enregistrée');
  }

  function handleDelete() {
    if (!deleteId) return;
    const cf = commandesFournisseur.find(c => c.id === deleteId);
    updateCommandesFournisseur(prev => prev.filter(c => c.id !== deleteId));
    logHistorique({ entiteType: 'commande_fournisseur', entiteId: deleteId, entiteNumero: cf?.numero ?? deleteId, action: 'suppression' });
    setDeleteId(null);
    toast.success('Commande supprimée');
  }

  function handleSaveEdit(updated: CommandeFournisseur) {
    updateCommandesFournisseur(prev => prev.map(cf => cf.id === updated.id ? updated : cf));
  }

  function openEmail(cf: CommandeFournisseur) {
    const fourn = fournisseurs.find(f => f.id === cf.fournisseurId);
    if (!fourn) { toast.error('Fournisseur introuvable'); return; }
    setEmailTarget({ type: 'fournisseur', commande: cf, contact: fourn });
  }

  const stats = {
    enAttente: commandesFournisseur.filter(c => c.statut === 'en_attente').length,
    passees: commandesFournisseur.filter(c => c.statut === 'passee').length,
    recues: commandesFournisseur.filter(c => c.statut === 'recue').length,
    totalEnCours: commandesFournisseur.filter(c => c.statut !== 'recue' && c.statut !== 'payee').reduce((s, c) => s + c.totalTTC, 0),
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card text-center">
          <Clock className="w-5 h-5 mx-auto text-warning mb-1" />
          <p className="text-2xl font-heading font-bold">{stats.enAttente}</p>
          <p className="text-xs text-muted-foreground">En attente</p>
        </div>
        <div className="stat-card text-center">
          <ShoppingCart className="w-5 h-5 mx-auto text-info mb-1" />
          <p className="text-2xl font-heading font-bold">{stats.passees}</p>
          <p className="text-xs text-muted-foreground">Passées</p>
        </div>
        <div className="stat-card text-center">
          <CheckCircle className="w-5 h-5 mx-auto text-success mb-1" />
          <p className="text-2xl font-heading font-bold">{stats.recues}</p>
          <p className="text-xs text-muted-foreground">Reçues</p>
        </div>
        <div className="stat-card text-center">
          <Package className="w-5 h-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-heading font-bold">{formatMontant(stats.totalEnCours)}</p>
          <p className="text-xs text-muted-foreground">En cours</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} className="text-sm rounded-md border border-input bg-background px-3 py-1.5">
          <option value="tous">Tous les statuts</option>
          <option value="en_attente">En attente</option>
          <option value="passee">Passée</option>
          <option value="recue">Reçue</option>
          <option value="payee">Payée</option>
        </select>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.map(cf => {
          const fourn = fournisseurs.find(f => f.id === cf.fournisseurId);
          const dv = devis.find(d => d.id === cf.devisId);
          const ccLies = cf.devisId ? commandesClient.filter(cc => cc.devisId === cf.devisId) : [];
          const config = statutConfig[cf.statut] || statutConfig.en_attente;
          const lignes = Array.isArray(cf.lignes) ? cf.lignes : [];

          return (
            <div key={cf.id} className="bg-card rounded-xl border border-border p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setPreviewCommande(cf)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-heading font-semibold">{cf.numero}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.color}`}>{config.label}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {fourn?.societe || fourn?.nom || '—'} • {formatDate(cf.dateCreation)}
                  </p>
                  {(dv || ccLies.length > 0) && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {dv && (
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/devis?search=${encodeURIComponent(dv.numero)}`); }}
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium hover:bg-success/20 transition-colors"
                        >
                          <FileText className="w-3 h-3" />
                          {dv.numero}
                        </button>
                      )}
                      {ccLies.map(cc => (
                        <button
                          key={cc.id}
                          onClick={e => { e.stopPropagation(); navigate(`/commandes-client?search=${encodeURIComponent(cc.numero)}`); }}
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
                        >
                          <ShoppingCart className="w-3 h-3" />
                          {cc.numero}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {lignes.length} produit{lignes.length > 1 ? 's' : ''} : {lignes.map(l => `${l.description} (×${l.quantite})`).join(', ')}
                  </p>
                  {cf.statut === 'recue' && (
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {cf.dateReception && (
                        <span className="text-xs text-success">Reçu le {formatDate(cf.dateReception)}</span>
                      )}
                      {cf.dateLivraisonClientPrevue && (
                        <span className="text-xs text-muted-foreground">• Livraison client : {formatDate(cf.dateLivraisonClientPrevue)}</span>
                      )}
                      {cf.dateEcheance && (
                        <span className="text-xs text-muted-foreground">• Règlement : {formatDate(cf.dateEcheance)}</span>
                      )}
                      {cf.lignesRecues && cf.lignesRecues.some(l => l.quantiteRecue < l.quantiteCommandee) && (
                        <span className="text-xs text-warning font-medium">⚠ Livraison incomplète</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-heading font-bold text-lg">{formatMontant(cf.totalTTC)}</p>
                    <p className="text-xs text-muted-foreground">
                      {cf.fraisTransport > 0 ? `dont ${formatMontant(cf.fraisTransport)} transport` : 'Franco'}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <select
                      className="text-xs rounded border border-input bg-background px-2 py-1"
                      value={cf.statut}
                      onChange={e => updateStatut(cf.id, e.target.value as CommandeFournisseur['statut'])}
                    >
                      <option value="en_attente">En attente</option>
                      <option value="passee">Passée</option>
                      <option value="recue">Reçue</option>
                      <option value="payee">Payée</option>
                    </select>
                    <button onClick={() => setPreviewCommande(cf)} className="p-1.5 rounded-md hover:bg-muted" title="Aperçu">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => setEditCommande(cf)} className="p-1.5 rounded-md hover:bg-muted" title="Modifier">
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => openEmail(cf)} className="p-1.5 rounded-md hover:bg-muted" title="Envoyer par email">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => navigate(`/factures-fournisseur?cf=${cf.id}`)} className="p-1.5 rounded-md hover:bg-muted" title="Saisir facture fournisseur">
                      <Receipt className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => setDeleteId(cf.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive" title="Supprimer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-center py-8 text-muted-foreground">Aucune commande fournisseur</p>}
      </div>

      {/* Edit Dialog */}
      <CommandeFournisseurEditDialog
        open={!!editCommande}
        onOpenChange={open => { if (!open) setEditCommande(null); }}
        commande={editCommande}
        fournisseurs={fournisseurs}
        produits={produits}
        onSave={handleSaveEdit}
      />

      {/* Preview Dialog */}
      <CommandeFournisseurPreviewDialog
        open={!!previewCommande}
        onOpenChange={open => { if (!open) setPreviewCommande(null); }}
        commande={previewCommande}
        fournisseur={previewCommande ? fournisseurs.find(f => f.id === previewCommande.fournisseurId) : undefined}
        onEdit={() => {
          if (previewCommande) {
            setEditCommande(previewCommande);
            setPreviewCommande(null);
          }
        }}
        onEmail={() => {
          if (previewCommande) {
            openEmail(previewCommande);
            setPreviewCommande(null);
          }
        }}
      />

      {/* Reception Dialog */}
      <ReceptionCommandeDialog
        open={!!receptionCommande}
        onOpenChange={open => { if (!open) setReceptionCommande(null); }}
        commande={receptionCommande}
        fournisseur={receptionCommande ? fournisseurs.find(f => f.id === receptionCommande.fournisseurId) : undefined}
        onConfirm={handleReception}
      />

      {/* Email Dialog */}
      <CommandeEmailDialog
        open={!!emailTarget}
        onOpenChange={open => { if (!open) setEmailTarget(null); }}
        target={emailTarget}
      />

      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette commande ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
