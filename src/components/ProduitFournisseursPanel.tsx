import { useState } from 'react';
import { useCRM } from '@/lib/StoreContext';
import { generateId, formatMontant, calculerFournisseurPrioritaire, getPfPrixPourQuantite, type ProduitFournisseur, type PrixPalier } from '@/lib/store';
import { Plus, Trash2, Star, Truck, Clock, Package, ChevronDown, ChevronUp, TrendingDown } from 'lucide-react';
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
  const [expandedPaliers, setExpandedPaliers] = useState<Set<string>>(new Set());

  const produit = produits.find(p => p.id === produitId);
  const pfs = produitFournisseurs.filter(pf => pf.produitId === produitId);
  const prioritaire = calculerFournisseurPrioritaire(produitId, qteCommande, produitFournisseurs, fournisseurs);
  const availableFournisseurs = fournisseurs.filter(f => !pfs.some(pf => pf.fournisseurId === f.id));

  const prixAchatConditionne = produit?.prixAchat ?? 0;

  /** Met à jour uniquement le prix de référence du produit (utilisé dans devis/comparatif) */
  function updatePrixAchatProduit(newPrix: number) {
    updateProduits(prev => prev.map(p => p.id === produitId ? { ...p, prixAchat: newPrix } : p));
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
    const prixEffectif = getPfPrixPourQuantite(pf, qte);
    const totalAchat = prixEffectif * qte;
    const transport = totalAchat >= fourn.francoPort ? 0 : fourn.coutTransport;
    return {
      totalAchat,
      transport,
      coutUnitaire: (totalAchat + transport) / qte,
      qte,
      francoAtteint: totalAchat >= fourn.francoPort,
      prixEffectif,
      hasPalierActif: prixEffectif !== pf.prixAchat,
    };
  }

  function togglePaliers(pfId: string) {
    setExpandedPaliers(prev => {
      const next = new Set(prev);
      if (next.has(pfId)) next.delete(pfId); else next.add(pfId);
      return next;
    });
  }

  function addPalier(pfId: string) {
    updateProduitFournisseurs(prev => prev.map(pf => {
      if (pf.id !== pfId) return pf;
      const paliers = [...(pf.paliersFournisseur || [])];
      const maxQte = paliers.length > 0 ? Math.max(...paliers.map(p => p.qteMin)) : 0;
      const newPalier: PrixPalier = { qteMin: maxQte + 10, prixAchat: pf.prixAchat };
      return { ...pf, paliersFournisseur: [...paliers, newPalier] };
    }));
    // Auto-expand si pas encore ouvert
    setExpandedPaliers(prev => { const n = new Set(prev); n.add(pfId); return n; });
  }

  function updatePalier(pfId: string, idx: number, field: keyof PrixPalier, value: number) {
    updateProduitFournisseurs(prev => prev.map(pf => {
      if (pf.id !== pfId) return pf;
      const paliers = [...(pf.paliersFournisseur || [])];
      paliers[idx] = { ...paliers[idx], [field]: value };
      return { ...pf, paliersFournisseur: paliers };
    }));
  }

  function removePalier(pfId: string, idx: number) {
    updateProduitFournisseurs(prev => prev.map(pf => {
      if (pf.id !== pfId) return pf;
      const paliers = (pf.paliersFournisseur || []).filter((_, i) => i !== idx);
      return { ...pf, paliersFournisseur: paliers.length > 0 ? paliers : undefined };
    }));
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

      {/* Prix achat conditionné — référence produit pour devis/comparatif */}
      <div className="flex items-center gap-3 bg-muted/40 rounded-md px-3 py-2">
        <Label className="text-xs shrink-0">Prix achat conditionné</Label>
        <Input
          type="number"
          step="0.01"
          value={prixAchatConditionne}
          onChange={e => updatePrixAchatProduit(parseFloat(e.target.value) || 0)}
          className="h-7 text-xs w-28 font-semibold"
        />
        <span className="text-xs text-muted-foreground">Référence pour devis / comparatif</span>
      </div>

      {pfs.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground text-center py-2">Aucun fournisseur associé</p>
      )}

      {pfs.map(pf => {
        const fourn = fournisseurs.find(f => f.id === pf.fournisseurId);
        const isPrio = prioritaire?.id === pf.id;
        const cost = getCoutGlobal(pf);
        const paliers = pf.paliersFournisseur || [];
        const showPaliers = expandedPaliers.has(pf.id);

        return (
          <div key={pf.id} className={`border rounded-lg p-3 space-y-2 ${isPrio ? 'border-primary bg-primary/5' : 'border-border'}`}>
            {/* Header fournisseur */}
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

            {/* Champs principaux */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
              <div>
                <Label className="text-xs">
                  Prix achat {paliers.length > 0 && <span className="text-muted-foreground">(base)</span>}
                </Label>
                <Input
                  type="number" step="0.01"
                  value={pf.prixAchat}
                  onChange={e => updatePf(pf.id, { prixAchat: parseFloat(e.target.value) || 0 })}
                  className="h-8 text-xs font-semibold"
                  title={paliers.length > 0 ? 'Prix de base — les paliers dégressifs prennent le relais selon la quantité' : 'Prix achat unitaire'}
                />
              </div>
            </div>

            {/* Section tarifs dégressifs */}
            <div className="border-t border-border/50 pt-2">
              <button
                type="button"
                onClick={() => togglePaliers(pf.id)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <TrendingDown className="w-3 h-3" />
                Tarifs dégressifs
                {paliers.length > 0 && (
                  <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-1.5 py-0 text-[10px] font-medium">
                    {paliers.length} palier{paliers.length > 1 ? 's' : ''}
                  </span>
                )}
                {showPaliers ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
              </button>

              {showPaliers && (
                <div className="mt-2 space-y-1.5">
                  {paliers.length > 0 && (
                    <div className="grid grid-cols-[90px_1fr_auto] gap-1 text-[10px] text-muted-foreground px-1 pb-0.5">
                      <span>Qté min</span>
                      <span>Prix achat (€)</span>
                      <span />
                    </div>
                  )}
                  {paliers.map((palier, idx) => (
                    <div key={idx} className="grid grid-cols-[90px_1fr_auto] gap-1 items-center">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground shrink-0">≥</span>
                        <Input
                          type="number" min={1} step={1}
                          value={palier.qteMin}
                          onChange={e => updatePalier(pf.id, idx, 'qteMin', parseInt(e.target.value) || 1)}
                          className="h-7 text-xs"
                        />
                      </div>
                      <Input
                        type="number" min={0} step={0.01}
                        value={palier.prixAchat}
                        onChange={e => updatePalier(pf.id, idx, 'prixAchat', parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs"
                      />
                      <button type="button" onClick={() => removePalier(pf.id, idx)}
                        className="p-1 text-destructive hover:bg-destructive/10 rounded">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => addPalier(pf.id)} className="h-7 text-xs w-full">
                    <Plus className="w-3 h-3 mr-1" /> Ajouter un palier
                  </Button>
                  {paliers.length > 0 && (
                    <p className="text-[10px] text-muted-foreground px-1">
                      Prix de base appliqué si la quantité est inférieure à tous les paliers.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Résumé coût */}
            {cost && (
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground border-t border-border/50 pt-2 mt-1">
                <span>Qté: {cost.qte}</span>
                {cost.hasPalierActif && (
                  <span className="text-primary font-medium">Palier actif: {formatMontant(cost.prixEffectif)}/u</span>
                )}
                <span>Achat: {formatMontant(cost.totalAchat)}</span>
                <span className={cost.francoAtteint ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-500'}>
                  Transport: {cost.francoAtteint ? 'Gratuit' : formatMontant(cost.transport)}
                </span>
                <span className="font-medium text-foreground">Coût unitaire: {formatMontant(cost.coutUnitaire)}</span>
              </div>
            )}
          </div>
        );
      })}

      {/* Formulaire ajout fournisseur */}
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
                onChange={e => setForm(p => ({ ...p, delaiLivraison: parseInt(e.target.value) || 0 }))}
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
