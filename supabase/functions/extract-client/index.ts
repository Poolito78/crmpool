const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Tu es un assistant spécialisé dans l'extraction d'informations de contact à partir de texte libre ou d'une image (email, signature, carte de visite, capture d'écran, document, bon de commande).

Réponds UNIQUEMENT avec un objet JSON :
{
  "societe": "nom de l'entreprise/société",
  "nom": "prénom + nom du contact principal",
  "email": "adresse email principale",
  "telephone": "téléphone fixe formaté",
  "telephoneMobile": "téléphone mobile formaté",
  "adresse": "rue et numéro de l'adresse principale (sans ville ni CP)",
  "ville": "ville de l'adresse principale",
  "codePostal": "code postal de l'adresse principale (5 chiffres)",
  "notes": "infos utiles : site web, SIRET, TVA, fonction, autres",
  "adresses": [
    {
      "type": "facturation" ou "livraison",
      "libelle": "libellé court (ex: Siège, Chantier Paris, Dépôt Lyon…)",
      "adresse": "rue et numéro",
      "ville": "ville",
      "codePostal": "code postal",
      "contact": "nom du contact sur place si mentionné",
      "telephone": "téléphone associé si mentionné"
    }
  ]
}

Règles :
- "adresses" : liste UNIQUEMENT les adresses SUPPLÉMENTAIRES clairement distinctes de l'adresse principale
  - Si une adresse est explicitement marquée "livraison", "chantier", "facturation", "siège", "agence", etc. → l'inclure
  - Si une seule adresse est présente → laisser "adresses" vide []
  - Type "facturation" si marqué "facture", "facturation", "siège social" — sinon "livraison"
- Formate les téléphones français proprement (ex: 03 85 77 07 25)
- Ne mets JAMAIS de null, toujours "" si absent
- "adresses" est toujours un tableau (vide si aucune adresse supplémentaire)`;

async function callGroqText(text: string, groqKey: string) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      max_tokens: 800,
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
  return JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
}

async function callGroqVision(imageBase64: string, mimeType: string, groqKey: string) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      max_tokens: 800,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extrais les coordonnées client depuis cette capture d'écran :" },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq vision error ${response.status}: ${err}`);
  }
  const data = await response.json();
  return JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { text, imageBase64, imageMimeType } = await req.json();
    const groqKey = Deno.env.get("GROQ_API_KEY") ?? "";
    if (!groqKey) throw new Error("GROQ_API_KEY non configurée");

    let result: any;
    if (imageBase64) {
      result = await callGroqVision(imageBase64, imageMimeType || "image/png", groqKey);
    } else if (text?.trim()) {
      result = await callGroqText(text, groqKey);
    } else {
      return new Response(JSON.stringify({ error: "text ou image requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Garantir que adresses est toujours un tableau
    if (!Array.isArray(result.adresses)) result.adresses = [];

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
