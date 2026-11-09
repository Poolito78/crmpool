/**
 * Relais vers l'API Claude (Anthropic), pour le bouton « Claude » de MonCRM.
 *
 * MonCRM lit ses demandes avec Gemini et Groq, gratuits et suffisants pour le
 * courant. Le bouton « Claude » confie la MÊME lecture à Claude, à la demande,
 * quand une demande est tordue — un tableau collé, des fautes de frappe, des
 * surfaces à recouper. C'est un choix de l'utilisateur, clic par clic : rien
 * ne passe par Claude d'office, chaque appel est facturé au compte Anthropic.
 *
 * ⚠️ **LA CLÉ EST UNE CLÉ D'API, PAS L'ABONNEMENT CLAUDE.** Un abonnement
 * claude.ai (Pro, Max, Team) ne donne aucun accès à l'API : il faut une clé
 * créée sur https://platform.claude.com, posée dans le secret
 * `ANTHROPIC_API_KEY` des Edge Functions. Elle ne quitte jamais le serveur —
 * une variable `VITE_…` serait lisible dans le bundle par quiconque ouvre
 * l'application (voir l'en-tête de la fonction `gemini`).
 *
 * ⚠️ **`verify_jwt = true` DANS `config.toml`** : un relais ouvert offrirait
 * Claude à tout venant, facturé au propriétaire de la clé.
 *
 * C'est un relais MINCE, comme `gemini` : aucune consigne métier ici. Le front
 * envoie `system` et `messages`, reçoit le texte. Le MODÈLE, lui, se choisit
 * ici et nulle part ailleurs — un front resté en cache profite d'un changement
 * sans être redéployé.
 *
 * Entrée :  { system?: string, messages: [{ role, content }], max_tokens?: number,
 *             effort?: "low" | "medium" | "high" }
 * Sortie :  { modele, texte, stop_reason, usage }
 *           { erreur: "…", status }            (HTTP 4xx / 5xx)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Le modèle du bouton « Claude ». Se change ICI. */
const MODELE = "claude-opus-5-5";

/** Sans flux, 16 000 jetons tiennent dans le délai d'une fonction Edge. */
const JETONS_MAX = 16000;

const EFFORTS = new Set(["low", "medium", "high"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const repondre = (corps: unknown, status = 200) =>
    new Response(JSON.stringify(corps), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const cle = Deno.env.get("ANTHROPIC_API_KEY");
    if (!cle) {
      return repondre({
        erreur: "ANTHROPIC_API_KEY n'est pas configurée dans les secrets des "
          + "Edge Functions (Supabase > Edge Functions > Secrets). Il faut une clé "
          + "d'API créée sur platform.claude.com — l'abonnement claude.ai n'en fournit pas.",
        status: 500,
      }, 500);
    }

    const corps = await req.json();
    const messages = Array.isArray(corps?.messages) ? corps.messages as Anthropic.MessageParam[] : [];
    if (!messages.length) return repondre({ erreur: "Aucun message à envoyer.", status: 400 }, 400);

    const client = new Anthropic({ apiKey: cle });
    const debut = Date.now();

    /* Sur Opus 5.5 la réflexion est toujours active : on ne passe pas
       `thinking`, on règle l'effort. Les replis côté serveur prennent le
       relais si le modèle décline une demande. */
    const reponse = await client.beta.messages.create({
      model: MODELE,
      max_tokens: Math.min(Number(corps?.max_tokens) || JETONS_MAX, JETONS_MAX),
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: EFFORTS.has(corps?.effort) ? corps.effort : "medium" },
      ...(typeof corps?.system === "string" && corps.system.trim() ? { system: corps.system } : {}),
      messages,
    });

    if (reponse.stop_reason === "refusal") {
      return repondre({
        erreur: "Claude a décliné cette demande"
          + (reponse.stop_details?.explanation ? ` : ${reponse.stop_details.explanation}` : "."),
        status: 422,
      }, 422);
    }

    const texte = reponse.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    console.log(`[claude] ${reponse.model} — ${Date.now() - debut} ms, `
      + `${reponse.usage.input_tokens} + ${reponse.usage.output_tokens} jetons`);

    return repondre({
      modele: reponse.model,
      texte,
      stop_reason: reponse.stop_reason,
      usage: { entree: reponse.usage.input_tokens, sortie: reponse.usage.output_tokens },
      dureeMs: Date.now() - debut,
    });
  } catch (e) {
    /* Du plus précis au plus général : la clé refusée et le quota ne se
       corrigent pas de la même façon. */
    if (e instanceof Anthropic.AuthenticationError) {
      return repondre({ erreur: "Clé ANTHROPIC_API_KEY refusée par Anthropic.", status: 401 }, 502);
    }
    if (e instanceof Anthropic.RateLimitError) {
      return repondre({ erreur: "Limite de débit Anthropic atteinte — réessayez dans un instant.", status: 429 }, 429);
    }
    if (e instanceof Anthropic.APIError) {
      console.error(`[claude] ${e.status} ${e.message}`);
      return repondre({ erreur: e.message, status: e.status ?? 502 }, 502);
    }
    console.error("[claude]", (e as Error).message);
    return repondre({ erreur: (e as Error).message, status: 500 }, 500);
  }
});
