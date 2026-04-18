import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Décodeurs MIME ───────────────────────────────────────────────────────────

/** Décode le contenu quoted-printable */
function decodeQP(text: string): string {
  return text
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** Décode le contenu base64 vers UTF-8 */
function decodeB64(text: string): string {
  try {
    const b64 = text.replace(/\s/g, '');
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

/** Supprime les balises HTML et décode les entités courantes */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Parse une partie MIME (headers\n\ncontent) et retourne le contenu décodé */
function parsePart(part: string): { type: string; content: string } | null {
  const sep = part.indexOf('\n\n');
  if (sep === -1) return null;
  const headers = part.slice(0, sep);
  const raw = part.slice(sep + 2).replace(/[\r\n]+$/, '');
  const typeMatch = headers.match(/content-type:\s*(text\/(?:plain|html))/i);
  if (!typeMatch) return null;
  const enc = (headers.match(/content-transfer-encoding:\s*(\S+)/i)?.[1] ?? '').toLowerCase();
  const content = enc === 'base64' ? decodeB64(raw)
    : enc === 'quoted-printable' ? decodeQP(raw)
    : raw;
  return { type: typeMatch[1].toLowerCase(), content };
}

/** Extrait et décode récursivement le corps lisible d'un email MIME */
function extractMimeBody(text: string): string {
  const bm = text.match(/boundary=["']?([^"'\s;>\r\n]+)["']?/i);
  if (!bm) return '';
  const esc = bm[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`--${esc}(?:--)?\\r?\\n?`));
  let plain = '', html = '';
  for (const part of parts) {
    if (!part.trim()) continue;
    // Partie multipart imbriquée
    if (/content-type:\s*multipart\//i.test(part)) {
      const sub = extractMimeBody(part);
      if (sub) { plain = plain || sub; continue; }
    }
    const parsed = parsePart(part);
    if (!parsed) continue;
    if (parsed.type === 'text/plain' && !plain) plain = parsed.content;
    else if (parsed.type === 'text/html' && !html) html = stripHtml(parsed.content);
  }
  return plain || html;
}

/** Prépare le texte d'un email pour l'IA :
 *  1. Extrait les en-têtes utiles (From / Subject)
 *  2. Décode le corps MIME si présent
 *  3. Sinon, nettoie les en-têtes techniques
 *  4. Tronque à maxChars */
function prepareEmailText(text: string, maxChars = 4000): string {
  const lines = text.split('\n');

  // 1. En-têtes utiles
  const useful = lines
    .filter(l => /^(from|de|to|subject|objet|date):\s+/i.test(l.trim()))
    .map(l => l.trim());

  // 2. Décoder le corps MIME
  let body = extractMimeBody(text);

  // 3. Fallback : supprimer les en-têtes techniques ligne par ligne
  if (!body) {
    const techRe = /^(x-ms-|x-originating|x-google-|received:|mime-version:|content-type:|content-transfer|dkim-|arc-|authentication-results:|message-id:|in-reply-to:|references:|return-path:|thread-|list-|delivered-to:|precedence:|boundary=|charset=)/i;
    body = lines
      .filter(l => !techRe.test(l.trim()))
      .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  const combined = (useful.length ? useful.join('\n') + '\n\n' : '') + body;
  if (combined.length <= maxChars) return combined;
  return combined.slice(0, 1800) + '\n[...]\n' + combined.slice(-(maxChars - 1900));
}

/** Appel Groq avec function calling — modèle 70b pour tâches complexes */
async function callGroq(systemPrompt: string, userMessage: string, tool: any, apiKey: string) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
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
    if (response.status === 429) throw new Error("Quota journalier atteint — réessayez demain ou dans quelques minutes.");
    const t = await response.text();
    console.error("Groq API error:", response.status, t);
    throw new Error("Erreur d'analyse AI");
  }
  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("Impossible d'extraire les données");
  return JSON.parse(toolCall.function.arguments);
}

/** Appel Groq JSON mode — modèle 8b rapide pour extraction de contact */
async function callGroqJson(systemPrompt: string, userMessage: string, apiKey: string): Promise<any> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      max_tokens: 512,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error("Quota journalier atteint — réessayez dans quelques minutes.");
    const t = await response.text();
    console.error("Groq 8b error:", response.status, t);
    throw new Error("Erreur d'analyse AI");
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  try { return JSON.parse(content); } catch { throw new Error("Réponse JSON invalide"); }
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

      const systemPrompt = `Tu es un assistant qui extrait les coordonnées d'un ${entityLabel} depuis un email ou une signature.
Réponds UNIQUEMENT avec un objet JSON valide contenant ces champs (chaîne vide "" si absent) :
{
  "nom": "prénom nom du contact (cherche dans signature et champ From:)",
  "societe": "nom de l'entreprise",
  "email": "adresse email (cherche dans From:, De:, et partout au format xxx@xxx.xxx)",
  "telephone": "téléphone fixe (01-05 en France)",
  "telephoneMobile": "téléphone mobile (06-07 en France)",
  "adresse": "rue et numéro uniquement",
  "ville": "ville uniquement",
  "codePostal": "code postal 5 chiffres",
  "notes": "site web, fonction, autres infos"
}
IMPORTANT : l'adresse email est souvent dans "From: Nom <email@domaine.fr>" — extrait-la.`;

      const result = await callGroqJson(systemPrompt, `Extrais les coordonnées du ${entityLabel} :\n\n${emailText}`, GROQ_API_KEY);
      // Garantir que tous les champs requis sont présents
      const safe = { nom: '', societe: '', email: '', telephone: '', telephoneMobile: '', adresse: '', ville: '', codePostal: '', notes: '', ...result };
      return new Response(JSON.stringify(safe), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
