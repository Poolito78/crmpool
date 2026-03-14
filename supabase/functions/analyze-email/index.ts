import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { emailText, clients, produits } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const clientsList = clients.map((c: any) => `- ID: "${c.id}" | Nom: "${c.nom}" | Société: "${c.societe || ''}" | Email: "${c.email}"`).join("\n");
    const produitsList = produits.map((p: any) => `- ID: "${p.id}" | Réf: "${p.reference}" | Description: "${p.description}" | Prix HT: ${p.prixHT}€ | TVA: ${p.tva}% | Unité: "${p.unite}"`).join("\n");

    const systemPrompt = `Tu es un assistant spécialisé dans l'analyse de demandes clients (emails, messages) pour un CRM de vente de produits (peintures, résines, granulats, etc.).

À partir du texte fourni, tu dois identifier :
1. Le client qui envoie la demande (parmi la liste fournie)
2. Les produits demandés avec leurs quantités (parmi la liste fournie)

RÈGLES IMPORTANTES :
- Fais correspondre les noms/sociétés/emails mentionnés dans le texte avec les clients existants
- Fais correspondre les produits mentionnés (par nom, référence, ou description partielle) avec les produits existants
- Si un produit n'est pas trouvé exactement, propose le plus proche
- Si la quantité n'est pas précisée, mets 1 par défaut
- Si le client n'est pas identifiable, laisse clientId vide

LISTE DES CLIENTS :
${clientsList}

LISTE DES PRODUITS :
${produitsList}`;

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
          { role: "user", content: `Analyse ce message et extrais le client et les produits demandés :\n\n${emailText}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_devis_data",
              description: "Extraire les données d'un devis à partir d'un email client",
              parameters: {
                type: "object",
                properties: {
                  clientId: {
                    type: "string",
                    description: "L'ID du client identifié, ou chaîne vide si non trouvé",
                  },
                  clientMatch: {
                    type: "string",
                    description: "Le nom/société du client trouvé dans le texte pour vérification",
                  },
                  referenceAffaire: {
                    type: "string",
                    description: "Référence affaire/chantier si mentionnée",
                  },
                  notes: {
                    type: "string",
                    description: "Notes ou informations complémentaires extraites du message",
                  },
                  lignes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        produitId: { type: "string", description: "ID du produit identifié" },
                        produitMatch: { type: "string", description: "Texte du produit trouvé dans le mail" },
                        quantite: { type: "number", description: "Quantité demandée" },
                        confidence: { type: "string", enum: ["high", "medium", "low"], description: "Niveau de confiance du matching" },
                      },
                      required: ["produitId", "produitMatch", "quantite", "confidence"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["clientId", "clientMatch", "lignes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_devis_data" } },
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
    console.error("analyze-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
