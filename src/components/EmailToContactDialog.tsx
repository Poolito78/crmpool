import { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Mail, Sparkles, Loader2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ExtractedContact {
  nom: string;
  societe: string;
  email: string;
  telephone: string;
  adresse: string;
  ville: string;
  codePostal: string;
  notes: string;
}

interface EmailToContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'client' | 'fournisseur';
  onExtracted: (contact: ExtractedContact) => void;
  initialText?: string;
}

export default function EmailToContactDialog({ open, onOpenChange, type, onExtracted, initialText }: EmailToContactDialogProps) {
  const [emailText, setEmailText] = useState(initialText || '');

  useEffect(() => {
    if (open && initialText) setEmailText(initialText);
  }, [open, initialText]);
  const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedContact | null>(null);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const label = type === 'fournisseur' ? 'fournisseur' : 'client';

  function reset() {
    setEmailText('');
    setExtracted(null);
    setLoading(false);
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const text = e.dataTransfer.getData('text/plain');
    if (text) {
      setEmailText(prev => prev ? prev + '\n\n' + text : text);
    }
  }, []);

  async function analyze() {
    if (!emailText.trim()) {
      toast.error('Collez un email ou du texte à analyser');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-email', {
        body: { action: 'extract-contact', emailText, type },
      });
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      setExtracted(data as ExtractedContact);
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors de l\'analyse');
    } finally {
      setLoading(false);
    }
  }

  function confirm() {
    if (!extracted) return;
    onExtracted(extracted);
    handleClose(false);
    toast.success(`Formulaire pré-rempli depuis l'email`);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Créer {label === 'client' ? 'un client' : 'un fournisseur'} depuis un email
          </DialogTitle>
        </DialogHeader>

        {!extracted ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Collez ou glissez-déposez le texte d'un email (corps + signature). L'IA extraira automatiquement les coordonnées.
            </p>

            {/* Drop zone + textarea */}
            <div
              className={cn(
                'relative rounded-xl border-2 border-dashed transition-colors',
                dragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-muted/30 hover:border-primary/50'
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {dragging && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-primary/10 z-10 pointer-events-none">
                  <div className="flex flex-col items-center gap-2 text-primary">
                    <Upload className="w-8 h-8" />
                    <span className="text-sm font-medium">Déposez ici</span>
                  </div>
                </div>
              )}
              <Textarea
                ref={textareaRef}
                placeholder={`Collez ici l'email ou la signature du ${label}...\n\nEx :\nDe : Jean Dupont <j.dupont@entreprise.fr>\nObjet : Demande de devis\n\nBonjour,\n...\n\nJean DUPONT\nResponsable achats\nENTREPRISE SAS\n12 rue de la Paix\n75001 Paris\nTél : 01 23 45 67 89`}
                value={emailText}
                onChange={e => setEmailText(e.target.value)}
                className="min-h-[200px] border-0 bg-transparent resize-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleClose(false)}>Annuler</Button>
              <Button onClick={analyze} disabled={loading || !emailText.trim()}>
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyse en cours...</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" /> Analyser avec l'IA</>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              <p className="text-sm text-primary font-medium">Informations extraites — vérifiez et corrigez si besoin</p>
            </div>

            <div className="grid gap-3">
              {[
                { key: 'societe', label: 'Société' },
                { key: 'nom', label: 'Nom du contact' },
                { key: 'email', label: 'Email', type: 'email' },
                { key: 'telephone', label: 'Téléphone', type: 'tel' },
                { key: 'adresse', label: 'Adresse' },
                { key: 'ville', label: 'Ville' },
                { key: 'codePostal', label: 'Code postal' },
              ].map(f => (
                <div key={f.key}>
                  <Label className="text-xs text-muted-foreground">{f.label}</Label>
                  <Input
                    type={f.type || 'text'}
                    value={(extracted as any)[f.key]}
                    onChange={e => setExtracted(prev => prev ? { ...prev, [f.key]: e.target.value } : prev)}
                  />
                </div>
              ))}
              <div>
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <Textarea
                  value={extracted.notes}
                  onChange={e => setExtracted(prev => prev ? { ...prev, notes: e.target.value } : prev)}
                  className="min-h-[60px] resize-none"
                />
              </div>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setExtracted(null)}>
                ← Modifier le texte
              </Button>
              <Button onClick={confirm}>
                Utiliser ces informations
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
