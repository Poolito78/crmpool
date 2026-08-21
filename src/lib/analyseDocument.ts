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
  /** Un client demande un prix : ni numéro, ni total, ni référence. */
  | 'demande_devis'
  | 'autre';

export const TYPE_LABELS: Record<TypeDocument, { label: string; color: string }> = {
  commande_fournisseur: { label: 'Commande fournisseur', color: 'bg-info/10 text-info' },
  bon_livraison:        { label: 'Bon de livraison',      color: 'bg-accent/10 text-accent' },
  devis_client:         { label: 'Devis client',          color: 'bg-primary/10 text-primary' },
  commande_client:      { label: 'Commande client',       color: 'bg-success/10 text-success' },
  facture_fournisseur:  { label: 'Facture fournisseur',   color: 'bg-warning/10 text-warning' },
  facture_client:       { label: 'Facture client',        color: 'bg-warning/10 text-warning' },
  demande_devis:        { label: 'Demande de devis',      color: 'bg-primary/10 text-primary' },
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
  /**
   * Adresse de LIVRAISON, quand le document la distingue de la facturation.
   *
   * C'est elle qui commande les frais de transport — un client facturé à
   * Porcheville peut se faire livrer en Picardie, et le barème n'est pas le
   * même. Le devis Odoo AF035816 le montre à l'envers : sa livraison est
   * « À PRÉCISER » alors que le transport y est chiffré pour le 78, celui de
   * la facturation. Faute de mieux, c'est bien ce repli qu'il faut, mais il
   * doit rester visible et corrigeable.
   */
  adresseLivraison?: string;
  codePostalLivraison?: string;
  villeLivraison?: string;
}

const PROMPT = `Tu es un assistant spécialisé dans l'extraction de données depuis des documents commerciaux (commandes fournisseur, bons de livraison, devis, commandes client, factures, emails commerciaux).

Identifie le type de document et extrait les informations. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :

{
  "typeDocument": "demande_devis | commande_fournisseur | bon_livraison | devis_client | commande_client | facture_fournisseur | facture_client | autre",
  "numeroDocument": "numéro du document ou null",
  "nomPartenaire": "nom du fournisseur OU du client selon le type, ou null",
  "referencePartenaire": "référence interne du partenaire (leur propre n° de commande/devis) ou null",
  "dateDocument": "date au format YYYY-MM-DD ou null",
  "dateLivraisonPrevue": "date de livraison prévue au format YYYY-MM-DD ou null",
  "dateEcheance": "date d'échéance de paiement au format YYYY-MM-DD ou null",
  "totalHT": nombre ou null,
  "totalTTC": nombre ou null,
  "notes": "remarques importantes ou null",
  "adresseLivraison": "rue de l'adresse de LIVRAISON si elle est distincte de la facturation, ou null",
  "codePostalLivraison": "code postal de l'adresse de LIVRAISON (5 chiffres) ou null",
  "villeLivraison": "ville de l'adresse de LIVRAISON ou null",
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
- demande_devis : un CLIENT demande un prix ou un devis, le plus souvent par
  courriel. Pas de numéro, pas de prix, pas de total : c'est une demande, pas
  un document comptable. Exemple : « Pouvez-vous nous faire un devis pour 14u
  de J11 avec la galette à coller + colle ? »

Extraction des lignes d'une demande de devis :
- Chaque article cité devient une ligne, même sans référence ni prix.
- La quantité se lit dans le texte : « 14u », « 14 u », « 14 unités », « 14x »,
  « x14 » et « 14 pièces » valent tous 14. Sans quantité indiquée, mets 1.
- « description » reprend les mots du client tels quels — « J11 », « galette à
  coller », « colle » — sans les traduire ni les compléter : le rapprochement
  avec le catalogue est fait ensuite par l'application.
- « reference » reste null quand le client n'en donne pas.
- « prixUnitaireHT » reste null : c'est le tarif du client qui décidera.

Si une information est absente, mets null. Les montants et quantités doivent être des nombres. Ne génère aucun texte en dehors du JSON.`;

/**
 * Isole le premier objet JSON complet d'une réponse d'IA.
 *
 * Une simple expression régulière « du premier { au dernier } » est gourmande :
 * si le modèle ajoute le moindre mot après l'objet — ou en produit un second —
 * elle ramène les deux d'un coup et JSON.parse échoue sur un message obscur
 * (« Expected ',' or ']' after array element… »). On compte donc les accolades
 * en ignorant celles qui se trouvent à l'intérieur d'une chaîne, et on s'arrête
 * dès que l'objet est refermé.
 */
function extraireObjetJSON(texte: string): string {
  const debut = texte.indexOf('{');
  if (debut === -1) throw new Error('Réponse invalide : aucun JSON trouvé');

  let profondeur = 0;
  let dansChaine = false;
  let echappe = false;

  for (let i = debut; i < texte.length; i++) {
    const c = texte[i];

    if (dansChaine) {
      if (echappe) echappe = false;
      else if (c === '\\') echappe = true;
      else if (c === '"') dansChaine = false;
      continue;
    }

    if (c === '"') dansChaine = true;
    else if (c === '{') profondeur++;
    else if (c === '}') {
      profondeur--;
      if (profondeur === 0) return texte.slice(debut, i + 1);
    }
  }

  throw new Error(
    "La réponse de l'IA a été coupée avant la fin. Réessayez, ou raccourcissez le document."
  );
}

/** Analyse la réponse d'un fournisseur et complète les champs obligatoires. */
function lireAnalyse(texte: string): DocumentAnalysis {
  const parsed = JSON.parse(extraireObjetJSON(texte)) as DocumentAnalysis;
  if (!Array.isArray(parsed.lignes)) parsed.lignes = [];
  if (!parsed.typeDocument) parsed.typeDocument = 'autre';
  return parsed;
}

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

/** Appel OpenRouter — essaie plusieurs modèles gratuits en séquence */
async function analyserViaOpenRouter(texte: string, openrouterKey: string): Promise<DocumentAnalysis> {
  const models = [
    'meta-llama/llama-4-scout:free',
    'meta-llama/llama-4-maverick:free',
    'deepseek/deepseek-v3-0324:free',
    'google/gemma-4-26b-a4b-it:free',
    'qwen/qwen3-30b-a3b:free',
    'openai/gpt-oss-20b:free',
    'nvidia/nemotron-3-nano-30b-a3b:free',
  ];
  for (const model of models) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openrouterKey}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 1024,
          messages: [
            { role: 'system', content: PROMPT },
            { role: 'user', content: `Document :\n${texte}` },
          ],
        }),
      });
      if (response.status === 429 || response.status === 404) { console.warn(`OpenRouter ${model} indisponible`); continue; }
      if (!response.ok) { console.warn(`OpenRouter ${model} erreur ${response.status}`); continue; }
      const data = await response.json();
      const text: string = data.choices?.[0]?.message?.content ?? '';
      return lireAnalyse(text);
    } catch { console.warn(`OpenRouter ${model} exception`); }
  }
  throw Object.assign(new Error('quota'), { quota: true });
}

/** Appel Gemini comme fallback — JSON natif, quota gratuit journalier */
async function analyserViaGemini(texte: string, geminiKey: string): Promise<DocumentAnalysis> {
  const models = ['gemini-2.0-flash', 'gemini-2.0-flash-lite'];
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

    if (response.status === 429 || response.status === 404) {
      lastError = response.status === 429
        ? Object.assign(new Error('quota'), { quota: true })
        : new Error(`Gemini ${model} indisponible (404)`);
      console.warn(`Gemini ${model} ${response.status} — essai modèle suivant`);
      continue;
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Erreur Gemini ${response.status} : ${err.slice(0, 200)}`);
    }

    const data = await response.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return lireAnalyse(text);
  }

  throw lastError ?? Object.assign(new Error('quota'), { quota: true });
}

export async function analyserDocument(
  input:
    | { type: 'pdf'; buffer: ArrayBuffer; texteSupplementaire?: string }
    | { type: 'text'; texte: string },
  apiKey: string,
  geminiKey?: string,
  openrouterKey?: string
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

  // 1. Essayer Groq openai/gpt-oss-20b (remplace llama-3.1-8b-instant, déprécié le
  // 16/08/2026 — cf. https://console.groq.com/docs/deprecations).
  // ATTENTION : gpt-oss-20b raisonne avant de répondre, et ces jetons de
  // réflexion sont pris sur max_tokens. Avec l'ancien budget de 1024 le JSON
  // était coupé en plein milieu (« Expected ',' or ']' … »).
  // Mais max_tokens est AUSSI compté par Groq dans sa limite de 8 000 jetons
  // par minute (offre gratuite) : réservation = texte envoyé + max_tokens.
  // 8192 faisait donc échouer la requête en 413 avant même d'être traitée.
  // 4096 laisse de la marge des deux côtés (~1 000 à 2 000 jetons de texte
  // envoyé + 4 096 réservés restent bien sous les 8 000).
  // response_format garantit en plus un JSON bien formé.
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        temperature: 0,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
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
    return lireAnalyse(text);
  } catch (err: any) {
    if (!err.quota) throw err;
    console.warn('Groq quota dépassé — basculement sur Gemini');
  }

  // 2. Fallback Gemini
  if (geminiKey) {
    try {
      return await analyserViaGemini(texte, geminiKey);
    } catch (err: any) {
      if (!err.quota) throw err;
      console.warn('Gemini quota dépassé — basculement sur OpenRouter');
    }
  }

  // 3. Fallback OpenRouter
  if (openrouterKey) {
    try {
      return await analyserViaOpenRouter(texte, openrouterKey);
    } catch (err: any) {
      if (!err.quota) throw err;
      console.warn('OpenRouter quota dépassé');
    }
  }

  throw new Error('Tous les fournisseurs AI sont temporairement indisponibles. Réessayez demain.');
}
