import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Mic, Sparkles, Check } from 'lucide-react';
import VoiceButton from '@/components/ui/VoiceButton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface VoiceVeille {
  concurrent?: string;
  produit?: string;
  reference?: string;
  categorie?: string;
  quantite?: number | null;
  quantiteUnite?: string;
  prixHT?: number | null;
  prixUnite?: string;
  client?: string;
  informateur?: string;
  description?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  concurrents: { id: string; nom: string }[];
  categories: string[];
  onApply: (parsed: VoiceVeille) => void;
}

const EXTRACT_PROMPT = (transcript: string, concurrents: { id: string; nom: string }[], categories: string[]) => `Tu dois extraire les informations d'une veille concurrentielle à partir de cette dictée vocale d'un commercial du bâtiment. Il s'agit d'un PRODUIT CONCURRENT (tarif observé chez un concurrent), pas d'un produit de notre catalogue.

Réponds UNIQUEMENT avec un bloc JSON entre les balises ci-dessous, sans aucun autre texte :

<<<VEILLE>>>
{"concurrent":"nom du concurrent mentionné","produit":"nom du produit concurrent","reference":"référence éventuelle","categorie":"catégorie du produit","quantite":25,"quantiteUnite":"kg","prixHT":120.5,"prixUnite":"€/kg","client":"client chez qui le tarif a été observé, sinon vide","informateur":"personne qui a donné l'info, sinon vide","description":"détails complémentaires (délai, remise, condition...)"}
<<<FIN_VEILLE>>>

RÈGLES :
- "quantite" = nombre uniquement (null si absent). "quantiteUnite" = m², kg, L, U, seau, sac…
- "prixHT" = nombre uniquement (null si absent). "prixUnite" = €/m², €/kg, €/U… selon ce qui est dicté.
- Si une information est absente, mets une chaîne vide "" (ou null pour les nombres). N'invente rien.
${concurrents.length > 0 ? `
CONCURRENTS EXISTANTS : ${concurrents.map(c => c.nom).join(', ')}
Si le concurrent dicté correspond à l'un d'eux (même approximativement), renvoie son nom EXACT tel qu'écrit ci-dessus.` : ''}
${categories.length > 0 ? `
CATÉGORIES EXISTANTES : ${categories.join(', ')}
Si la catégorie dictée correspond à l'une d'elles, renvoie son nom EXACT.` : ''}

Dictée à analyser : "${transcript}"`;

function parseVoiceVeille(text: string): VoiceVeille | null {
  const m = text.match(/<<<VEILLE>>>([\s\S]*?)<<<FIN_VEILLE>>>/);
  const raw = m ? m[1].trim() : text.trim();
  const jsonStr = m ? raw : (raw.match(/\{[\s\S]*\}/)?.[0] ?? '');
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    return typeof parsed === 'object' && parsed ? parsed as VoiceVeille : null;
  } catch {
    return null;
  }
}

export default function VeilleVoiceDialog({ open, onOpenChange, concurrents, categories, onApply }: Props) {
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<VoiceVeille | null>(null);

  useEffect(() => {
    if (open) { setTranscript(''); setParsed(null); setLoading(false); }
  }, [open]);

  async function analyser() {
    const text = transcript.trim();
    if (!text || loading) return;
    setLoading(true);
    setParsed(null);
    try {
      const { data, error } = await supabase.functions.invoke('devis-assistant', {
        body: { message: EXTRACT_PROMPT(text, concurrents, categories), history: [] },
      });
      if (error) throw error;
      const result = parseVoiceVeille(data?.response || '');
      if (!result) { toast.error("L'IA n'a pas pu structurer la dictée. Reformulez."); return; }
      setParsed(result);
    } catch (e) {
      console.error('[veille voice]', e);
      toast.error("Erreur lors de l'analyse vocale.");
    } finally {
      setLoading(false);
    }
  }

  const set = (field: keyof VoiceVeille, value: string | number | null) =>
    setParsed(p => p ? { ...p, [field]: value } : p);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] flex flex-col max-h-[85vh] p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mic className="w-4 h-4 text-primary" /> Dictée vocale — Produit concurrent
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Dictez : concurrent, produit, prix (avec unité), quantité, client source, informateur…
              </p>
              <VoiceButton onTranscript={t => setTranscript(prev => (prev ? prev.trim() + ' ' : '') + t)} />
            </div>
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder='Ex : « Chez Resipoly, résine époxy RE400, 8 euros 50 du kilo en seau de 25 kilos, vu chez le client Dubois par Marc. »'
              className="w-full min-h-[80px] text-sm rounded-md border border-input bg-background px-3 py-2 resize-y"
            />
            <Button onClick={analyser} disabled={loading || !transcript.trim()} className="w-full gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? 'Analyse en cours…' : 'Analyser la dictée'}
            </Button>
          </div>

          {parsed && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Informations détectées</p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Concurrent"><Input className="h-8 text-sm" list="voice-concurrents" value={parsed.concurrent || ''} onChange={e => set('concurrent', e.target.value)} placeholder="(non détecté)" />
                  <datalist id="voice-concurrents">{concurrents.map(c => <option key={c.id} value={c.nom} />)}</datalist>
                </Field>
                <Field label="Produit"><Input className="h-8 text-sm" value={parsed.produit || ''} onChange={e => set('produit', e.target.value)} placeholder="(non détecté)" /></Field>
                <Field label="Référence"><Input className="h-8 text-sm" value={parsed.reference || ''} onChange={e => set('reference', e.target.value)} /></Field>
                <Field label="Catégorie"><Input className="h-8 text-sm" list="voice-categories" value={parsed.categorie || ''} onChange={e => set('categorie', e.target.value)} />
                  <datalist id="voice-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
                </Field>
                <Field label="Quantité">
                  <div className="flex gap-1">
                    <Input className="h-8 text-sm" type="number" value={parsed.quantite ?? ''} onChange={e => set('quantite', e.target.value === '' ? null : Number(e.target.value))} />
                    <Input className="h-8 text-sm w-16 shrink-0" value={parsed.quantiteUnite || ''} onChange={e => set('quantiteUnite', e.target.value)} placeholder="kg" />
                  </div>
                </Field>
                <Field label="Prix HT">
                  <div className="flex gap-1">
                    <Input className="h-8 text-sm" type="number" step="0.01" value={parsed.prixHT ?? ''} onChange={e => set('prixHT', e.target.value === '' ? null : Number(e.target.value))} />
                    <Input className="h-8 text-sm w-16 shrink-0" value={parsed.prixUnite || ''} onChange={e => set('prixUnite', e.target.value)} placeholder="€/kg" />
                  </div>
                </Field>
                <Field label="Client source"><Input className="h-8 text-sm" value={parsed.client || ''} onChange={e => set('client', e.target.value)} /></Field>
                <Field label="Informateur"><Input className="h-8 text-sm" value={parsed.informateur || ''} onChange={e => set('informateur', e.target.value)} /></Field>
              </div>
              <Field label="Description"><Input className="h-8 text-sm" value={parsed.description || ''} onChange={e => set('description', e.target.value)} /></Field>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border shrink-0 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button size="sm" onClick={() => { if (parsed) { onApply(parsed); onOpenChange(false); } }} disabled={!parsed} className="gap-1.5">
            <Check className="w-4 h-4" /> Pré-remplir le produit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-0.5">{label}</label>
      {children}
    </div>
  );
}
