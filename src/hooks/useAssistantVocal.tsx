/* L'assistant vocal vu des pages : l'allumer, et lui confier une dictée propre.
 *
 * Il n'y a QU'UN micro. La reconnaissance vocale du navigateur n'en tient
 * qu'une à la fois : un bouton « Dicter » de page qui ouvrait la sienne à côté
 * de l'assistant se battait avec lui. Les pages passent donc par l'assistant
 * (`CRMLayout`) :
 *
 * - `basculer()` l'allume ou l'éteint ;
 * - `confierDictee(gestionnaire)` lui prête un aiguillage métier, essayé avant
 *   la dictée ordinaire — sur la page Devis, un libellé de ligne dicté cherche
 *   d'abord l'ARTICLE au catalogue. Il rend `true` s'il a traité la phrase ;
 * - `capturer(id, libelle, onTexte)` réserve TOUTE la dictée à une zone
 *   (bouton micro d'un dialogue : la question à l'assistant IA, le texte d'un
 *   devis vocal…) jusqu'à `liberer(id)` ou « fin de dictée ». Aucune commande
 *   n'est interprétée pendant ce temps, sauf celle qui y met fin. Si c'est la
 *   capture qui a allumé l'assistant, la libérer l'éteint.
 */

import { createContext, useContext } from 'react';

export type GestionnaireDictee = (texte: string, cible: HTMLElement | null) => boolean;

export interface CaptureDictee {
  id: string;
  /** Ce que le panneau annonce : « Dictée dans … ». */
  libelle: string;
  onTexte: (texte: string) => void;
}

export interface AssistantVocalCtx {
  actif: boolean;
  basculer: () => void;
  /** Prête un aiguillage de dictée tant que la page est montée ; `null` le retire. */
  confierDictee: (g: GestionnaireDictee | null) => void;
  /** Identifiant de la zone qui capte la dictée, `null` sinon. */
  capture: string | null;
  capturer: (c: CaptureDictee) => void;
  liberer: (id: string) => void;
}

export const AssistantVocalContext = createContext<AssistantVocalCtx | null>(null);

export function useAssistantVocal(): AssistantVocalCtx | null {
  return useContext(AssistantVocalContext);
}
