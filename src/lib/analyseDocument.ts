import * as pdfjsLib from 'pdfjs-dist';
import { appelerGemini, texteGemini } from './modelesIA';

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
  /**
   * Un FOURNISSEUR nous fait une offre de prix. Le symétrique de
   * `devis_client`, et longtemps confondu avec lui : les deux portent le mot
   * « devis », un numéro et des prix. Ce qui les sépare est le sens de la
   * flèche — ici les prix sont ceux qu'on PAIE, pas ceux qu'on demande.
   */
  | 'devis_fournisseur'
  /**
   * Le devis d'un CONCURRENT à notre client — rapporté par le client, jamais
   * émis pour nous. Ses prix alimentent la veille concurrence. Jamais deviné
   * par l'IA : on ne le choisit qu'à la main (« Corriger le type »), car il
   * ressemble en tout point à un devis fournisseur.
   */
  | 'devis_concurrent'
  /**
   * NOTRE offre de prix telle qu'elle est partie (devis Odoo AF…), ou un
   * devis à réaliser : elle ne crée rien, elle se COMPARE au devis du CRM
   * qu'elle reprend pour en tirer les écarts (`comparaisonDevis.ts`). Lue
   * sans IA quand c'est un PDF Odoo (`devisOdooPdf.ts`).
   */
  | 'offre_prix'
  | 'autre';

export const TYPE_LABELS: Record<TypeDocument, { label: string; color: string }> = {
  commande_fournisseur: { label: 'Commande fournisseur', color: 'bg-info/10 text-info' },
  bon_livraison:        { label: 'Bon de livraison',      color: 'bg-accent/10 text-accent' },
  devis_client:         { label: 'Devis client',          color: 'bg-primary/10 text-primary' },
  commande_client:      { label: 'Commande client',       color: 'bg-success/10 text-success' },
  facture_fournisseur:  { label: 'Facture fournisseur',   color: 'bg-warning/10 text-warning' },
  facture_client:       { label: 'Facture client',        color: 'bg-warning/10 text-warning' },
  demande_devis:        { label: 'Demande de devis',      color: 'bg-primary/10 text-primary' },
  devis_fournisseur:    { label: 'Devis fournisseur',     color: 'bg-info/10 text-info' },
  devis_concurrent:     { label: 'Devis concurrent',      color: 'bg-destructive/10 text-destructive' },
  offre_prix:           { label: 'Offre de prix (à comparer au CRM)', color: 'bg-warning/10 text-warning' },
  autre:                { label: 'Autre document',        color: 'bg-muted text-muted-foreground' },
};

export interface LigneAnalysee {
  reference: string;
  description: string;
  quantite: number;
  /**
   * L'unité écrite par le client (« u », « ml », « m² », « kg »), quand il en
   * écrit une. « 22 ml » de pavés n'est pas « 22 m² » : sans l'unité, la
   * quantité devenait une surface sept fois trop grande.
   */
  unite?: string;
  prixUnitaireHT?: number;
  /**
   * Devis REÇU : le prix BRUT de la ligne, avant remise — chez TTS la colonne
   * « P.U. » (1 295 €) à côté du « P.U. NET » (777 €). C'est le prix public
   * conseillé par le fournisseur : il devient le prix public de l'article,
   * le net son prix d'achat.
   */
  prixConseille?: number;
  /** Remise de ligne en %, quand le document l'écrit (40 % chez TTS). */
  remise?: number;
  tva?: number;
  /** Le groupe qui porte la ligne dans une offre Odoo (« AF039468/0001 »). */
  groupe?: string;
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
  "typeDocument": "demande_devis | commande_fournisseur | bon_livraison | devis_client | devis_fournisseur | commande_client | facture_fournisseur | facture_client | autre",
  "numeroDocument": "numéro du document ou null",
  "nomPartenaire": "nom du fournisseur OU du client selon le type — JAMAIS ISOSIGN — ou null",
  "referencePartenaire": "référence interne du partenaire (leur propre n° de commande/devis) ou null",
  "dateDocument": "date au format YYYY-MM-DD ou null",
  "dateLivraisonPrevue": "date de livraison prévue au format YYYY-MM-DD ou null",
  "dateEcheance": "date d'échéance de paiement au format YYYY-MM-DD ou null",
  "totalHT": "montant TOTAL HORS TAXES (H.T.) du document, nombre ou null",
  "totalTTC": "montant TOUTES TAXES COMPRISES (T.T.C. / net à payer), nombre ou null",
  "notes": "remarques importantes ou null",
  "adresseLivraison": "rue de l'adresse de LIVRAISON si elle est distincte de la facturation, ou null",
  "codePostalLivraison": "code postal de l'adresse de LIVRAISON (5 chiffres) ou null",
  "villeLivraison": "ville de l'adresse de LIVRAISON ou null",
  "lignes": [
    {
      "reference": "référence article ou null",
      "description": "désignation de l'article",
      "quantite": 0,
      "unite": "unité écrite par le client (u, ml, m², kg, l…) ou null",
      "prixUnitaireHT": nombre ou null,
      "prixConseille": "prix unitaire BRUT avant remise (colonne P.U. / prix public / tarif), nombre ou null",
      "remise": "remise de la ligne en %, nombre ou null",
      "tva": taux TVA en % ou null
    }
  ]
}

Règles de classification :
- commande_fournisseur : bon de commande envoyé à un fournisseur, arc de commande, confirmation d'achat
- bon_livraison : bon de livraison, avis d'expédition
- devis_client : devis, offre de prix ÉMIS PAR ISOSIGN et adressé à un client
- devis_fournisseur : devis, offre de prix, proposition tarifaire ou tarif
  REÇU D'UN FOURNISSEUR, où ISOSIGN est le destinataire. Ce sont les prix
  qu'ISOSIGN paierait, pas ceux qu'elle demande.
- commande_client : bon de commande reçu d'un client
- facture_fournisseur : facture reçue d'un fournisseur
- facture_client : facture envoyée à un client

Devis client ou devis fournisseur ? Les deux portent le mot « devis », un
numéro et des prix ; seul le SENS du document les sépare. Cherche qui l'émet :
- L'en-tête, le logo et le pied de page portent ISOSIGN (ZA du Monay,
  71210 Saint-Eusèbe, isosign.fr) → ISOSIGN émet → devis_client.
- L'en-tête porte une AUTRE société et ISOSIGN figure en destinataire, en
  « client », en « livré à » ou en « facturé à » → devis_fournisseur.
Dans ce dernier cas « nomPartenaire » est la société ÉMETTRICE — le
fournisseur — jamais ISOSIGN.
- demande_devis : un CLIENT demande un prix ou un devis, le plus souvent par
  courriel. Pas de numéro, pas de prix, pas de total : c'est une demande, pas
  un document comptable. Exemple : « Pouvez-vous nous faire un devis pour 14u
  de J11 avec la galette à coller + colle ? »

Extraction des lignes d'une demande de devis :
- Chaque article cité devient une ligne, même sans référence ni prix.
- La quantité se lit dans le texte : « 14u », « 14 u », « 14 unités », « 14x »,
  « x14 » et « 14 pièces » valent tous 14. Sans quantité indiquée, mets 1.
- « unite » reprend l'unité écrite : « 22 ml » → quantite 22, unite « ml »
  (mètres LINÉAIRES, une longueur) ; « 30 m² » → unite « m² » (une surface).
  Ne confonds jamais les deux. Sans unité écrite, mets null.
- « description » reprend les mots du client tels quels — « J11 », « galette à
  coller », « colle » — sans les traduire ni les compléter : le rapprochement
  avec le catalogue est fait ensuite par l'application.
- « reference » reste null quand le client n'en donne pas.
- « prixUnitaireHT » reste null : c'est le tarif du client qui décidera.

Extraction des lignes d'un devis ÉMIS (devis_client) — il sera comparé ligne à
ligne au chiffrage du CRM :
- « reference » = le code article, souvent entre crochets en tête de la
  désignation (« [AK3.700.C2.BTR.IS.BRUT] Panneau… ») ; « description » = la
  désignation sans ce code.
- « prixUnitaireHT » = le prix unitaire HT NET, remise de ligne déduite.
- Les frais de port sont une ligne comme une autre.
- Les titres de section, notes et sous-totaux ne sont pas des lignes.

Extraction des lignes d'un devis REÇU (devis_fournisseur) — ses prix seront
repris comme prix d'ACHAT :
- « reference » = le code article DU FOURNISSEUR tel qu'il l'écrit ;
  « description » = sa désignation, conditionnement compris (« fût 25 kg »).
- « prixUnitaireHT » = le prix unitaire HT NET, remise de ligne déduite
  (colonne « P.U. NET », « Net », « Prix net »).
- « prixConseille » = le prix unitaire BRUT de la même ligne, AVANT remise
  (colonne « P.U. », « Prix public », « Tarif », « Prix conseillé ») ;
  « remise » = le pourcentage de remise écrit entre les deux. Exemple :
  « 1,000 1295,00 40,00 777,00 777,00 » → quantite 1, prixConseille 1295,
  remise 40, prixUnitaireHT 777.
  Une colonne « Brut HT » qui répète le PU (aucune remise) est le montant de
  la ligne, PAS un prix conseillé : prixConseille null. Des coefficients de
  revente écrits en pied (« client final X 2 ») ne sont pas des lignes :
  recopie-les dans « notes ».
- Les titres de groupe (« Alimentation solaire : ») ne sont pas des lignes ;
  un même article répété sous plusieurs groupes donne autant de lignes.
- Une majoration ou une participation chiffrée est une ligne (sans remise).
- Les frais de port, d'emballage ou de transport ne sont pas des articles :
  ne les mets pas en lignes, signale-les dans « notes ».
- « nomPartenaire » = la société qui ÉMET le devis : celle de l'en-tête, du
  logo, du capital, du SIRET et du n° de TVA. ISOSIGN figure en
  « Adresse de facturation / de livraison » : ce n'est JAMAIS le partenaire.

Totaux : « totalHT » est le montant HORS TAXES (« Montant H.T. », « Total
HT », « H.T. »), « totalTTC » le montant TOUTES TAXES COMPRISES (« T.T.C. »,
« Net à payer »). Ne les confonds jamais : le TTC est le plus grand des deux.

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
  /* Un modèle rend parfois « 19 958,50 » en chaîne : le total devenait NaN. */
  parsed.totalHT = nombreLu(parsed.totalHT);
  parsed.totalTTC = nombreLu(parsed.totalTTC);
  for (const l of parsed.lignes) {
    l.prixUnitaireHT = nombreLu(l.prixUnitaireHT);
    l.prixConseille = nombreLu(l.prixConseille);
    l.remise = nombreLu(l.remise);
    sansFauxConseille(l);
  }
  return verifierTotaux(parsed);
}

/**
 * UN « BRUT » ÉGAL AU NET N'EST PAS UN PRIX CONSEILLÉ.
 *
 * COM'ROAD (devis 260067) écrit « PU ht 50,00 … Brut ht 50,00 » : le brut
 * est le montant de la ligne, sans remise. Lu comme prix conseillé, il
 * devenait le prix PUBLIC de l'article créé — vendu à son prix d'achat.
 * Sans remise écrite, un conseillé égal au net est retiré.
 */
export function sansFauxConseille(l: LigneAnalysee): LigneAnalysee {
  if (l.prixConseille != null && l.prixUnitaireHT != null
      && Math.abs(l.prixConseille - l.prixUnitaireHT) < 0.005 && !(l.remise && l.remise > 0)) {
    l.prixConseille = undefined;
    l.remise = undefined;
  }
  return l;
}

/** Un montant lu, nombre ou texte à la française ; `undefined` sinon. */
export function nombreLu(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const n = parseFloat(v.replace(/[\s €]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Les totaux contrôlés par la SOMME DES LIGNES, sans IA.
 *
 * Le devis 73974 de TTS sortait à 23 950,20 € HT et 27 941,90 € TTC : le
 * modèle avait pris le net à payer (TTC) pour le HT, puis inventé un TTC.
 * Quand toutes les lignes sont chiffrées, leur somme fait foi : un « HT » qui
 * vaut la somme × (1 + TVA) est en réalité le TTC, et le HT est la somme. Un
 * TTC plus petit que le HT est inversé. Sinon, rien ne bouge — des lignes
 * manquantes (texte tronqué) ne doivent pas fausser un total juste.
 */
export function verifierTotaux(a: DocumentAnalysis): DocumentAnalysis {
  let { totalHT, totalTTC } = a;
  if (totalHT != null && totalTTC != null && totalTTC < totalHT) [totalHT, totalTTC] = [totalTTC, totalHT];
  const chiffrees = a.lignes.filter(l => l.prixUnitaireHT != null);
  if (chiffrees.length && chiffrees.length === a.lignes.length && totalHT != null) {
    const somme = Math.round(chiffrees.reduce((s, l) => s + (l.quantite || 0) * l.prixUnitaireHT!, 0) * 100) / 100;
    const proche = (x: number, y: number) => Math.abs(x - y) <= Math.max(0.05, y * 0.002);
    if (somme > 0 && !proche(totalHT, somme)) {
      const taux = [0.2, 0.1, 0.055, 0.021].find(t => proche(totalHT!, somme * (1 + t)));
      if (taux != null) {
        totalTTC = totalHT;
        totalHT = somme;
      }
    }
  }
  return { ...a, totalHT, totalTTC };
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

/**
 * Texte d'un PDF page par page, UN ÉLÉMENT PAR LIGNE.
 *
 * `extraireTextePDF` aplatit chaque page en une seule ligne : c'est ce qu'il
 * faut à l'IA, et c'est ce qui rend illisible un plan, où chaque cote, chaque
 * mention tient sur sa propre ligne. Ici les fins de ligne de pdf.js sont
 * gardées. Sert à reconnaître et lire les plans Kadri (`planDirectionnel`).
 */
export async function extrairePagesPDF(buffer: ArrayBuffer): Promise<string[]> {
  /* pdf.js détache le tampon qu'on lui passe : on travaille sur une copie,
     l'appelant s'en sert encore pour l'analyse ou l'aperçu. */
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    pages.push(content.items
      .map(item => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : ''))
      .join(''));
  }
  return pages;
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
          max_tokens: 4096,
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
async function analyserViaGemini(texte: string): Promise<DocumentAnalysis> {
  /* ⚠️ La chaîne de repli vit dans l'Edge Function `gemini`, avec la clé.
     Le 404 sur modèle retiré et le 429 de quota s'y distinguent désormais, et
     le message remonté porte le détail de chaque tentative. On garde ici la
     seule chose qui intéresse l'appelant : `quota`, qui déclenche le repli
     vers un autre fournisseur plutôt qu'une erreur à l'écran. */
  try {
    const data = await appelerGemini({
      systemInstruction: { parts: [{ text: PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: `Document :
${texte}` }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 8192 },
    });
    return lireAnalyse(texteGemini(data));
  } catch (e) {
    const m = (e as Error).message || '';
    if (/429|quota/i.test(m)) throw Object.assign(new Error('quota'), { quota: true });
    throw e;
  }
}

/**
 * Le type choisi par l'utilisateur AVANT l'analyse fait foi : le modèle n'a
 * plus à le deviner — un devis reçu adressé à « ISOSIGN SAS » passait pour
 * un devis client — et reçoit la consigne d'extraire selon ce type.
 */
export async function analyserDocument(
  input:
    | { type: 'pdf'; buffer: ArrayBuffer; texteSupplementaire?: string }
    | { type: 'text'; texte: string },
  apiKey: string,
  openrouterKey?: string,
  typeImpose?: TypeDocument,
  /** Ce que la mémoire sait de l'émetteur (`memoireDocuments.ts`), dit au modèle. */
  indice?: string,
): Promise<DocumentAnalysis> {
  const analyse = await analyserSansType(input, apiKey, openrouterKey, typeImpose, indice);
  return typeImpose ? { ...analyse, typeDocument: typeImpose } : analyse;
}

async function analyserSansType(
  input:
    | { type: 'pdf'; buffer: ArrayBuffer; texteSupplementaire?: string }
    | { type: 'text'; texte: string },
  apiKey: string,
  openrouterKey?: string,
  typeImpose?: TypeDocument,
  indice?: string,
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
  if (typeImpose) {
    texte = `TYPE IMPOSÉ PAR L'UTILISATEUR : ${typeImpose} (${TYPE_LABELS[typeImpose].label}). `
      + `Ne reclasse pas le document : « typeDocument » vaut ${typeImpose}, et les champs `
      + `s'extraient selon les règles de ce type.\n\n${texte}`;
  }
  if (indice) texte = `${indice}\n\n${texte}`;

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
  //
  // ⚠️ GROQ PEUT NE RIEN RENDRE (15/10/2026) : sur un devis fournisseur d'une
  // vingtaine de lignes, la réflexion épuisait le budget et Groq répondait
  // 400 « json_validate_failed » avec une génération VIDE — l'analyse
  // s'arrêtait là. D'où `reasoning_effort: 'low'` (l'extraction ne demande
  // pas de raisonner), et tout échec du modèle lui-même — 400 de validation,
  // 413, 5xx, réponse coupée — passe la main à Gemini au lieu de s'afficher.
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        temperature: 0,
        max_tokens: 4096,
        reasoning_effort: 'low',
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
      const repli = response.status === 413 || response.status >= 500
        || (response.status === 400 && /json_validate_failed|failed_generation/.test(err));
      throw Object.assign(new Error(`Erreur API Groq : ${response.status} — ${err}`), { repli });
    }

    const data = await response.json();
    const text: string = data.choices?.[0]?.message?.content ?? '';
    try {
      return lireAnalyse(text);
    } catch (e) {
      throw Object.assign(e as Error, { repli: true });
    }
  } catch (err: any) {
    if (!err.quota && !err.repli) throw err;
    console.warn(err.quota ? 'Groq quota dépassé — basculement sur Gemini'
      : `Groq sans réponse exploitable — basculement sur Gemini (${err.message})`);
  }

  /* 2. Repli Gemini — par l'Edge Function `gemini`.
     ⚠️ **PLUS DE GARDE `if (geminiKey)`.** La clé vit côté serveur : le
     navigateur ne PEUT plus savoir si elle est configurée, et faire semblant
     en gardant une variable de build reviendrait à la remettre dans le bundle,
     ce que ce chantier vient précisément de supprimer. On essaie donc, et
     l'échec parle : la fonction dit si le secret manque. */
  try {
    return await analyserViaGemini(texte);
  } catch (err: any) {
    if (!err.quota) console.warn('Gemini indisponible — basculement sur OpenRouter :', err?.message);
    else console.warn('Gemini quota dépassé — basculement sur OpenRouter');
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
