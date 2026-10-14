/* L'assistant vocal vu des pages : l'allumer, et lui confier une dictée propre.
 *
 * Il n'y a QU'UN micro. La reconnaissance vocale du navigateur n'en tient
 * qu'une à la fois : un bouton « Dicter » de page qui ouvrait la sienne à côté
 * de l'assistant se battait avec lui. Les pages passent donc par l'assistant
 * (`CRMLayout`) : `basculer()` l'allume ou l'éteint, et
 * `confierDictee(gestionnaire)` lui prête un aiguillage métier — sur la page
 * Devis, un libellé de ligne dicté cherche d'abord l'ARTICLE au catalogue au
 * lieu d'écrire le texte tel quel.
 *
 * Le gestionnaire reçoit le texte et le champ qui a le focus ; il rend `true`
 * s'il a traité la phrase, `false` pour laisser la dictée ordinaire l'écrire.
 */

import { createContext, useContext } from 'react';

export type GestionnaireDictee = (texte: string, cible: HTMLElement | null) => boolean;

export interface AssistantVocalCtx {
  actif: boolean;
  basculer: () => void;
  /** Prête un aiguillage de dictée tant que la page est montée ; `null` le retire. */
  confierDictee: (g: GestionnaireDictee | null) => void;
}

export const AssistantVocalContext = createContext<AssistantVocalCtx | null>(null);

export function useAssistantVocal(): AssistantVocalCtx | null {
  return useContext(AssistantVocalContext);
}
