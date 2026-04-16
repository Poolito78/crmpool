import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callClaude(systemPrompt: string, userMessage: string, tool: any, apiKey: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("Trop de requêtes, réessayez dans quelques instants.");
    if (response.status === 402 || response.status === 529) throw new Error("Crédits AI insuffisants.");
    const t = await response.text();
    console.error("Anthropic API error:", response.status, t);
    throw new Error("Erreur d'analyse AI");
  }

  const data = await response.json();
  const toolUse = data.content?.find((b: any) => b.type === "tool_use");
  if (!toolUse) throw new Error("Impossible d'extraire les données");
  return toolUse.input;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    // ── Mode extraction de contact ──────────────────────────────────────────
    if (body.action === "extract-contact") {
      const { emailText, type } = body;
      const entityLabel = type === "fournisseur" ? "fournisseur" : "client";

      const systemPrompt = `Tu es un assistant spécialisé dans l'extraction d'informations de contact à partir d'emails ou de signatures d'emails.
À partir du texte fourni, extrais les informations de contact d'un ${entityLabel}.
RÈGLES :
- Si une information n'est pas présente, retourne une chaîne vide ""
- "nom" : prénom + nom du contact principal
- "societe" : nom de l'entreprise
- "email" : adresse email principale
- "telephone" : numéro de téléphone formaté
- "adresse" : rue et numéro uniquement (sans ville ni code postal)
- "ville" : uniquement la ville
- "codePostal" : code postal 5 chiffres
- "notes" : autres infos utiles (site web, fonction, etc.)`;

      const tool = {
        name: "extract_contact_data",
        description: `Extraire les coordonnées d'un ${entityLabel} depuis un email`,
        input_schema: {
          type: "object",
          properties: {
            nom: { type: "string" },
            societe: { type: "string" },
            email: { type: "string" },
            telephone: { type: "string" },
            adresse: { type: "string" },
            ville: { type: "string" },
            codePostal: { type: "string" },
            notes: { type: "string" },
          },
          required: ["nom", "societe", "email", "telephone", "adresse", "ville", "codePostal", "notes"],
        },
      };

      const result = await callClaude(systemPrompt, `Extrais les coordonnées du ${entityLabel} depuis ce texte :\n\n${emailText}`, tool, ANTHROPIC_API_KEY);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Mode analyse devis ──────────────────────────────────────────────────
    const { emailText, clients, produits } = body;

    const clientsList = clients.map((c: any) => `- ID: "${c.id}" | Nom: "${c.nom}" | Société: "${c.societe || ''}" | Email: "${c.email}"`).join("\n");
    const produitsList = produits.map((p: any) => `- ID: "${p.id}" | Réf: "${p.reference}" | Description: "${p.description}" | Prix HT: ${p.prixHT}€ | TVA: ${p.tva}% | Unité: "${p.unite}"`).join("\n");

    const systemPrompt = `Tu es un assistant spécialisé dans l'analyse de demandes clients pour un CRM de vente de produits (peintures, résines, granulats, etc.).
À partir du texte fourni, identifie le client et les produits demandés.
RÈGLES :
- Fais correspondre les noms/sociétés/emails avec les clients existants
- Fais correspondre les produits (par nom, référence, description partielle) avec les produits existants
- Si un produit n'est pas trouvé exactement, propose le plus proche
- Quantité non précisée = 1 par défaut
- Client non identifiable = clientId vide

LISTE DES CLIENTS :
${clientsList}

LISTE DES PRODUITS :
${produitsList}`;

    const tool = {
      name: "extract_devis_data",
      description: "Extraire les données d'un devis à partir d'un email client",
      input_schema: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "ID du client identifié, vide si non trouvé" },
          clientMatch: { type: "string", description: "Nom/société du client trouvé dans le texte" },
          referenceAffaire: { type: "string", description: "Référence affaire/chantier si mentionnée" },
          notes: { type: "string", description: "Notes complémentaires" },
          lignes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                produitId: { type: "string" },
                produitMatch: { type: "string" },
                quantite: { type: "number" },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
              },
              required: ["produitId", "produitMatch", "quantite", "confidence"],
            },
          },
        },
        required: ["clientId", "clientMatch", "lignes"],
      },
    };

    const result = await callClaude(systemPrompt, `Analyse ce message et extrais le client et les produits demandés :\n\n${emailText}`, tool, ANTHROPIC_API_KEY);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("analyze-email error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erreur inconnue" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
