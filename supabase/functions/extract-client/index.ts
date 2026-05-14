const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Tu es un assistant spécialisé dans l'extraction d'informations de contact à partir de texte libre ou d'une image (email, signature, carte de visite, capture d'écran, document).

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
    const { text, imageBase64, imageMimeType } = await req.json();
    const groqKey = Deno.env.get("GROQ_API_KEY") ?? "";
    if (!groqKey) throw new Error("GROQ_API_KEY non configurée");

    let messages: any[];

    if (imageBase64) {
      // Mode vision — modèle vision Groq
      const mimeType = imageMimeType || "image/png";
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extrais les coordonnées client depuis cette capture d'écran :" },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ];

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          max_tokens: 600,
          temperature: 0,
          response_format: { type: "json_object" },
          messages,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Groq vision error ${response.status}: ${err}`);
      }
      const data = await response.json();
      const result = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } else if (text?.trim()) {
      // Mode texte
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Extrais les coordonnées client depuis ce texte :\n\n${text}` },
      ];

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          max_tokens: 600,
          temperature: 0,
          response_format: { type: "json_object" },
          messages,
        }),
      });

      if (!response.ok) throw new Error(`Groq error ${response.status}`);
      const data = await response.json();
      const result = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } else {
      return new Response(JSON.stringify({ error: "text ou image requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
