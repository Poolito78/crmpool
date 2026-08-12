/**
 * Web Speech API — déclarations manquantes.
 *
 * La bibliothèque DOM de TypeScript décrit `SpeechRecognitionResult` et
 * `SpeechRecognitionResultList`, mais pas `SpeechRecognition` lui-même ni ses
 * événements : l'interface n'est pas encore normalisée, seuls Chrome et Edge
 * l'implémentent, derrière le préfixe `webkit`. On la déclare donc ici, au
 * plus près de ce que ces deux navigateurs exposent réellement.
 *
 * Ce fichier ne produit aucun code : il ne fait que rendre visible au
 * compilateur ce que le navigateur fournit à l'exécution.
 */

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((e: Event) => void) | null;
  onstart: ((e: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface Window {
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
}
