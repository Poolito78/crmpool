import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send, Check, Bot, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  value?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cellLabel: string;          // ex: "Surface m² — Pigment poudre"
  currentValue?: number;
  onInsert: (value: number) => void;
}

export default function AiCalculatorDialog({ open, onOpenChange, cellLabel, currentValue, onInsert }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastValue, setLastValue] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMessages([]);
      setInput('');
      setLastValue(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke('ai-calculator', {
        body: { message: text, history },
      });
      if (error) throw error;
      const { value, explanation } = data as { value: number | null; explanation: string };
      const assistantMsg: Message = { role: 'assistant', content: explanation, value };
      setMessages(prev => [...prev, assistantMsg]);
      if (value != null) setLastValue(value);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Erreur : ${e.message ?? 'indisponible'}` }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleInsert(value: number) {
    onInsert(value);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Bot className="w-4 h-4 text-primary" />
            Calculateur IA
          </DialogTitle>
          <p className="text-xs text-muted-foreground truncate">{cellLabel}{currentValue ? ` · valeur actuelle : ${currentValue}` : ''}</p>
        </DialogHeader>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0" style={{ maxHeight: '40vh' }}>
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Décrivez ce que vous voulez calculer.<br />
              <span className="italic">Ex : "pièce 5×4 m + couloir 2×8 m"</span>
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && <Bot className="w-4 h-4 text-primary mt-0.5 shrink-0" />}
              <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                <p>{m.content}</p>
                {m.role === 'assistant' && m.value != null && (
                  <button
                    onClick={() => handleInsert(m.value!)}
                    className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <Check className="w-3 h-3" />
                    Insérer {m.value}
                  </button>
                )}
              </div>
              {m.role === 'user' && <User className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />}
            </div>
          ))}
          {loading && (
            <div className="flex gap-2 justify-start">
              <Bot className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div className="bg-muted rounded-xl px-3 py-2">
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2 border-t border-border flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ex : 3 pièces de 12 m² et un couloir 2×5 m"
            className="h-9 text-sm"
            disabled={loading}
          />
          <Button size="sm" onClick={send} disabled={loading || !input.trim()} className="shrink-0 h-9 px-3">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        {lastValue != null && (
          <div className="px-4 pb-4 pt-0">
            <Button className="w-full h-9" onClick={() => handleInsert(lastValue!)}>
              <Check className="w-4 h-4 mr-2" /> Insérer {lastValue}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
