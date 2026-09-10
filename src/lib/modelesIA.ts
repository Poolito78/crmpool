/**
 * Les modèles Gemini appelés depuis le navigateur, en UN SEUL endroit.
 *
 * ⚠️ **UN MODÈLE RETIRÉ CASSE TOUT EN SILENCE.** Le 11 septembre 2026,
 * `gemini-2.0-flash` et `gemini-2.0-flash-lite` ont été arrêtés par Google
 * (« Shut down » dans la documentation). Les six appels de l'application
 * répondaient 404, et rien ne le disait à l'écran : la lecture des signatures
 * rendait `null` comme si l'image n'avait rien donné, et l'analyse de document
 * retombait sur ses autres fournisseurs. Le nom du modèle était écrit en dur
 * dans cinq fichiers — il a donc fallu les retrouver un par un.
 *
 * D'où ce module : le prochain retrait se corrige ICI, et nulle part ailleurs.
 *
 * ⚠️ **LA LISTE EST UNE CHAÎNE DE REPLI, PAS UN CHOIX.** On essaie dans
 * l'ordre et l'on garde le premier qui répond. Un modèle retiré n'arrête donc
 * plus l'application le temps qu'on s'en aperçoive — à condition que le suivant
 * tienne encore, ce qui n'a rien d'éternel : la chaîne se relit.
 *
 * `flash` sert au raisonnement et à la VISION (les signatures en image) ;
 * `flashLite` est le repli économique, pour les extractions courtes.
 */

/** Modèles capables de lire du texte ET des images, du plus capable au repli. */
export const MODELES_GEMINI = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'] as const;

/**
 * L'URL d'appel d'un modèle.
 *
 * ⚠️ La clé voyage dans l'URL parce que c'est ce que l'API Gemini impose. Elle
 * vient de `VITE_GEMINI_API_KEY`, donc du BUNDLE : elle est lisible par
 * quiconque ouvre l'application. À restreindre par référent dans la console
 * Google, et à déplacer un jour dans une Edge Function, comme `analyze-email`.
 */
export function urlGemini(modele: string, cle: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cle}`;
}
