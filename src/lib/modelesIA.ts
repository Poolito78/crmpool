/**
 * Les appels Gemini du navigateur — qui ne partent plus du navigateur.
 *
 * ⚠️ **LA CLÉ ÉTAIT PUBLIQUE.** `VITE_GEMINI_API_KEY` est une variable de
 * BUILD : Vite l'inscrit en clair dans le bundle, et quiconque ouvrait MonCRM
 * pouvait la lire — elle s'affichait jusque dans les URL de la console. Une
 * clé Gemini divulguée se consomme au compte de son propriétaire.
 *
 * Tout passe donc par l'Edge Function `gemini`, où la clé est le secret
 * `GEMINI_API_KEY`, le même que celui d'`analyze-email`. La fonction exige une
 * session (`verify_jwt = true`) : un relais ouvert n'aurait rien protégé.
 *
 * ⚠️ **UN MODÈLE RETIRÉ CASSE TOUT EN SILENCE.** Le 11 septembre 2026, Google
 * a arrêté `gemini-2.0-flash` et `gemini-2.0-flash-lite`. Les six appels de
 * l'application répondaient 404 sans que rien ne le dise à l'écran : la lecture
 * des signatures rendait `null` comme si l'image n'avait rien donné, et le nom
 * du modèle était écrit en dur dans cinq fichiers. D'où ce module — le prochain
 * retrait se corrige ICI, et dans l'en-tête de la fonction Edge.
 *
 * ⚠️ **`MODELES_GEMINI` DOUBLE LA LISTE DE LA FONCTION, à dessein** : le
 * navigateur et Deno ne partagent pas de code. Celle de la fonction fait foi,
 * puisqu'elle s'applique même à un front resté en cache ; celle-ci ne sert qu'à
 * imposer un modèle particulier depuis un appelant.
 */

import { supabase } from '@/integrations/supabase/client';

/** Modèles capables de lire du texte ET des images, du plus capable au repli. */
export const MODELES_GEMINI = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'] as const;

/** Le corps d'une requête Gemini, tel que l'API l'attend. */
export interface CorpsGemini {
  contents: unknown[];
  systemInstruction?: unknown;
  generationConfig?: unknown;
}

/**
 * Appelle Gemini par le relais et rend sa réponse BRUTE.
 *
 * Lève avec le détail de chaque tentative quand aucun modèle ne répond : c'est
 * ce détail qui distingue un modèle retiré (404) d'une clé refusée (403), d'un
 * quota épuisé (429) ou d'une API non activée sur le projet Google. Sans lui on
 * a cherché du côté du nom du modèle alors que le projet n'avait pas l'API.
 */
export async function appelerGemini(
  corps: CorpsGemini,
  modeles?: readonly string[],
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('gemini', {
    body: { ...corps, ...(modeles?.length ? { modeles: [...modeles] } : {}) },
  });

  if (error) {
    /* Le corps d'une réponse d'erreur porte `essais` ; `supabase-js` ne le
       remonte pas dans `error.message`, il faut le lire sur la réponse. */
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const corpsErreur = await ctx.json();
        if (corpsErreur?.erreur) detail = String(corpsErreur.erreur);
        if (Array.isArray(corpsErreur?.essais) && corpsErreur.essais.length) {
          detail += ' — ' + corpsErreur.essais
            .map((e: { modele: string; status: number; message: string }) =>
              `${e.modele}: ${e.status} ${String(e.message).slice(0, 120)}`)
            .join(' | ');
        }
      } catch { /* réponse illisible : le message brut fera l'affaire */ }
    }
    throw new Error(`[gemini] ${detail}`);
  }

  if (data?.erreur) {
    throw new Error(`[gemini] ${data.erreur}`);
  }
  return (data?.data ?? {}) as Record<string, unknown>;
}

/** Le texte rendu par Gemini, ou une chaîne vide. */
export function texteGemini(data: unknown): string {
  const d = data as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return d?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
