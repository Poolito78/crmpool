import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

Réponds en français, de façon concise et directement utile. Tu peux utiliser du markdown léger (gras, listes).`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { message, history = [], devisContext, produitsCatalog } = await req.json();
    if (!message) return new Response(JSON.stringify({ error: "message requis" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const groqKey = Deno.env.get("GROQ_API_KEY") ?? "";
    const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? null;

    // Build enriched system prompt with context
    let systemContent = SYSTEM_PROMPT;
    if (produitsCatalog) {
      systemContent += `\n\n--- CATALOGUE PRODUITS (format: id|ref|cat|desc|prixHT|unite) ---\n${produitsCatalog}\n---`;
    }
    if (devisContext) {
      systemContent += `\n\n--- DEVIS EN COURS ---\n${devisContext}\n---`;
    }

    async function callGroq(): Promise<string> {
      const trimmedHistory = history.slice(-10);
      const messages = [
        { role: "system", content: systemContent },
        ...trimmedHistory,
        { role: "user", content: message },
      ];
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 2000,
          temperature: 0.2,
          messages,
        }),
      });
      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Groq error ${response.status}: ${errBody}`);
      }
      const data = await response.json();
      return data.choices?.[0]?.message?.content ?? '';
    }

    async function callGemini(): Promise<string> {
      const contents = [
        ...history.map((m: any) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        { role: "user", parts: [{ text: message }] },
      ];
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemContent }] },
            contents,
            generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
          }),
        }
      );
      if (!response.ok) throw new Error(`Gemini error ${response.status}`);
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    }

    let responseText: string;
    try {
      responseText = await callGroq();
    } catch (groqErr) {
      console.error("Groq failed:", groqErr);
      if (geminiKey) {
        responseText = await callGemini();
      } else {
        throw new Error(`AI indisponible — ${(groqErr as Error).message}`);
      }
    }

    return new Response(JSON.stringify({ response: responseText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
