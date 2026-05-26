import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

export interface TransportExtrait {
  fournisseur?: string;  // l'expéditeur / donneur d'ordre (ex: QRM, TREMCO CPG)
  transporteur?: string; // le prestataire transport (ex: UPS, Heppner)
  date?: string;
  poidsKg?: number;
  prixHT?: number;
  deptDepart?: string;
  deptArrivee?: string;
  distanceKm?: number;
  reference?: string;
  note?: string;
}

const PROMPT = `Tu es un assistant spécialisé dans l'extraction de données depuis des factures, lettres de voiture et bons de transport.
Extrait les informations de transport. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :
{
  "fournisseur": "nom de l'expéditeur / donneur d'ordre / client de la livraison (ex: QRM, TREMCO CPG, Sika, Mapei…) — c'est le nom de l'entreprise qui a fait appel au transporteur, pas le transporteur lui-même. ou null",
  "transporteur": "nom du prestataire transport (UPS, Heppner, GLS, DB Schenker, TNT, Geodis, XPO, DHL, Fedex…) ou null",
  "date": "date de la facture ou de la livraison au format YYYY-MM-DD ou null",
  "poidsKg": nombre (poids expédié en kg) ou null,
  "prixHT": nombre (montant HT des frais de transport en euros) ou null,
  "deptDepart": "numéro de département d'expédition (ex: 76) ou null",
  "deptArrivee": "numéro de département de livraison (ex: 13) ou null",
  "distanceKm": nombre (distance en km si mentionnée) ou null,
  "reference": "numéro de bordereau, lettre de voiture, facture ou commande ou null",
  "note": "informations utiles : express, palette, hayon, relivraison, produits transportés, etc. ou null"
}
Les montants doivent être des nombres (ex: 87.50 et non "87,50 €").
Ne génère aucun texte en dehors du JSON.`;

async function extraireTextePDF(buffer: ArrayBuffer): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => item.str).join(' '));
  }
  return pages.join('\n').slice(0, 6000);
}

async function parseJSON(text: string): Promise<TransportExtrait> {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Pas de JSON dans la réponse');
  return JSON.parse(m[0]) as TransportExtrait;
}

async function callGroq(texte: string, apiKey: string): Promise<TransportExtrait> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      temperature: 0,
      max_tokens: 512,
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: `Document :\n${texte}` },
      ],
    }),
  });
  if (res.status === 429) throw Object.assign(new Error('quota'), { quota: true });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  return parseJSON(data.choices?.[0]?.message?.content ?? '');
}

async function callGemini(texte: string, geminiKey: string): Promise<TransportExtrait> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: `Document :\n${texte}` }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 512 },
      }),
    },
  );
  if (res.status === 429) throw Object.assign(new Error('quota'), { quota: true });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  return parseJSON(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
}

async function callOpenRouter(texte: string, key: string): Promise<TransportExtrait> {
  const models = [
    'meta-llama/llama-4-scout:free',
    'meta-llama/llama-4-maverick:free',
    'deepseek/deepseek-v3-0324:free',
    'google/gemma-4-26b-a4b-it:free',
  ];
  for (const model of models) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 512,
          messages: [
            { role: 'system', content: PROMPT },
            { role: 'user', content: `Document :\n${texte}` },
          ],
        }),
      });
      if (res.status === 429 || res.status === 404) continue;
      if (!res.ok) continue;
      const data = await res.json();
      return parseJSON(data.choices?.[0]?.message?.content ?? '');
    } catch { /* essayer suivant */ }
  }
  throw Object.assign(new Error('quota'), { quota: true });
}

export async function analyserDocumentTransport(
  file: File,
  apiKey?: string,
  geminiKey?: string,
  openrouterKey?: string,
): Promise<TransportExtrait> {
  // Extraire le texte
  let texte: string;
  const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPDF) {
    const buffer = await file.arrayBuffer();
    texte = await extraireTextePDF(buffer);
  } else {
    texte = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result.slice(0, 6000) : '');
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  if (!texte.trim()) throw new Error('Document vide ou illisible');

  // Chaîne de fallback IA
  if (apiKey) {
    try { return await callGroq(texte, apiKey); }
    catch (e: any) { if (!e.quota) throw e; console.warn('Groq quota → Gemini'); }
  }
  if (geminiKey) {
    try { return await callGemini(texte, geminiKey); }
    catch (e: any) { if (!e.quota) throw e; console.warn('Gemini quota → OpenRouter'); }
  }
  if (openrouterKey) {
    try { return await callOpenRouter(texte, openrouterKey); }
    catch (e: any) { if (!e.quota) throw e; }
  }

  throw new Error('Aucune clé IA disponible (configurez VITE_GROQ_API_KEY)');
}
