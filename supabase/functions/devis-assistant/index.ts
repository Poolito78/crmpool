/**
 * Assistant IA du devis (et des dictées vocales devis / veille).
 *
 * ⚠️ **UN MODÈLE RETIRÉ CASSE TOUT EN SILENCE.** Le 14 septembre 2026,
 * l'assistant répondait « Edge Function returned a non-2xx status code » :
 * Groq avait retiré `llama-3.3-70b-versatile` (404 `model_not_found`), et le
 * repli visait `gemini-2.0-flash`, arrêté par Google le 11 septembre — les deux
 * étages tombaient, l'écran ne disait rien de plus.
 *
 * D'où deux CHAÎNES DE REPLI, essayées modèle par modèle : Gemini d'abord (la
 * même liste que la fonction `gemini`, qui répond), Groq ensuite. Le premier
 * modèle qui répond l'emporte.
 *
 * ⚠️ `MODELES_GEMINI` double `MODELES_DEFAUT` de `supabase/functions/gemini`
 * À DESSEIN : une fonction Edge doit pouvoir répondre seule. Les deux listes se
 * corrigent ensemble.
 *
 * ⚠️ **UN ÉCHEC SE DIT.** La réponse d'erreur porte `essais` — modèle, statut
 * et message du fournisseur pour chaque tentative. C'est ce message qui nomme
 * un modèle retiré, une clé refusée ou un quota épuisé ; le front l'affiche.
 *
 * Entrée : { message, history?, devisContext?, produitsCatalog? }
 * Sortie : { response, modele }  |  { error, essais }  (HTTP 502)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODELES_GEMINI = ["gemini-3.6-flash", "gemini-3.5-flash-lite"];
/* Ceux qu'emploient `extract-client` et `analyze-email`. */
const MODELES_GROQ = ["meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.1-8b-instant"];

const SYSTEM_PROMPT = `Tu es un assistant expert pour un logiciel de CRM et devis dans le bâtiment (revêtements de sol, chapes, enduits, isolants, produits de construction type Flowfast, Flowcoat, etc.).

Tu aides l'utilisateur à :
- Analyser et améliorer ses devis (marges, cohérence, prix)
- Répondre à des questions sur les produits, quantités, prix, consommations
- Faire des calculs (surfaces, consommations, quantités, ratios de mélange)
- Rédiger des descriptions, notes ou conditions
- Analyser des documents joints (plans, fiches techniques, emails, PDF)
- Générer des lignes de devis pour un système ou une application spécifique

GÉNÉRATION DE LIGNES DE DEVIS :
Quand l'utilisateur demande de créer/générer des lignes de devis pour un système (ex: "génère les lignes pour Flowfast 319 Road", "crée le devis pour une chape liquide"), tu dois :
1. Expliquer brièvement ce que tu proposes
2. Inclure OBLIGATOIREMENT un bloc JSON structuré EXACTEMENT ainsi (pas de texte à l'intérieur du bloc) :

<<<LIGNES>>>
[{"produitId": "ID_EXACT_DU_CATALOGUE_OU_VIDE", "description": "Nom du produit ou de la prestation", "quantite": 1, "unite": "U", "prixUnitaireHT": 0, "remise": 0, "note": "remarque optionnelle"}]
<<<FIN_LIGNES>>>

RÈGLES pour les lignes :
- Utilise les IDs exacts du catalogue fourni quand le produit correspond
- Si aucun produit du catalogue ne correspond, laisse produitId vide ("") et mets la description
- prixUnitaireHT: utilise le prix du catalogue si disponible, sinon 0
- Propose toutes les lignes nécessaires pour le système complet (primaire, produit principal, finition, etc.)
- Pour les systèmes multi-composants, crée une ligne par produit/étape

FILTRAGE PAR CATÉGORIE :
Le catalogue contient un champ "cat" qui est la catégorie exacte du produit (ex: MMA, PIGMENTS, FLOWFAST, etc.).
- Quand l'utilisateur demande des produits d'une catégorie (ex: "produits MMA"), filtre STRICTEMENT sur le champ cat = valeur exacte demandée
- Ne jamais inclure un produit d'une autre catégorie (ex: PIGMENTS ≠ MMA, même si utilisé avec des produits MMA)
- Si un produit n'a pas de catégorie correspondante, ne pas l'inclure dans les calculs de cette catégorie
- Pour les calculs financiers (totaux, pourcentages), n'utiliser que les lignes du devis dont le produit appartient à la catégorie demandée

Réponds en français, de façon concise et directement utile. Tu peux utiliser du markdown léger (gras, listes).`;

type Message = { role: string; content: string };
type Essai = { modele: string; status: number; message: string };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const repondre = (corps: unknown, status = 200) =>
    new Response(JSON.stringify(corps), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { message, history = [], devisContext, produitsCatalog } = await req.json();
    if (!message) return repondre({ error: "message requis" }, 400);

    const groqKey = Deno.env.get("GROQ_API_KEY") ?? null;
    const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? null;

    let systemContent = SYSTEM_PROMPT;
    if (produitsCatalog) {
      systemContent += `\n\n--- CATALOGUE PRODUITS (format: id|ref|cat|desc|prixHT|unite) ---\n${produitsCatalog}\n---`;
    }
    if (devisContext) {
      systemContent += `\n\n--- DEVIS EN COURS ---\n${devisContext}\n---`;
    }

    const trimmedHistory: Message[] = (history as Message[]).slice(-10);
    const essais: Essai[] = [];

    /* Une tentative : le texte rendu, ou `null` après avoir noté la raison. */
    async function essayer(
      modele: string,
      appel: () => Promise<Response>,
      lire: (data: any) => string,
    ): Promise<string | null> {
      let r: Response;
      try {
        r = await appel();
      } catch (e) {
        essais.push({ modele, status: 0, message: (e as Error).message });
        return null;
      }
      if (!r.ok) {
        const texte = (await r.text().catch(() => "")).slice(0, 400);
        console.warn(`[devis-assistant] ${modele} → ${r.status} ${texte}`);
        essais.push({ modele, status: r.status, message: texte });
        return null;
      }
      const texte = lire(await r.json());
      if (!texte) {
        essais.push({ modele, status: r.status, message: "réponse vide" });
        return null;
      }
      return texte;
    }

    if (geminiKey) {
      const contents = [
        ...trimmedHistory.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        { role: "user", parts: [{ text: message }] },
      ];
      for (const modele of MODELES_GEMINI) {
        const texte = await essayer(
          modele,
          () => fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${geminiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemContent }] },
                contents,
                generationConfig: { temperature: 0.2, maxOutputTokens: 2000 },
              }),
            },
          ),
          (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
        );
        if (texte) return repondre({ response: texte, modele });
      }
    }

    if (groqKey) {
      const messages = [
        { role: "system", content: systemContent },
        ...trimmedHistory,
        { role: "user", content: message },
      ];
      for (const modele of MODELES_GROQ) {
        const texte = await essayer(
          modele,
          () => fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: modele, max_tokens: 2000, temperature: 0.2, messages }),
          }),
          (data) => data?.choices?.[0]?.message?.content ?? "",
        );
        if (texte) return repondre({ response: texte, modele });
      }
    }

    if (!geminiKey && !groqKey) {
      return repondre({ error: "Ni GEMINI_API_KEY ni GROQ_API_KEY ne sont configurées.", essais }, 500);
    }
    return repondre({ error: "Aucun modèle IA n'a répondu.", essais }, 502);
  } catch (err) {
    console.error("[devis-assistant]", (err as Error).message);
    return repondre({ error: (err as Error).message, essais: [] }, 500);
  }
});
