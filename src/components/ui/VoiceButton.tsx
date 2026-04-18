import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Props {
  /** Appelé avec le texte transcrit à chaque phrase reconnue */
  onTranscript: (text: string) => void;
  /** Langue de reconnaissance (défaut : fr-FR) */
  lang?: string;
  className?: string;
  size?: 'sm' | 'default';
}

// Typage minimal de la Web Speech API (non présent dans le tslib standard)
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

export default function VoiceButton({ onTranscript, lang = 'fr-FR', className = '', size = 'sm' }: Props) {
  const [listening, setListening] = useState(false);
  const recogRef = useRef<SpeechRecognition | null>(null);

  const supported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const stop = useCallback(() => {
    recogRef.current?.stop();
    recogRef.current = null;
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) { stop(); return; }

    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Dictée vocale non supportée sur ce navigateur (utilisez Chrome ou Edge)');
      return;
    }

    const recog = new SpeechRecognition();
    recog.lang = lang;
    recog.continuous = true;
    recog.interimResults = false;

    recog.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .slice(e.resultIndex)
        .filter(r => r.isFinal)
        .map(r => r[0].transcript)
        .join(' ')
        .trim();
      if (transcript) onTranscript(transcript);
    };

    recog.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error !== 'aborted') toast.error(`Erreur dictée : ${e.error}`);
      stop();
    };

    recog.onend = () => setListening(false);

    recog.start();
    recogRef.current = recog;
    setListening(true);
    toast.info('Dictée démarrée — parlez maintenant', { duration: 2000 });
  }, [listening, lang, onTranscript, stop]);

  if (!supported) return null;

  return (
    <Button
      type="button"
      variant={listening ? 'default' : 'outline'}
      size={size}
      onClick={toggle}
      title={listening ? 'Arrêter la dictée' : 'Dicter vocalement'}
      className={`gap-1.5 shrink-0 ${listening ? 'bg-destructive hover:bg-destructive/90 text-white border-destructive animate-pulse' : ''} ${className}`}
    >
      {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
      {listening ? 'Stop' : 'Dicter'}
    </Button>
  );
}
