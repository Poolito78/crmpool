import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type CommandeFournisseur, type Fournisseur, type Produit, formatMontant } from '@/lib/store';
import { toast } from 'sonner';
import ProduitCombobox from '@/components/ProduitCombobox';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commande: CommandeFournisseur | null;
  fournisseurs: Fournisseur[];
  produits: Produit[];
  onSave: (updated: CommandeFournisseur) => void;
}

export default function CommandeFournisseurEditDialog({ open, onOpenChange, commande, fournisseurs, produits, onSave }: Props) {
  const [numero, setNumero] = useState('');
  const [dateCreation, setDateCreation] = useState('');
  const [fournisseurId, setFournisseurId] = useState('');
  const [statut, setStatut] = useState<CommandeFournisseur['statut']>('en_attente');
  const [notes, setNotes] = useState('');
  const [fraisTransport, setFraisTransport] = useState(0);
  const [dateEcheance, setDateEcheance] = useState('');
  const [lignes, setLignes] = useState<CommandeFournisseur['lignes']>([]);

  useEffect(() => {
    if (!commande || !open) return;
    setNumero(commande.numero);
    setDateCreation(commande.dateCreation);
    setFournisseurId(commande.fournisseurId);
    setStatut(commande.statut);
    setNotes(commande.notes || '');
    setFraisTransport(commande.fraisTransport);
    setDateEcheance(commande.dateEcheance || '');
    setLignes([...(Array.isArray(commande.lignes) ? commande.lignes : [])]);
  }, [commande, open]);

  function updateLigne(index: number, field: string, value: any) {
    setLignes(prev => prev.map((l, i) => {
      if (i !== index) return l;
      const updated = { ...l, [field]: value };
      if (field === 'quantite' || field === 'prixAchat') {
        updated.total = (field === 'quantite' ? value : l.prixAchat) * (field === 'prixAchat' ? value : l.quantite);
      }
      return updated;
    }));
  }

  function addLigne() {
    setLignes(prev => [...prev, { produitId: '', description: '', reference: '', quantite: 1, prixAchat: 0, total: 0 }]);
  }

  function removeLigne(index: number) {
    setLignes(prev => prev.filter((_, i) => i !== index));
  }

  function selectProduit(index: number, produitId: string) {
    const p = produits.find(pr => pr.id === produitId);
    if (!p) return;
    setLignes(prev => prev.map((l, i) => i !== index ? l : {
      ...l,
      produitId: p.id,
      description: p.description,
      reference: p.reference,
      prixAchat: p.prixAchat,
      total: p.prixAchat * l.quantite,
    }));
  }

  function handleSave() {
    if (!commande) return;
    if (!fournisseurId) { toast.error('Sélectionnez un fournisseur'); return; }
    const totalHT = lignes.reduce((s, l) => s + (l.prixAchat * l.quantite), 0);
    onSave({
      ...commande,
      numero,
      dateCreation,
      fournisseurId,
      statut,
      notes: notes || undefined,
      fraisTransport,
      dateEcheance: dateEcheance || undefined,
      lignes,
      totalHT,
      totalTTC: totalHT + fraisTransport,
    });
    toast.success('Commande fournisseur modifiée');
    onOpenChange(false);
  }

  if (!commande) return null;
  const totalHT = lignes.reduce((s, l) => s + l.prixAchat * l.quantite, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullscreen className="sm:w-[92vw] sm:max-w-[92vw] sm:max-h-[92vh] overflow-y-auto flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5" /> Modifier — {commande.numero}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 overflow-y-auto pb-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <Label>Numéro</Label>
              <Input value={numero} onChange={e => setNumero(e.target.value)} />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={dateCreation} onChange={e => setDateCreation(e.target.value)} />
            </div>
            <div>
              <Label>Statut</Label>
              <select value={statut} onChange={e => setStatut(e.target.value as any)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="en_attente">En attente</option>
                <option value="passee">Passée</option>
                <option value="recue">Reçue</option>
                <option value="payee">Payée</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fournisseur</Label>
              <select value={fournisseurId} onChange={e => setFournisseurId(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— Sélectionner —</option>
                {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.societe || f.nom}</option>)}
              </select>
            </div>
            <div>
              <Label>Date de livraison</Label>
              <Input type="date" value={dateEcheance} onChange={e => setDateEcheance(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold">Lignes de commande</Label>
              <Button variant="outline" size="sm" onClick={addLigne}><Plus className="w-3 h-3 mr-1" />Ajouter</Button>
            </div>
            <div className="space-y-2">
              {lignes.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end border border-border rounded-lg p-2">
                  <div className="col-span-12 sm:col-span-4">
                    <Label className="text-xs">Produit</Label>
                    <ProduitCombobox produits={produits} value={l.produitId} onSelect={id => selectProduit(i, id)} />
                  </div>
                  <div className="col-span-5 sm:col-span-3">
                    <Label className="text-xs">Description</Label>
                    <Input value={l.description} onChange={e => updateLigne(i, 'description', e.target.value)} className="text-xs" />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label className="text-xs">Qté</Label>
                    <Input type="number" min={1} value={l.quantite} onChange={e => updateLigne(i, 'quantite', parseInt(e.target.value) || 1)} className="text-xs" />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <Label className="text-xs">P.U. Achat</Label>
                    <Input type="number" step="0.01" value={l.prixAchat} onChange={e => updateLigne(i, 'prixAchat', parseFloat(e.target.value) || 0)} className="text-xs" />
                  </div>
                  <div className="col-span-1 sm:col-span-1 text-right text-xs font-medium pt-5">
                    {formatMontant(l.prixAchat * l.quantite)}
                  </div>
                  <div className="col-span-1 flex justify-end pt-5">
                    <button onClick={() => removeLigne(i)} className="p-1 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Frais de transport</Label>
              <Input type="number" step="0.01" value={fraisTransport || ''} onChange={e => setFraisTransport(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="flex items-end">
              <div className="w-full text-right space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Total HT</span><span className="font-medium">{formatMontant(totalHT)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Transport</span><span>{formatMontant(fraisTransport)}</span></div>
                <div className="flex justify-between border-t border-border pt-1 font-bold"><span>Total TTC</span><span>{formatMontant(totalHT + fraisTransport)}</span></div>
              </div>
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]" />
          </div>

        </div>

        {/* Footer sticky */}
        <div className="sticky bottom-0 bg-background border-t border-border pt-3 pb-1 mt-2 shrink-0">
          <Button onClick={handleSave} className="w-full">Enregistrer les modifications</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
