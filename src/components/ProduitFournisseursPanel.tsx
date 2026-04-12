import { useState } from 'react';
import { useCRM } from '@/lib/StoreContext';
import { generateId, formatMontant, calculerFournisseurPrioritaire, type ProduitFournisseur } from '@/lib/store';
import { Plus, Trash2, Star, Truck, Clock, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface Props {
  produitId: string;
  qteCommande?: number;
}

export default function ProduitFournisseursPanel({ produitId, qteCommande = 1 }: Props) {
  const { fournisseurs, produits, updateProduits, produitFournisseurs, updateProduitFournisseurs } = useCRM();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ fournisseurId: '', referenceFournisseur: '', delaiLivraison: 0, conditionnementMin: 1 });

  const produit = produits.find(p => p.id === produitId);
  const pfs = produitFournisseurs.filter(pf => pf.produitId === produitId);
  const prioritaire = calculerFournisseurPrioritaire(produitId, qteCommande, produitFournisseurs, fournisseurs);
  const availableFournisseurs = fournisseurs.filter(f => !pfs.some(pf => pf.fournisseurId === f.id));

  const prixAchatConditionne = produit?.prixAchat ?? 0;

  function updatePrixAchat(newPrix: number) {
    updateProduits(prev => prev.map(p => p.id === produitId ? { ...p, prixAchat: newPrix } : p));
    updateProduitFournisseurs(prev => prev.map(pf => pf.produitId === produitId ? { ...pf, prixAchat: newPrix } : pf));
  }

  function addFournisseur() {
    if (!form.fournisseurId) { toast.error('Sélectionnez un fournisseur'); return; }
    const newPf: ProduitFournisseur = {
      id: generateId(),
      produitId,
      fournisseurId: form.fournisseurId,
      prixAchat: prixAchatConditionne,
      referenceFournisseur: form.referenceFournisseur,
      delaiLivraison: form.delaiLivraison,
      conditionnementMin: form.conditionnementMin,
      estPrioritaire: false,
    };
    updateProduitFournisseurs(prev => [...prev, newPf]);
    setForm({ fournisseurId: '', referenceFournisseur: '', delaiLivraison: 0, conditionnementMin: 1 });
    setAdding(false);
    toast.success('Fournisseur ajouté');
  }

  function removePf(id: string) {
    updateProduitFournisseurs(prev => prev.filter(pf => pf.id !== id));
    toast.success('Fournisseur retiré');
  }

  function updatePf(id: string, updates: Partial<ProduitFournisseur>) {
    updateProduitFournisseurs(prev => prev.map(pf => pf.id === id ? { ...pf, ...updates } : pf));
  }

  function getCoutGlobal(pf: ProduitFournisseur) {
    const fourn = fournisseurs.find(f => f.id === pf.fournisseurId);
    if (!fourn) return null;
    const qte = Math.max(qteCommande, pf.conditionnementMin);
    const totalAchat = prixAchatConditionne * qte;
    const transport = totalAchat >= fourn.francoPort ? 0 : fourn.coutTransport;
    return { totalAchat, transport, coutUnitaire: (totalAchat + transport) / qte, qte, francoAtteint: totalAchat >= fourn.francoPort };
  }

  return (
    <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Truck className="w-4 h-4" /> Fournisseurs ({pfs.length})
        </p>
        {availableFournisseurs.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="w-3 h-3 mr-1" /> Ajouter
          </Button>
        )}
      </div>

      {/* Prix achat conditionné commun à tous les fournisseurs */}
      <div className="flex items-center gap-3 bg-muted/40 rounded-md px-3 py-2">
        <Label className="text-xs shrink-0">Prix achat conditionné</Label>
        <Input
          type="number"
          step="0.01"
          value={prixAchatConditionne}
          onChange={e => updatePrixAchat(parseFloat(e.target.value) || 0)}
          className="h-7 text-xs w-28 font-semibold"
        />
        <span className="text-xs text-muted-foreground">Commun à tous les fournisseurs</span>
      </div>

      {pfs.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground text-center py-2">Aucun fournisseur associé</p>
      )}

      {pfs.map(pf => {
        const fourn = fournisseurs.find(f => f.id === pf.fournisseurId);
        const isPrio = prioritaire?.id === pf.id;
        const cost = getCoutGlobal(pf);
        return (
          <div key={pf.id} className={`border rounded-lg p-3 space-y-2 ${isPrio ? 'border-primary bg-primary/5' : 'border-border'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isPrio && <Star className="w-4 h-4 text-primary fill-primary" />}
                <span className="text-sm font-medium">{fourn?.societe || 'Inconnu'}</span>
                {isPrio && <span className="text-xs text-primary font-medium">Prioritaire</span>}
              </div>
              <button onClick={() => removePf(pf.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Réf. fournisseur</Label>
                <Input value={pf.referenceFournisseur}
                  onChange={e => updatePf(pf.id, { referenceFournisseur: e.target.value })}
                  className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> Délai (j)</Label>
                <Input type="number" value={pf.delaiLivraison}
                  onChange={e => updatePf(pf.id, { delaiLivraison: parseInt(e.target.value) || 0 })}
                  className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1"><Package className="w-3 h-3" /> Cond. min</Label>
                <Input type="number" step="0.01" value={pf.conditionnementMin}
                  onChange={e => updatePf(pf.id, { conditionnementMin: parseFloat(e.target.value) || 1 })}
                  className="h-8 text-xs" />
              </div>
            </div>
            {cost && (
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>Qté: {cost.qte}</span>
                <span>Achat: {formatMontant(cost.totalAchat)}</span>
                <span className={cost.francoAtteint ? 'text-success' : 'text-warning'}>
                  Transport: {cost.francoAtteint ? 'Gratuit' : formatMontant(cost.transport)}
                </span>
                <span className="font-medium text-foreground">Coût unitaire: {formatMontant(cost.coutUnitaire)}</span>
              </div>
            )}
          </div>
        );
      })}

      {adding && (
        <div className="border border-dashed border-primary/50 rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label className="text-xs">Fournisseur</Label>
              <select
                value={form.fournisseurId}
                onChange={e => setForm(p => ({ ...p, fournisseurId: e.target.value }))}
                className="w-full h-8 text-xs rounded border border-input bg-background px-2"
              >
                <option value="">— Sélectionner —</option>
                {availableFournisseurs.map(f => (
                  <option key={f.id} value={f.id}>{f.societe}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Réf. fournisseur</Label>
              <Input value={form.referenceFournisseur}
                onChange={e => setForm(p => ({ ...p, referenceFournisseur: e.target.value }))}
                className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Délai (jours)</Label>
              <Input type="number" value={form.delaiLivraison}
                onChange={e => setForm(p => ({ ...p, delaiLivraison: parseInt(e.target.value) || 0 }))}}
                className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Cond. minimum</Label>
              <Input type="number" step="0.01" value={form.conditionnementMin}
                onChange={e => setForm(p => ({ ...p, conditionnementMin: parseFloat(e.target.value) || 1 }))}
                className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setAdding(false)}>Annuler</Button>
            <Button size="sm" onClick={addFournisseur}>Ajouter</Button>
          </div>
        </div>
      )}
    </div>
  );
}
