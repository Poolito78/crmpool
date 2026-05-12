import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Tu es un assistant de calcul pour un logiciel de devis dans le bâtiment (revêtements de sol, chapes, isolants).
Tu aides l'utilisateur à calculer des valeurs numériques : surfaces, consommations, quantités, ratios de mélange, équations.

Réponds UNIQUEMENT avec un objet JSON dans l'un de ces deux formats :

FORMAT 1 — résultat unique :
{ "value": <nombre>, "explanation": "<explication en français>" }

FORMAT 2 — plusieurs résultats (ratios, équations à plusieurs inconnues) :
{ "value": null, "values": [{"label": "<nom>", "value": <nombre>}, ...], "explanation": "<explication en français>" }

Règles :
- Toujours arrondir à 2 décimales
- "explanation" : 1-3 lignes maximum
- Si incompréhensible : { "value": null, "explanation": "Je ne peux pas calculer ça." }

NOTATION FRANÇAISE DES NOMBRES — règle CRITIQUE :
- La VIRGULE est le séparateur décimal : "1,5" = 1.5, "0,03" = 0.03, "1,023" = 1.023
- Le POINT ou l'ESPACE sont des séparateurs de milliers : "1.000" = 1000, "1 000" = 1000
- JAMAIS interpréter une virgule comme séparateur de milliers
- Exemples : "1,023" = 1.023 (et NON 1023), "2,5" = 2.5, "0,3" = 0.3, "4,8" = 4.8

Exemples FORMAT 1 :
- "pièce 5x4 m + couloir 2x8 m" → { "value": 36, "explanation": "5×4=20 + 2×8=16 = 36 m²" }
- "3 pièces de 12m² et une de 8m²" → { "value": 44, "explanation": "3×12+8 = 44 m²" }
- "0.3 kg/m² béton standard" → { "value": 0.3, "explanation": "Conso standard béton : 0,30 kg/m²" }
- "1,023 × 3%" → { "value": 0.03, "explanation": "1,023 × 0,03 = 0,031 ≈ 0,03" }

Exemples FORMAT 2 :
- "ratio A+2,5B=3,2 kg/m²" → { "value": null, "values": [{"label":"A","value":0.91},{"label":"B","value":2.29}], "explanation": "A+2,5A=3,5A=3,2 → A=0,91 kg/m², B=2,5×0,91=2,29 kg/m²" }
- "ratio 1:3 pour 4,8 kg/m²" → { "value": null, "values": [{"label":"Composant 1","value":1.2},{"label":"Composant 2","value":3.6}], "explanation": "Total=4 parts, 1 part=1,2 kg/m², 3 parts=3,6 kg/m²" }
- "A=2B et A+B=6" → { "value": null, "values": [{"label":"A","value":4},{"label":"B","value":2}], "explanation": "A=2B → 2B+B=6 → B=2, A=4" }`;

async function callGroq(message: string, history: any[], groqKey: string): Promise<{ value: number | null; values?: {label: string; value: number}[]; explanation: string }> {
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
      max_tokens: 400,
      temperature: 0,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!response.ok) throw new Error(`Groq error ${response.status}`);
  const data = await response.json();
  return JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
}

async function callGemini(message: string, history: any[], geminiKey: string): Promise<{ value: number | null; values?: {label: string; value: number}[]; explanation: string }> {
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
        generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 400 },
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

    let result: { value: number | null; values?: {label: string; value: number}[]; explanation: string };

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
