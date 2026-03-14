import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useCRM } from '@/lib/StoreContext';
import { generateId, type LigneDevis, type Devis as DevisType } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Loader2, Check, AlertTriangle, X, Sparkles, Trash2, Plus } from 'lucide-react';
import ClientCombobox from '@/components/ClientCombobox';
import ProduitCombobox from '@/components/ProduitCombobox';

interface AnalysisLigne {
  produitId: string;
  produitMatch: string;
  quantite: number;
  confidence: 'high' | 'medium' | 'low';
}

interface AnalysisResult {
  clientId: string;
  clientMatch: string;
  referenceAffaire?: string;
  notes?: string;
  lignes: AnalysisLigne[];
}

const confidenceColors: Record<string, string> = {
  high: 'bg-success/10 text-success',
  medium: 'bg-warning/10 text-warning',
  low: 'bg-destructive/10 text-destructive',
};

const confidenceLabels: Record<string, string> = {
  high: 'Sûr',
  medium: 'Probable',
  low: 'Incertain',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDevisCreated: (devisId: string) => void;
}

export default function EmailAnalyzerDialog({ open, onOpenChange, onDevisCreated }: Props) {
  const { clients, produits, devis, updateDevis } = useCRM();
  const [emailText, setEmailText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  async function analyze() {
    if (!emailText.trim()) {
      toast.error('Collez un texte à analyser');
      return;
    }
    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-email', {
        body: {
          emailText: emailText.trim(),
          clients: clients.map(c => ({ id: c.id, nom: c.nom, societe: c.societe, email: c.email })),
          produits: produits.map(p => ({ id: p.id, reference: p.reference, description: p.description, prixHT: p.prixHT, tva: p.tva, unite: p.unite })),
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setResult(data as AnalysisResult);
      toast.success('Analyse terminée');
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors de l\'analyse');
    } finally {
      setLoading(false);
    }
  }

  function updateResultClient(clientId: string) {
    if (!result) return;
    setResult({ ...result, clientId });
  }

  function updateResultLigneProduit(index: number, produitId: string) {
    if (!result) return;
    const p = produits.find(pr => pr.id === produitId);
    const newLignes = [...result.lignes];
    newLignes[index] = {
      ...newLignes[index],
      produitId,
      produitMatch: p?.description || newLignes[index].produitMatch,
      confidence: 'high',
    };
    setResult({ ...result, lignes: newLignes });
  }

  function updateResultLigneQuantite(index: number, quantite: number) {
    if (!result) return;
    const newLignes = [...result.lignes];
    newLignes[index] = { ...newLignes[index], quantite };
    setResult({ ...result, lignes: newLignes });
  }

  function removeResultLigne(index: number) {
    if (!result) return;
    setResult({ ...result, lignes: result.lignes.filter((_, i) => i !== index) });
  }

  function addResultLigne() {
    if (!result) return;
    setResult({
      ...result,
      lignes: [...result.lignes, { produitId: '', produitMatch: '', quantite: 1, confidence: 'high' }],
    });
  }

  function createDevis() {
    if (!result) return;

    const client = clients.find(c => c.id === result.clientId);
    if (!result.clientId || !client) {
      toast.error('Sélectionnez un client');
      return;
    }

    const lignes: LigneDevis[] = result.lignes
      .filter(l => l.produitId)
      .map(l => {
        const p = produits.find(pr => pr.id === l.produitId);
        return {
          id: generateId(),
          produitId: l.produitId,
          description: p?.description || l.produitMatch,
          quantite: l.quantite,
          unite: p?.unite || 'pièce',
          prixUnitaireHT: p?.prixHT || 0,
          tva: p?.tva || 20,
          remise: 0,
        };
      });

    if (lignes.length === 0) {
      toast.error('Ajoutez au moins un produit');
      return;
    }

    const numero = `DEV-${new Date().getFullYear()}-${String(devis.length + 1).padStart(3, '0')}`;
    const newDevis: DevisType = {
      id: generateId(),
      numero,
      clientId: result.clientId,
      dateCreation: new Date().toISOString().split('T')[0],
      dateValidite: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      statut: 'brouillon',
      lignes,
      referenceAffaire: result.referenceAffaire || '',
      notes: result.notes || '',
      conditions: 'Paiement à 30 jours à compter de la date de facturation.',
      fraisPortHT: 0,
      fraisPortTVA: 20,
      modeCalcul: 'standard',
    };

    updateDevis(prev => [...prev, newDevis]);
    toast.success(`Devis ${numero} créé avec ${lignes.length} ligne(s)`);
    onOpenChange(false);
    onDevisCreated(newDevis.id);
    setEmailText('');
    setResult(null);
  }

  function reset() {
    setResult(null);
    setEmailText('');
  }

  const client = result ? clients.find(c => c.id === result.clientId) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Analyse de mail — Création de devis
          </DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Collez le texte d'un email client ci-dessous. L'IA identifiera le client, les produits et les quantités pour créer automatiquement un devis.
            </p>
            <Textarea
              value={emailText}
              onChange={e => setEmailText(e.target.value)}
              placeholder="Collez ici le texte de l'email ou du message client..."
              className="min-h-[200px] font-mono text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
              <Button onClick={analyze} disabled={loading || !emailText.trim()}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                {loading ? 'Analyse en cours...' : 'Analyser'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Client — editable */}
            <div className="rounded-lg border p-3 space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Client</div>
              {client && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Check className="w-3 h-3 text-success" />
                  <span>Détecté : {result.clientMatch}</span>
                </div>
              )}
              {!client && result.clientMatch && (
                <div className="flex items-center gap-2 text-xs text-destructive mb-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Non trouvé : « {result.clientMatch} » — sélectionnez manuellement</span>
                </div>
              )}
              <ClientCombobox
                clients={clients}
                value={result.clientId}
                onSelect={updateResultClient}
              />
            </div>

            {/* Référence affaire */}
            {result.referenceAffaire && (
              <div className="rounded-lg border p-3 space-y-1">
                <div className="text-sm font-medium text-muted-foreground">Référence affaire</div>
                <Input
                  value={result.referenceAffaire}
                  onChange={e => setResult({ ...result, referenceAffaire: e.target.value })}
                  className="h-8"
                />
              </div>
            )}

            {/* Produits — editable */}
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-muted-foreground">Produits ({result.lignes.length})</div>
                <Button variant="ghost" size="sm" onClick={addResultLigne} className="h-7 text-xs">
                  <Plus className="w-3 h-3 mr-1" /> Ajouter
                </Button>
              </div>
              {result.lignes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun produit. Ajoutez-en manuellement.</p>
              ) : (
                <div className="space-y-3">
                  {result.lignes.map((l, i) => {
                    const p = produits.find(pr => pr.id === l.produitId);
                    return (
                      <div key={i} className="p-2 rounded bg-muted/50 space-y-2">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            {l.produitMatch && l.confidence !== 'high' && (
                              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                Détecté : « {l.produitMatch} »
                                <Badge className={`${confidenceColors[l.confidence]} text-[10px] px-1 py-0`}>{confidenceLabels[l.confidence]}</Badge>
                              </div>
                            )}
                            <ProduitCombobox
                              produits={produits}
                              value={l.produitId}
                              onSelect={(produitId) => updateResultLigneProduit(i, produitId)}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeResultLigne(i)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive shrink-0 mt-0.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground shrink-0">Qté :</span>
                          <Input
                            type="number"
                            min={1}
                            value={l.quantite}
                            onChange={e => updateResultLigneQuantite(i, Math.max(1, Number(e.target.value) || 1))}
                            className="h-7 w-20 text-sm"
                          />
                          {p && <span className="text-xs text-muted-foreground">{p.unite} — {p.prixHT.toFixed(2)}€ HT</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Notes */}
            {result.notes && (
              <div className="rounded-lg border p-3 space-y-1">
                <div className="text-sm font-medium text-muted-foreground">Notes extraites</div>
                <div className="text-sm">{result.notes}</div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                <X className="w-4 h-4 mr-1" /> Recommencer
              </Button>
              <Button
                onClick={createDevis}
                disabled={!result.clientId || result.lignes.filter(l => l.produitId).length === 0}
              >
                <Check className="w-4 h-4 mr-1" /> Créer le devis
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
