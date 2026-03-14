import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useCRM } from '@/lib/StoreContext';
import { generateId, type LigneDevis, type Devis as DevisType } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Loader2, Check, AlertTriangle, X, Sparkles } from 'lucide-react';

interface AnalysisResult {
  clientId: string;
  clientMatch: string;
  referenceAffaire?: string;
  notes?: string;
  lignes: {
    produitId: string;
    produitMatch: string;
    quantite: number;
    confidence: 'high' | 'medium' | 'low';
  }[];
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

  function createDevis() {
    if (!result) return;

    const client = clients.find(c => c.id === result.clientId);
    if (!result.clientId || !client) {
      toast.error('Client non identifié, impossible de créer le devis');
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
      toast.error('Aucun produit identifié');
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
            {/* Client identifié */}
            <div className="rounded-lg border p-3 space-y-1">
              <div className="text-sm font-medium text-muted-foreground">Client identifié</div>
              {client ? (
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success" />
                  <span className="font-medium">{client.nom}</span>
                  {client.societe && <span className="text-muted-foreground">({client.societe})</span>}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Client non trouvé : « {result.clientMatch || 'aucun'} »</span>
                </div>
              )}
            </div>

            {/* Référence affaire */}
            {result.referenceAffaire && (
              <div className="rounded-lg border p-3 space-y-1">
                <div className="text-sm font-medium text-muted-foreground">Référence affaire</div>
                <div>{result.referenceAffaire}</div>
              </div>
            )}

            {/* Produits identifiés */}
            <div className="rounded-lg border p-3 space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Produits identifiés ({result.lignes.length})</div>
              {result.lignes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun produit identifié dans le message.</p>
              ) : (
                <div className="space-y-2">
                  {result.lignes.map((l, i) => {
                    const p = produits.find(pr => pr.id === l.produitId);
                    return (
                      <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 p-2 rounded bg-muted/50">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{p?.description || l.produitMatch}</div>
                          {p && <div className="text-xs text-muted-foreground">Réf: {p.reference} — {p.prixHT.toFixed(2)}€ HT/{p.unite}</div>}
                          {!p && <div className="text-xs text-destructive">Produit non trouvé : « {l.produitMatch} »</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Qté: {l.quantite}</span>
                          <Badge className={confidenceColors[l.confidence]}>{confidenceLabels[l.confidence]}</Badge>
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
                disabled={!client || result.lignes.filter(l => l.produitId).length === 0}
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
