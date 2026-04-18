import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Nettoie le texte d'un email : supprime les en-têtes techniques Exchange/SMTP
 *  et tronque à maxChars pour rester sous la limite TPM de Groq. */
function prepareEmailText(text: string, maxChars = 4000): string {
  const headerRe = /^(x-ms-|x-originating|x-google-|received:|mime-version:|content-type:|content-transfer-encoding:|dkim-signature:|arc-|authentication-results:|message-id:|in-reply-to:|references:|return-path:|thread-topic:|thread-index:|list-|delivered-to:|precedence:)/i;

  const cleaned = text
    .split('\n')
    .filter(line => !headerRe.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // réduire les lignes vides multiples
    .trim();

  if (cleaned.length <= maxChars) return cleaned;
  // Garder début (expéditeur/objet) + fin (corps/signature)
  return cleaned.slice(0, 1500) + '\n[...]\n' + cleaned.slice(-(maxChars - 1600));
}

async function callGroq(systemPrompt: string, userMessage: string, tool: any, apiKey: string) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      tools: [{ type: "function", function: tool }],
      tool_choice: { type: "function", function: { name: tool.name } },
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("Trop de requêtes, réessayez dans quelques instants.");
    const t = await response.text();
    console.error("Groq API error:", response.status, t);
    throw new Error("Erreur d'analyse AI");
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("Impossible d'extraire les données");
  return JSON.parse(toolCall.function.arguments);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    // ── Mode extraction de contact ──────────────────────────────────────────
    if (body.action === "extract-contact") {
      const { type } = body;
      const emailText = prepareEmailText(String(body.emailText || ''));
      const entityLabel = type === "fournisseur" ? "fournisseur" : "client";

      const systemPrompt = `Tu es un assistant spécialisé dans l'extraction d'informations de contact à partir d'emails ou de signatures d'emails.
À partir du texte fourni, extrais les informations de contact d'un ${entityLabel}.
RÈGLES :
- Si une information n'est pas présente, retourne une chaîne vide ""
- "nom" : prénom + nom du contact principal
- "societe" : nom de l'entreprise
- "email" : adresse email principale
- "telephone" : numéro de téléphone fixe formaté (commence souvent par 01-05)
- "telephoneMobile" : numéro de téléphone mobile/portable formaté (commence souvent par 06 ou 07), chaîne vide si absent
- "adresse" : rue et numéro uniquement (sans ville ni code postal)
- "ville" : uniquement la ville
- "codePostal" : code postal 5 chiffres
- "notes" : autres infos utiles (site web, fonction, etc.)`;

      const tool = {
        name: "extract_contact_data",
        description: `Extraire les coordonnées d'un ${entityLabel} depuis un email`,
        parameters: {
          type: "object",
          properties: {
            nom: { type: "string" },
            societe: { type: "string" },
            email: { type: "string" },
            telephone: { type: "string", description: "Numéro de téléphone fixe" },
            telephoneMobile: { type: "string", description: "Numéro de téléphone mobile / portable" },
            adresse: { type: "string" },
            ville: { type: "string" },
            codePostal: { type: "string" },
            notes: { type: "string" },
          },
          required: ["nom", "societe", "email", "telephone", "telephoneMobile", "adresse", "ville", "codePostal", "notes"],
        },
      };

      const result = await callGroq(systemPrompt, `Extrais les coordonnées du ${entityLabel} depuis ce texte :\n\n${emailText}`, tool, GROQ_API_KEY);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Mode analyse devis ──────────────────────────────────────────────────
    const { emailText, clients, produits } = body;

    // Pré-filtrer produits par mots-clés de l'email pour rester sous 6000 tokens (limite Groq)
    const emailLower = String(emailText).toLowerCase();
    const emailMots = emailLower.split(/[\s,;.!?()]+/).filter((w: string) => w.length >= 3);

    const produitsFiltered = (produits as any[]).filter((p: any) => {
      const ref = String(p.reference || '').toLowerCase();
      const desc = String(p.description || '').toLowerCase();
      return emailMots.some((m: string) => ref.includes(m) || desc.includes(m));
    });
    const produitsLimites = produitsFiltered.length >= 2
      ? produitsFiltered.slice(0, 25)
      : (produits as any[]).slice(0, 25);

    const clientsLimites = (clients as any[]).slice(0, 25);

    const clientsList = clientsLimites.map((c: any) =>
      `- ID:"${c.id}" Nom:"${c.nom}" Soc:"${(c.societe||'').substring(0,30)}" Email:"${c.email}"`
    ).join("\n");
    const produitsList = produitsLimites.map((p: any) =>
      `- ID:"${p.id}" Réf:"${p.reference}" Desc:"${String(p.description).substring(0, 45)}" U:${p.unite}`
    ).join("\n");

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
      parameters: {
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

    const result = await callGroq(systemPrompt, `Analyse ce message et extrais le client et les produits demandés :\n\n${emailText}`, tool, GROQ_API_KEY);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("analyze-email error:", e);
    // Retourner 200 avec { error } pour que le client voie le vrai message
    return new Response(JSON.stringify({ error: e.message || "Erreur inconnue" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
