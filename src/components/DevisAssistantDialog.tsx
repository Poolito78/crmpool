import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send, Bot, User, Paperclip, X, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Produit, LigneDevis } from '@/lib/store';
import { generateId } from '@/lib/store';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestedLignes?: SuggestedLigne[];
}

interface SuggestedLigne {
  produitId?: string;
  description: string;
  quantite: number;
  unite: string;
  prixUnitaireHT: number;
  remise: number;
  note?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devisContext?: string;
  produits?: Produit[];
  onInsertLignes?: (lignes: LigneDevis[]) => void;
}

async function extractFileText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    const name = file.name.toLowerCase();

    if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
      reader.readAsArrayBuffer(file);
      reader.onload = () => {
        const bytes = new Uint8Array(reader.result as ArrayBuffer);
        const text = new TextDecoder('latin1').decode(bytes);
        // Basic PDF string extraction
        const matches: string[] = [];
        for (let i = 0; i < text.length - 1; i++) {
          if (text[i] === '(') {
            let str = '';
            let j = i + 1;
            while (j < text.length && text[j] !== ')' && j - i < 300) {
              if (text[j] === '\\') { j++; str += text[j] ?? ''; }
              else str += text[j];
              j++;
            }
            const clean = str.replace(/[^\x20-\x7EÀ-ɏ]/g, ' ').trim();
            if (clean.length > 3 && /[a-zA-ZÀ-ÿ0-9]/.test(clean)) matches.push(clean);
            i = j;
          }
        }
        const extracted = [...new Set(matches)].join(' ').replace(/\s+/g, ' ').trim();
        resolve(extracted.length > 50
          ? extracted
          : '[Contenu PDF non extractible directement — copiez-collez le texte pour une meilleure analyse]');
      };
      reader.onerror = () => resolve('[Erreur lecture PDF]');
    } else if (
      file.type.startsWith('text/') ||
      ['txt', 'md', 'csv', 'json', 'xml', 'rtf'].some(ext => name.endsWith('.' + ext))
    ) {
      reader.readAsText(file, 'utf-8');
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve('[Erreur lecture fichier texte]');
    } else {
      resolve(`[Fichier "${file.name}" (${file.type || 'type inconnu'}) — format non pris en charge pour la lecture automatique. Copiez-collez le contenu.]`);
    }
  });
}

function parseSuggestedLignes(text: string): { clean: string; lignes: SuggestedLigne[] | null } {
  const match = text.match(/<<<LIGNES>>>([\s\S]*?)<<<FIN_LIGNES>>>/);
  if (!match) return { clean: text, lignes: null };
  const clean = text.replace(/<<<LIGNES>>>[\s\S]*?<<<FIN_LIGNES>>>/g, '').replace(/\n{3,}/g, '\n\n').trim();
  try {
    const parsed = JSON.parse(match[1].trim());
    return { clean, lignes: Array.isArray(parsed) ? parsed : null };
  } catch {
    return { clean, lignes: null };
  }
}

export default function DevisAssistantDialog({ open, onOpenChange, devisContext, produits = [], onInsertLignes }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMessages([]);
      setInput('');
      setAttachedFile(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const content = await extractFileText(file);
    setAttachedFile({ name: file.name, content });
  }, []);

  const produitsCatalog = useMemo(() => {
    if (produits.length === 0) return null;
    // Format compact : pipe-séparé pour minimiser les tokens
    const lines: string[] = [];
    let chars = 0;
    const MAX_CHARS = 6000;
    for (const p of produits) {
      const line = `${p.id}|${p.reference}|${p.categorie || ''}|${p.description.slice(0, 40)}|${p.prixHT}|${p.unite}`;
      if (chars + line.length > MAX_CHARS) break;
      lines.push(line);
      chars += line.length + 1;
    }
    return `id|ref|cat|desc|prixHT|unite\n${lines.join('\n')}`;
  }, [produits]);

  async function send() {
    const text = input.trim();
    if ((!text && !attachedFile) || loading) return;

    let userContent = text;
    if (attachedFile) {
      const truncated = attachedFile.content.length > 3000
        ? attachedFile.content.slice(0, 3000) + '\n[... tronqué ...]'
        : attachedFile.content;
      userContent = `[Fichier joint : ${attachedFile.name}]\n\n${truncated}\n\n${text || 'Analyse ce document.'}`;
    }

    setInput('');
    setAttachedFile(null);
    setMessages(prev => [...prev, { role: 'user', content: text || `📎 ${attachedFile?.name}` }]);
    setLoading(true);

    try {
      // Garde les 10 derniers messages pour éviter les dépassements de tokens Groq
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke('devis-assistant', {
        body: { message: userContent, history, devisContext, produitsCatalog },
      });
      if (error) throw error;
      const raw: string = data.response || 'Erreur de réponse.';
      const { clean, lignes } = parseSuggestedLignes(raw);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: clean,
        suggestedLignes: lignes ?? undefined,
      }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "⚠️ Erreur lors de la communication avec l'IA." }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function insertLignes(suggested: SuggestedLigne[]) {
    if (!onInsertLignes) return;
    const lignes: LigneDevis[] = suggested.map(s => {
      const prod = s.produitId ? produits.find(p => p.id === s.produitId) : null;
      return {
        id: generateId(),
        produitId: s.produitId || undefined,
        description: s.description || prod?.description || '',
        quantite: s.quantite || 1,
        unite: s.unite || prod?.unite || 'pièce',
        prixUnitaireHT: s.prixUnitaireHT != null ? s.prixUnitaireHT : (prod?.prixHT ?? 0),
        tva: prod?.tva ?? 20,
        remise: s.remise || 0,
        note: s.note,
      };
    });
    onInsertLignes(lignes);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] flex flex-col h-[75vh] p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot className="w-4 h-4 text-primary" />
            Assistant IA — Devis
          </DialogTitle>
        </DialogHeader>

        {/* Chat area + drop zone */}
        <div
          className={`flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0 transition-colors relative ${dragOver ? 'bg-primary/5' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
          onDrop={handleDrop}
        >
          {dragOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 border-2 border-dashed border-primary/50 rounded z-10 pointer-events-none gap-2">
              <Paperclip className="w-10 h-10 text-primary/60" />
              <p className="text-sm font-medium text-primary">Déposez le fichier pour l'analyser</p>
              <p className="text-xs text-muted-foreground">PDF, TXT, CSV, plan…</p>
            </div>
          )}

          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8 space-y-2">
              <Bot className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="font-medium text-foreground">Assistant IA</p>
              <p className="text-xs">Calculs · Génération de lignes · Analyse de documents</p>
              <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                {['Génère les lignes pour Flowfast 319 Road', 'Vérifie les marges du devis', 'Calcule la surface totale'].map(s => (
                  <button key={s} onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 50); }}
                    className="text-xs px-2.5 py-1 rounded-full border border-border hover:bg-accent transition-colors">
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/60 mt-2">Glissez-déposez un fichier (PDF, plan, txt…) pour l'analyser</p>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && <Bot className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
              <div className="flex flex-col gap-1.5 max-w-[85%]">
                <div className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}>
                  {m.content}
                </div>
                {m.suggestedLignes && m.suggestedLignes.length > 0 && onInsertLignes && (
                  <Button size="sm" className="self-start h-7 text-xs" onClick={() => insertLignes(m.suggestedLignes!)}>
                    <Plus className="w-3 h-3 mr-1" />
                    Insérer {m.suggestedLignes.length} ligne{m.suggestedLignes.length > 1 ? 's' : ''} dans le devis
                  </Button>
                )}
              </div>
              {m.role === 'user' && <User className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />}
            </div>
          ))}

          {loading && (
            <div className="flex gap-2 justify-start">
              <Bot className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="bg-muted rounded-lg px-3 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="px-4 pb-4 pt-2 border-t border-border shrink-0 space-y-2">
          {attachedFile && (
            <div className="flex items-center gap-2 text-xs bg-muted rounded px-2.5 py-1.5">
              <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate font-medium">{attachedFile.name}</span>
              <button onClick={() => setAttachedFile(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={attachedFile ? 'Question sur le fichier (optionnel)…' : 'Posez une question ou glissez un fichier…'}
              className="h-9 text-sm"
              disabled={loading}
            />
            <Button onClick={send} disabled={loading || (!input.trim() && !attachedFile)} size="sm" className="h-9 px-3">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
