/**
 * Relais vers l'API Gemini, pour que la clé cesse de vivre dans le navigateur.
 *
 * ⚠️ **`VITE_GEMINI_API_KEY` ÉTAIT PUBLIQUE.** C'est une variable de BUILD :
 * Vite l'inscrit en clair dans le bundle, et quiconque ouvrait MonCRM pouvait
 * la lire — elle apparaissait jusque dans les URL de la console du navigateur.
 * Une clé Gemini divulguée se consomme au compte de son propriétaire.
 *
 * Les six appels du front passent donc par ici. La clé est désormais le secret
 * `GEMINI_API_KEY` des Edge Functions, le même que celui d'`analyze-email` :
 * elle ne quitte plus le serveur.
 *
 * ⚠️ **`verify_jwt = true` DANS `config.toml`, ET C'EST ESSENTIEL.** Un relais
 * ouvert ne protégerait rien : il offrirait à tout venant un accès Gemini
 * gratuit facturé au propriétaire de la clé, ce que la clé publique permettait
 * déjà. Seules les sessions authentifiées de MonCRM y ont droit — tous les
 * appelants sont dans les pages authentifiées.
 *
 * ── Ce que la fonction fait, et ne fait pas ─────────────────────────────────
 *
 * C'est un relais MINCE : elle ne connaît aucun métier, ne compose aucune
 * consigne, ne lit pas les réponses. Le front envoie le corps Gemini tel quel
 * (`contents`, `systemInstruction`, `generationConfig`) et reçoit la réponse
 * brute. Mettre les invites ici obligerait à redéployer la fonction à chaque
 * retouche de formulation — elles restent donc où elles se lisent, à côté du
 * code qui exploite le résultat.
 *
 * Elle ajoute une seule chose : la **chaîne de repli**. On essaie les modèles
 * dans l'ordre et l'on garde le premier qui répond. Le 11 septembre 2026,
 * `gemini-2.0-flash` et `gemini-2.0-flash-lite` ont été arrêtés par Google et
 * les six appels tombaient en 404 sans que rien ne le dise à l'écran : la
 * lecture des signatures rendait `null` comme si l'image n'avait rien donné.
 *
 * ⚠️ **UN ÉCHEC SE DIT, IL NE SE TAIT PAS.** La réponse porte le détail de
 * chaque tentative (`essais`), pas seulement un « ça n'a pas marché ». C'est
 * ce qui manquait pour distinguer un modèle retiré (404), une clé refusée
 * (403), un quota épuisé (429) et une image illisible.
 *
 * Entrée :
 *   { contents: [...], systemInstruction?: {...}, generationConfig?: {...},
 *     modeles?: string[] }
 * Sortie :
 *   { modele: "gemini-2.5-flash", data: <réponse Gemini brute> }
 *   { erreur: "…", essais: [{ modele, status, message }] }   (HTTP 502)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Chaîne de repli par défaut, quand le front n'en impose pas.
 *
 * ⚠️ Elle double `src/lib/modelesIA.ts` À DESSEIN : le navigateur et Deno ne
 * partagent pas de code, et une fonction Edge doit pouvoir répondre seule.
 * Les deux listes se corrigent ensemble — celle-ci fait foi, puisqu'elle
 * s'applique même à un front resté en cache.
 */
const MODELES_DEFAUT = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const repondre = (corps: unknown, status = 200) =>
    new Response(JSON.stringify(corps), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const cle = Deno.env.get("GEMINI_API_KEY");
    if (!cle) {
      return repondre({
        erreur: "GEMINI_API_KEY n'est pas configurée dans les secrets des "
          + "Edge Functions (Supabase > Edge Functions > Secrets).",
        essais: [],
      }, 500);
    }

    const corps = await req.json();
    const modeles: string[] = Array.isArray(corps?.modeles) && corps.modeles.length
      ? corps.modeles.map(String)
      : MODELES_DEFAUT;

    /* Le corps Gemini, recopié tel quel. On ne garde QUE les trois champs
       attendus : laisser passer le reste ferait voyager `modeles` jusqu'à
       Google, qui refuse un champ inconnu. */
    const charge: Record<string, unknown> = { contents: corps?.contents ?? [] };
    if (corps?.systemInstruction) charge.systemInstruction = corps.systemInstruction;
    if (corps?.generationConfig) charge.generationConfig = corps.generationConfig;

    const essais: { modele: string; status: number; message: string }[] = [];

    for (const modele of modeles) {
      let r: Response;
      try {
        r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cle}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(charge),
          },
        );
      } catch (e) {
        essais.push({ modele, status: 0, message: (e as Error).message });
        continue;
      }

      if (r.ok) {
        const data = await r.json();
        if (essais.length) {
          console.log(`[gemini] ${modele} a répondu après ${essais.length} échec(s) : `
            + essais.map((x) => `${x.modele}=${x.status}`).join(", "));
        }
        return repondre({ modele, data });
      }

      /* ⚠️ Le message de Google porte la RAISON — « is not found for API
         version v1beta », « API has not been used in project … », « quota
         exceeded ». Le jeter ne laissait qu'un code nu, et c'est ce qui a fait
         chercher du côté du nom du modèle alors que le projet n'avait pas
         l'API activée. On le remonte, tronqué. */
      const texte = await r.text().catch(() => "");
      const message = texte.slice(0, 400);
      console.warn(`[gemini] ${modele} → ${r.status} ${message}`);
      essais.push({ modele, status: r.status, message });
    }

    return repondre({
      erreur: `Aucun modèle Gemini n'a répondu (${modeles.join(", ")}).`,
      essais,
    }, 502);
  } catch (e) {
    console.error("[gemini]", (e as Error).message);
    return repondre({ erreur: (e as Error).message, essais: [] }, 500);
  }
});
