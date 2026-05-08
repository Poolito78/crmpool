import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Tu es un assistant de calcul pour un logiciel de devis dans le bâtiment (revêtements de sol, chapes, isolants).
Tu aides l'utilisateur à calculer des valeurs numériques : surfaces, consommations, quantités.

Réponds UNIQUEMENT avec un objet JSON : { "value": <nombre>, "explanation": "<courte explication en français>" }
- "value" : le résultat numérique arrondi à 2 décimales (jamais de texte, juste un nombre)
- "explanation" : 1-2 lignes expliquant le calcul

Exemples :
- "pièce 5x4 m + couloir 2x8 m" → { "value": 36, "explanation": "5×4 = 20 m² + 2×8 = 16 m² = 36 m²" }
- "3 pièces de 12m² et une de 8m²" → { "value": 44, "explanation": "3×12 + 8 = 44 m²" }
- "0.3 kg/m² pour béton standard" → { "value": 0.3, "explanation": "Consommation standard béton : 0,30 kg/m²" }

Si la demande n'est pas un calcul numérique ou est incompréhensible, réponds : { "value": null, "explanation": "Je ne peux pas calculer ça." }`;

async function callGroq(message: string, history: any[], groqKey: string): Promise<{ value: number | null; explanation: string }> {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: message },
  ];
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      max_tokens: 256,
      temperature: 0,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!response.ok) throw new Error(`Groq error ${response.status}`);
  const data = await response.json();
  return JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
}

async function callGemini(message: string, history: any[], geminiKey: string): Promise<{ value: number | null; explanation: string }> {
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
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 256 },
      }),
    }
  );
  if (!response.ok) throw new Error(`Gemini error ${response.status}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  return JSON.parse(text);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { message, history = [] } = await req.json();
    if (!message) return new Response(JSON.stringify({ error: "message requis" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const groqKey = Deno.env.get("GROQ_API_KEY") ?? "";
    const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? null;

    let result: { value: number | null; explanation: string };

    try {
      result = await callGroq(message, history, groqKey);
    } catch {
      if (geminiKey) {
        result = await callGemini(message, history, geminiKey);
      } else {
        throw new Error("AI indisponible");
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
