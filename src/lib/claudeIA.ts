/**
 * claudeIA.ts — LE BOUTON « CLAUDE » : la même lecture, confiée à Claude, à la demande.
 *
 * MonCRM lit ses demandes avec Gemini et Groq. Le bouton « Claude » d'un
 * dialogue d'analyse envoie la MÊME consigne à Claude par l'Edge Function
 * `claude` — jamais d'office, un clic à la fois : chaque appel est facturé au
 * compte Anthropic de la clé.
 *
 * ⚠️ La clé est le secret `ANTHROPIC_API_KEY` de la fonction — une clé d'API
 * de platform.claude.com, PAS l'abonnement claude.ai, qui n'ouvre pas l'API.
 * Elle ne vit pas dans le navigateur. Le modèle se choisit dans la fonction.
 *
 * ⚠️ UNE ERREUR SE DIT. Clé absente, clé refusée, quota : le message de la
 * fonction remonte tel quel, que `supabase-js` cache dans `error.context`.
 */

import { supabase } from '@/integrations/supabase/client';

export interface MessageClaude {
  role: 'user' | 'assistant';
  content: string;
}

export interface ReponseClaude {
  texte: string;
  /** Le modèle qui a répondu, tel que l'API le nomme. */
  modele: string;
  dureeMs?: number;
}

/**
 * Le message d'Anthropic, sorti de son enveloppe. L'API répond
 * « 400 {"type":"error","error":{"message":"Your credit balance is too low…"}} » :
 * affiché tel quel, c'était du JSON dans une notification (essai du 09/11/2026).
 *
 * ⚠️ UNE CLÉ SANS CRÉDIT EST REFUSÉE EN 400, pas en 401 : la clé est bonne,
 * c'est le compte de la plateforme qui n'a pas de crédit — distinct, lui
 * aussi, de l'abonnement claude.ai. On le dit en clair.
 */
export function messageLisible(detail: string): string {
  let message = detail;
  const json = detail.match(/\{[\s\S]*\}/)?.[0];
  if (json) {
    try {
      const corps = JSON.parse(json);
      const interne = corps?.error?.message ?? corps?.message;
      if (typeof interne === 'string' && interne.trim()) message = interne.trim();
    } catch { /* pas du JSON : le message brut */ }
  }
  if (/credit balance is too low/i.test(message)) {
    return "crédit Anthropic insuffisant — la clé est acceptée, mais le compte n'a pas de crédit d'API. "
      + 'À ajouter sur platform.claude.com (Plans & Billing) ; l\'abonnement claude.ai ne compte pas.';
  }
  return message;
}

export async function appelerClaude(args: {
  system?: string;
  messages: MessageClaude[];
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
}): Promise<ReponseClaude> {
  const { data, error } = await supabase.functions.invoke('claude', {
    body: {
      messages: args.messages,
      ...(args.system ? { system: args.system } : {}),
      ...(args.maxTokens ? { max_tokens: args.maxTokens } : {}),
      ...(args.effort ? { effort: args.effort } : {}),
    },
  });

  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const corps = await ctx.json();
        if (corps?.erreur) detail = String(corps.erreur);
      } catch { /* réponse illisible : le message brut fera l'affaire */ }
    }
    /* La fonction n'est pas déployée : `supabase-js` ne rend qu'un 404 nu. */
    if (/not found|404/i.test(detail)) {
      detail = "la fonction « claude » n'est pas déployée (.\\deploy-function.ps1 claude)";
    }
    throw new Error(`[claude] ${messageLisible(detail)}`);
  }
  if (data?.erreur) throw new Error(`[claude] ${messageLisible(String(data.erreur))}`);
  return { texte: String(data?.texte ?? ''), modele: String(data?.modele ?? ''), dureeMs: data?.dureeMs };
}
