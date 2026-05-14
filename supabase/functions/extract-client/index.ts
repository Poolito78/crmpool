const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Tu es un assistant spécialisé dans l'extraction d'informations de contact à partir de texte libre (email, signature, carte de visite, document).

Réponds UNIQUEMENT avec un objet JSON contenant ces champs (chaîne vide si absent) :
{
  "societe": "nom de l'entreprise/société",
  "nom": "prénom + nom du contact principal",
  "email": "adresse email principale",
  "telephone": "téléphone fixe formaté",
  "telephoneMobile": "téléphone mobile formaté",
  "adresse": "rue et numéro uniquement (sans ville ni code postal)",
  "ville": "ville uniquement",
  "codePostal": "code postal (5 chiffres)",
  "notes": "infos utiles : site web, SIRET, TVA, fonction, autres"
}

Règles :
- Extrais le maximum d'infos disponibles
- Formate les téléphones français proprement (ex: 03 85 77 07 25)
- Sépare bien adresse / ville / code postal
- Si plusieurs contacts : prends le principal (signataire ou premier mentionné)
- Ne mets JAMAIS de null, toujours "" si absent`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { text } = await req.json();
    if (!text?.trim()) {
      return new Response(JSON.stringify({ error: "text requis" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const groqKey = Deno.env.get("GROQ_API_KEY") ?? "";
    if (!groqKey) throw new Error("GROQ_API_KEY non configurée");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: 600,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Extrais les coordonnées client depuis ce texte :\n\n${text}` },
        ],
      }),
    });

    if (!response.ok) throw new Error(`Groq error ${response.status}`);
    const data = await response.json();
    const result = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");

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
