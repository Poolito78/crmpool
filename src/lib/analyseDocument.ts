import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export type TypeDocument =
  | 'commande_fournisseur'
  | 'bon_livraison'
  | 'devis_client'
  | 'commande_client'
  | 'facture_fournisseur'
  | 'facture_client'
  | 'autre';

export const TYPE_LABELS: Record<TypeDocument, { label: string; color: string }> = {
  commande_fournisseur: { label: 'Commande fournisseur', color: 'bg-info/10 text-info' },
  bon_livraison:        { label: 'Bon de livraison',      color: 'bg-accent/10 text-accent' },
  devis_client:         { label: 'Devis client',          color: 'bg-primary/10 text-primary' },
  commande_client:      { label: 'Commande client',       color: 'bg-success/10 text-success' },
  facture_fournisseur:  { label: 'Facture fournisseur',   color: 'bg-warning/10 text-warning' },
  facture_client:       { label: 'Facture client',        color: 'bg-warning/10 text-warning' },
  autre:                { label: 'Autre document',        color: 'bg-muted text-muted-foreground' },
};

export interface LigneAnalysee {
  reference: string;
  description: string;
  quantite: number;
  prixUnitaireHT?: number;
  tva?: number;
}

export interface DocumentAnalysis {
  typeDocument: TypeDocument;
  numeroDocument?: string;
  nomPartenaire?: string;
  referencePartenaire?: string;
  dateDocument?: string;
  dateLivraisonPrevue?: string;
  dateEcheance?: string;
  lignes: LigneAnalysee[];
  totalHT?: number;
  totalTTC?: number;
  notes?: string;
}

const PROMPT = `Tu es un assistant spécialisé dans l'extraction de données depuis des documents commerciaux (commandes fournisseur, bons de livraison, devis, commandes client, factures, emails commerciaux).

Identifie le type de document et extrait les informations. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :

{
  "typeDocument": "commande_fournisseur | bon_livraison | devis_client | commande_client | facture_fournisseur | facture_client | autre",
  "numeroDocument": "numéro du document ou null",
  "nomPartenaire": "nom du fournisseur OU du client selon le type, ou null",
  "referencePartenaire": "référence interne du partenaire (leur propre n° de commande/devis) ou null",
  "dateDocument": "date au format YYYY-MM-DD ou null",
  "dateLivraisonPrevue": "date de livraison prévue au format YYYY-MM-DD ou null",
  "dateEcheance": "date d'échéance de paiement au format YYYY-MM-DD ou null",
  "totalHT": nombre ou null,
  "totalTTC": nombre ou null,
  "notes": "remarques importantes ou null",
  "lignes": [
    {
      "reference": "référence article ou null",
      "description": "désignation de l'article",
      "quantite": 0,
      "prixUnitaireHT": nombre ou null,
      "tva": taux TVA en % ou null
    }
  ]
}

Règles de classification :
- commande_fournisseur : bon de commande envoyé à un fournisseur, arc de commande, confirmation d'achat
- bon_livraison : bon de livraison, avis d'expédition
- devis_client : devis, offre de prix adressé à un client
- commande_client : bon de commande reçu d'un client
- facture_fournisseur : facture reçue d'un fournisseur
- facture_client : facture envoyée à un client

Si une information est absente, mets null. Les montants et quantités doivent être des nombres. Ne génère aucun texte en dehors du JSON.`;

async function extraireTextePDF(buffer: ArrayBuffer): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => item.str).join(' '));
  }
  return pages.join('\n');
}

/** Tronque le texte à ~6000 caractères pour rester sous la limite TPM de Groq (free tier) */
function tronquer(texte: string, maxChars = 6000): string {
  if (texte.length <= maxChars) return texte;
  return texte.slice(0, maxChars) + '\n[... texte tronqué ...]';
}

/** Appel Gemini comme fallback — JSON natif, quota gratuit journalier */
async function analyserViaGemini(texte: string, geminiKey: string): Promise<DocumentAnalysis> {
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastError: Error | null = null;

  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: `Document :\n${texte}` }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 1024 },
        }),
      }
    );

    if (response.status === 429) {
      lastError = Object.assign(new Error('quota'), { quota: true });
      console.warn(`Gemini ${model} quota dépassé — essai modèle suivant`);
      continue;
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Erreur Gemini ${response.status} : ${err.slice(0, 200)}`);
    }

    const data = await response.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Réponse invalide (Gemini) : aucun JSON trouvé');
    const parsed = JSON.parse(jsonMatch[0]) as DocumentAnalysis;
    if (!Array.isArray(parsed.lignes)) parsed.lignes = [];
    if (!parsed.typeDocument) parsed.typeDocument = 'autre';
    return parsed;
  }

  throw lastError ?? new Error('Erreur Gemini inconnue');
}

export async function analyserDocument(
  input:
    | { type: 'pdf'; buffer: ArrayBuffer; texteSupplementaire?: string }
    | { type: 'text'; texte: string },
  apiKey: string,
  geminiKey?: string
): Promise<DocumentAnalysis> {
  let texte: string;
  if (input.type === 'pdf') {
    const textePDF = await extraireTextePDF(input.buffer);
    texte = input.texteSupplementaire
      ? `=== EMAIL ===\n${tronquer(input.texteSupplementaire, 1500)}\n\n=== PDF ===\n${tronquer(textePDF, 5000)}`
      : tronquer(textePDF, 6000);
  } else {
    texte = tronquer(input.texte, 6000);
  }

  // 1. Essayer Groq llama-3.1-8b-instant (500K TPD)
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: `Document :\n${texte}` },
        ],
      }),
    });

    if (response.status === 429) throw Object.assign(new Error('quota'), { quota: true });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Erreur API Groq : ${response.status} — ${err}`);
    }

    const data = await response.json();
    const text: string = data.choices?.[0]?.message?.content ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Réponse invalide : aucun JSON trouvé');
    const parsed = JSON.parse(jsonMatch[0]) as DocumentAnalysis;
    if (!Array.isArray(parsed.lignes)) parsed.lignes = [];
    if (!parsed.typeDocument) parsed.typeDocument = 'autre';
    return parsed;
  } catch (err: any) {
    if (!err.quota) throw err;
    console.warn('Groq quota dépassé — basculement sur Gemini');
  }

  // 2. Fallback Gemini
  if (!geminiKey) throw new Error('Quota Groq dépassé. Configurez VITE_GEMINI_API_KEY pour continuer.');
  try {
    return await analyserViaGemini(texte, geminiKey);
  } catch (err: any) {
    if (err.quota) throw new Error('Quotas Groq et Gemini dépassés pour aujourd\'hui. Réessayez demain.');
    throw err;
  }
}
