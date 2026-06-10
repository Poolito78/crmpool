import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Mic, Sparkles, Building2, Ruler, Layers, Package, Check, Trash2 } from 'lucide-react';
import VoiceButton from '@/components/ui/VoiceButton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Produit } from '@/lib/store';

export interface VoiceLigne {
  produitId?: string;
  description: string;
  quantite: number;
  unite: string;
  prixUnitaireHT: number;
  remise?: number;
  note?: string;
}

export interface VoiceDevis {
  client?: string;
  chantier?: string;
  surface?: number | null;
  systeme?: string;
  lignes?: VoiceLigne[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  produits?: Produit[];
  /** Clients existants — pour proposer la liste si le client dicté n'est pas reconnu */
  clients?: { id: string; nom: string; societe?: string }[];
  /** Devis modèles (statut « système ») existants — pour reconnaissance du système dicté */
  systemes?: { id: string; nom: string }[];
  /** Appelé avec les infos extraites validées par l'utilisateur */
  onApply: (parsed: VoiceDevis) => void;
}

const EXTRACT_PROMPT = (transcript: string, systemes?: { id: string; nom: string }[]) => `Tu dois extraire les informations d'un devis à partir de ce texte, qui est soit une demande dictée vocalement, soit le texte d'un email/message d'un client, pour un commercial du bâtiment (revêtements de sol, résines, chapes...).

Réponds UNIQUEMENT avec un bloc JSON entre les balises ci-dessous, sans aucun autre texte avant ou après :

<<<DEVIS>>>
{"client":"nom du client ou de la société mentionné, sinon vide","chantier":"nom ou référence du chantier, sinon vide","surface":120,"systeme":"nom du système ou modèle de revêtement mentionné, sinon vide","lignes":[{"produitId":"ID EXACT du catalogue si un produit correspond, sinon vide","description":"produit ou prestation","quantite":10,"unite":"m²","prixUnitaireHT":0,"remise":0,"note":""}]}
<<<FIN_DEVIS>>>

RÈGLES :
- "surface" = surface du chantier en m² (nombre uniquement, sinon null).
- Utilise les IDs EXACTS du catalogue fourni quand un produit correspond au nom dicté ; sinon laisse produitId vide et mets la description.
- "unite" = "m²", "U", "kg", "L", "seau", "sac"... selon ce qui est dicté (par défaut "U").
- "prixUnitaireHT" = prix du catalogue si le produit est trouvé, sinon 0.
- Si une information est absente, mets une chaîne vide "" (ou null pour surface). Ne devine pas le client.
- "lignes" peut être vide [] si aucun produit n'est mentionné.
${systemes && systemes.length > 0 ? `
SYSTÈMES MODÈLES EXISTANTS (devis types réutilisables) :
${systemes.map(s => `- ${s.nom}`).join('\n')}
Si la demande fait référence à l'un de ces systèmes (même approximativement), renvoie son nom EXACT tel qu'écrit ci-dessus dans "systeme". Dans ce cas, ne génère PAS de lignes pour les produits de ce système (le modèle sera dupliqué) — ne mets dans "lignes" que les produits supplémentaires explicitement dictés en plus du système.` : ''}

Texte à analyser (dictée vocale ou email client) : "${transcript}"`;

function parseVoiceDevis(text: string): VoiceDevis | null {
  const m = text.match(/<<<DEVIS>>>([\s\S]*?)<<<FIN_DEVIS>>>/);
  const raw = m ? m[1].trim() : text.trim();
  // tente d'isoler un objet JSON même sans balises
  const jsonStr = m ? raw : (raw.match(/\{[\s\S]*\}/)?.[0] ?? '');
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    return typeof parsed === 'object' && parsed ? parsed as VoiceDevis : null;
  } catch {
    return null;
  }
}

export default function DevisVoiceAssistantDialog({ open, onOpenChange, produits = [], clients = [], systemes, onApply }: Props) {
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<VoiceDevis | null>(null);

  useEffect(() => {
    if (open) { setTranscript(''); setParsed(null); setLoading(false); }
  }, [open]);

  // Glossaire de termes « collés » (noms de systèmes, références produits, marques) pour
  // recoller les mots éclatés par la dictée vocale (« flow fast » → « flowfast »).
  const glueTerms = useMemo(() => {
    const set = new Set<string>();
    const addWords = (s: string) => {
      for (const w of s.split(/\s+/)) {
        const c = w.replace(/[^a-zA-ZÀ-ÿ]/g, '');
        if (c.length >= 6) set.add(c);
      }
    };
    (systemes || []).forEach(s => addWords(s.nom || ''));
    produits.forEach(p => addWords(`${p.reference || ''} ${p.description || ''}`));
    ['flowfast', 'flowcoat', 'flowfresh', 'flowcrete', 'flowshield', 'isocrete', 'peran'].forEach(w => set.add(w));
    return [...set].slice(0, 120);
  }, [systemes, produits]);

  const normalizeTerms = (text: string): string => {
    let out = text;
    for (const term of glueTerms) {
      // autorise des espaces entre chaque lettre ; ne recolle que si le texte était espacé
      const re = new RegExp(term.split('').join('\\s*'), 'gi');
      out = out.replace(re, m => (/\s/.test(m) ? term : m));
    }
    return out;
  };

  const produitsCatalog = (() => {
    if (produits.length === 0) return null;
    const lines: string[] = [];
    let chars = 0;
    const MAX = 6000;
    for (const p of produits) {
      const line = `${p.id}|${p.reference}|${p.categorie || ''}|${p.description.slice(0, 40)}|${p.prixHT}|${p.unite}`;
      if (chars + line.length > MAX) break;
      lines.push(line);
      chars += line.length + 1;
    }
    return `id|ref|cat|desc|prixHT|unite\n${lines.join('\n')}`;
  })();

  async function analyser() {
    const text = normalizeTerms(transcript.trim());
    if (text !== transcript) setTranscript(text);
    if (!text || loading) return;
    setLoading(true);
    setParsed(null);
    try {
      const { data, error } = await supabase.functions.invoke('devis-assistant', {
        body: { message: EXTRACT_PROMPT(text, systemes), history: [], produitsCatalog },
      });
      if (error) throw error;
      const raw: string = data?.response || '';
      const result = parseVoiceDevis(raw);
      if (!result) { toast.error("L'IA n'a pas pu structurer la demande. Reformulez ou complétez la dictée."); return; }
      setParsed(result);
    } catch (e) {
      console.error('[voice assistant]', e);
      toast.error("Erreur lors de l'analyse vocale.");
    } finally {
      setLoading(false);
    }
  }

  function appliquer() {
    if (!parsed) return;
    onApply(parsed);
    onOpenChange(false);
  }

  const lignes = parsed?.lignes ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] flex flex-col max-h-[85vh] p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mic className="w-4 h-4 text-primary" /> Nouveau devis — dictée vocale ou email
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {/* Zone dictée */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Dictez <span className="text-muted-foreground/70">ou collez un email client</span> : client, chantier, surface (m²), système et produits avec quantités.
              </p>
              <VoiceButton onTranscript={t => setTranscript(prev => (prev ? prev.trim() + ' ' : '') + normalizeTerms(t))} />
            </div>
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder='Dictez ou collez un email. Ex : « Devis pour la société Dubois, chantier parking Nord, 250 m², système Flowfast 319, ajoute 250 m² de résine et 12 seaux de primaire. »'
              className="w-full min-h-[110px] text-sm rounded-md border border-input bg-background px-3 py-2 resize-y"
            />
            <Button onClick={analyser} disabled={loading || !transcript.trim()} className="w-full gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? 'Analyse en cours…' : 'Analyser'}
            </Button>
          </div>

          {/* Résultat extrait */}
          {parsed && (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Informations détectées</p>

              <div className="grid grid-cols-1 gap-2">
                <FieldRow icon={<Building2 className="w-4 h-4" />} label="Client">
                  <Input className="h-8 text-sm" list="voice-clients" value={parsed.client || ''} placeholder="Choisir ou taper un client…"
                    onChange={e => setParsed(p => p ? { ...p, client: e.target.value } : p)} />
                  <datalist id="voice-clients">
                    {clients.map(c => <option key={c.id} value={c.societe || c.nom} />)}
                  </datalist>
                  {(() => {
                    const q = (parsed.client || '').trim().toLowerCase();
                    if (!q) return null;
                    const found = clients.some(c => {
                      const soc = (c.societe || '').toLowerCase(); const nom = (c.nom || '').toLowerCase();
                      return soc === q || nom === q || (soc && (soc.includes(q) || q.includes(soc))) || (nom && (nom.includes(q) || q.includes(nom)));
                    });
                    return found
                      ? <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">✓ Client trouvé dans la base</p>
                      : <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">Client non trouvé — choisissez dans la liste ou tapez le nom exact</p>;
                  })()}
                </FieldRow>
                <FieldRow icon={<Package className="w-4 h-4" />} label="Chantier">
                  <Input className="h-8 text-sm" value={parsed.chantier || ''} placeholder="(non détecté)"
                    onChange={e => setParsed(p => p ? { ...p, chantier: e.target.value } : p)} />
                </FieldRow>
                <div className="grid grid-cols-2 gap-2">
                  <FieldRow icon={<Ruler className="w-4 h-4" />} label="Surface m²">
                    <Input className="h-8 text-sm" type="number" value={parsed.surface ?? ''} placeholder="—"
                      onChange={e => setParsed(p => p ? { ...p, surface: e.target.value === '' ? null : Number(e.target.value) } : p)} />
                  </FieldRow>
                  <FieldRow icon={<Layers className="w-4 h-4" />} label="Système">
                    <Input className="h-8 text-sm" value={parsed.systeme || ''} placeholder="(non détecté)"
                      onChange={e => setParsed(p => p ? { ...p, systeme: e.target.value } : p)} />
                  </FieldRow>
                </div>
              </div>

              {/* Lignes */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Lignes produits ({lignes.length})</p>
                {lignes.length === 0 && <p className="text-xs text-muted-foreground italic">Aucune ligne détectée.</p>}
                {lignes.map((l, i) => {
                  const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                  return (
                    <div key={i} className="flex items-center gap-2 bg-muted/30 rounded-md px-2 py-1.5 text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">{l.description || prod?.description || '—'}</p>
                        {prod && <p className="text-[11px] text-muted-foreground truncate">{prod.reference}</p>}
                      </div>
                      <Input className="h-7 w-16 text-sm text-right" type="number" value={l.quantite}
                        onChange={e => setParsed(p => p ? { ...p, lignes: p.lignes!.map((x, j) => j === i ? { ...x, quantite: Number(e.target.value) } : x) } : p)} />
                      <span className="text-xs text-muted-foreground w-10 shrink-0">{l.unite || 'U'}</span>
                      <button type="button" className="text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => setParsed(p => p ? { ...p, lignes: p.lignes!.filter((_, j) => j !== i) } : p)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border shrink-0 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button size="sm" onClick={appliquer} disabled={!parsed} className="gap-1.5">
            <Check className="w-4 h-4" /> Remplir le devis
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
        <span className="text-muted-foreground/70">{icon}</span> {label}
      </label>
      {children}
    </div>
  );
}
