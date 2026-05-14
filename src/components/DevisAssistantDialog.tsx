import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send, Bot, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devisContext?: string;
}

export default function DevisAssistantDialog({ open, onOpenChange, devisContext }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMessages([]);
      setInput('');
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
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke('devis-assistant', {
        body: { message: text, history, devisContext },
      });
      if (error) throw error;
      setMessages(prev => [...prev, { role: 'assistant', content: data.response || 'Erreur de réponse.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "⚠️ Erreur lors de la communication avec l'IA." }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] flex flex-col h-[70vh] p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot className="w-4 h-4 text-primary" />
            Assistant IA — Devis
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-10 space-y-2">
              <Bot className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="font-medium">Posez une question sur ce devis</p>
              <p className="text-xs">Calculs, descriptions, anomalies, suggestions…</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && <Bot className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
              <div className={`rounded-lg px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap break-words ${
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              }`}>
                {m.content}
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

        <div className="px-4 pb-4 pt-2 border-t border-border shrink-0">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Posez une question…"
              className="h-9 text-sm"
              disabled={loading}
            />
            <Button onClick={send} disabled={loading || !input.trim()} size="sm" className="h-9 px-3">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
