import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { emailText, type } = await req.json(); // type: "client" | "fournisseur"
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const entityLabel = type === "fournisseur" ? "fournisseur" : "client";

    const systemPrompt = `Tu es un assistant spécialisé dans l'extraction d'informations de contact à partir d'emails ou de signatures d'emails.

À partir du texte fourni (email, signature, ou coordonnées), tu dois extraire les informations de contact d'un ${entityLabel}.

RÈGLES :
- Extrais le maximum d'informations disponibles
- Si une information n'est pas présente, retourne une chaîne vide ""
- Pour "nom", extrais le prénom + nom de la personne (contact principal)
- Pour "societe", extrais le nom de l'entreprise/société
- Pour "email", extrais l'adresse email principale
- Pour "telephone", extrais le numéro de téléphone (mobile ou fixe, formate-le proprement)
- Pour "adresse", extrais la rue/numéro (sans ville ni code postal)
- Pour "ville", extrais uniquement la ville
- Pour "codePostal", extrais uniquement le code postal (5 chiffres pour la France)
- Pour "notes", tu peux ajouter des informations utiles non capturées ailleurs (site web, fonction, etc.)`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Extrais les coordonnées du ${entityLabel} depuis ce texte :\n\n${emailText}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_contact_data",
              description: `Extraire les coordonnées d'un ${entityLabel} à partir d'un email ou d'une signature`,
              parameters: {
                type: "object",
                properties: {
                  nom: { type: "string", description: "Prénom et nom du contact" },
                  societe: { type: "string", description: "Nom de l'entreprise / société" },
                  email: { type: "string", description: "Adresse email" },
                  telephone: { type: "string", description: "Numéro de téléphone" },
                  adresse: { type: "string", description: "Rue et numéro de rue uniquement" },
                  ville: { type: "string", description: "Ville" },
                  codePostal: { type: "string", description: "Code postal" },
                  notes: { type: "string", description: "Autres informations utiles (site web, fonction, etc.)" },
                },
                required: ["nom", "societe", "email", "telephone", "adresse", "ville", "codePostal", "notes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_contact_data" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessayez dans quelques instants." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits AI insuffisants." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erreur d'analyse AI" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "Impossible d'extraire les données" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-contact error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
