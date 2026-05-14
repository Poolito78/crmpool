import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Tu es un assistant expert pour un logiciel de CRM et devis dans le bâtiment (revêtements de sol, chapes, enduits, isolants, produits de construction).

Tu aides l'utilisateur à :
- Analyser et améliorer ses devis
- Répondre à des questions sur les produits, quantités, prix
- Faire des calculs (surfaces, consommations, quantités, ratios)
- Rédiger des descriptions, notes ou conditions
- Détecter des anomalies ou incohérences dans les devis
- Suggérer des produits complémentaires ou alternatifs

Réponds en français, de façon concise et directement utile. Tu peux utiliser du markdown léger (gras, listes à puces).`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { message, history = [], devisContext } = await req.json();
    if (!message) return new Response(JSON.stringify({ error: "message requis" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const groqKey = Deno.env.get("GROQ_API_KEY") ?? "";
    const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? null;

    const systemContent = devisContext
      ? `${SYSTEM_PROMPT}\n\n--- CONTEXTE DU DEVIS ACTUEL ---\n${devisContext}\n---`
      : SYSTEM_PROMPT;

    async function callGroq(): Promise<string> {
      const messages = [
        { role: "system", content: systemContent },
        ...history,
        { role: "user", content: message },
      ];
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 1000,
          temperature: 0.3,
          messages,
        }),
      });
      if (!response.ok) throw new Error(`Groq error ${response.status}`);
      const data = await response.json();
      return data.choices?.[0]?.message?.content ?? '';
    }

    async function callGemini(): Promise<string> {
      const contents = [
        ...history.map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
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
            generationConfig: { temperature: 0.3, maxOutputTokens: 1000 },
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
    } catch {
      if (geminiKey) {
        responseText = await callGemini();
      } else {
        throw new Error("AI indisponible");
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
