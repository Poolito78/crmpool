/**
 * Extraction de pièces jointes depuis un fichier .msg Outlook (format CFBF)
 *
 * On lit d'abord la structure du conteneur (`lirePiecesJointesMsg`) : chaque
 * pièce jointe y est un dossier, ses octets sont exacts et son nom est celui
 * qu'a choisi l'expéditeur.
 *
 * Le balayage binaire qui suit ne sert plus que de secours. Il découpait le
 * PDF entre `%PDF-` et le PREMIER `%%EOF` — or un PDF linéarisé (le cas
 * courant : Outlook, Adobe, toute pièce jointe « optimisée pour le web ») en
 * porte un tout au début, juste après sa table de première page. La coupe
 * emportait l'en-tête et laissait le corps du document derrière : pdf.js
 * refusait le fichier avec « Invalid Root reference. » On garde désormais le
 * DERNIER `%%EOF` avant le PDF suivant — la vraie fin du document.
 *
 * Signatures balayées :
 * - PDF  : %PDF- … %%EOF
 * - XLSX : PK\x03\x04 … PK\x05\x06 (ZIP Local File Header … End of Central Dir)
 * - XLS  : \xD0\xCF\x11\xE0 (CFBF header = vieux format Excel/Word)
 */

const PDF_SIG    = [0x25, 0x50, 0x44, 0x46, 0x2D]; // %PDF-
const EOF_MARK   = [0x25, 0x25, 0x45, 0x4F, 0x46]; // %%EOF
const ZIP_LFH    = [0x50, 0x4B, 0x03, 0x04];        // PK local file header (xlsx/ods/zip)
const ZIP_EOCD   = [0x50, 0x4B, 0x05, 0x06];        // PK end of central directory

function indexOf(bytes: Uint8Array, pattern: number[], from = 0): number {
  outer: for (let i = from; i <= bytes.length - pattern.length; i++) {
    for (let j = 0; j < pattern.length; j++) {
      if (bytes[i + j] !== pattern[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** Lit un uint32 little-endian depuis bytes[pos] */
function readU32LE(bytes: Uint8Array, pos: number): number {
  return bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24);
}
/** Lit un uint16 little-endian depuis bytes[pos] */
function readU16LE(bytes: Uint8Array, pos: number): number {
  return bytes[pos] | (bytes[pos + 1] << 8);
}

export interface PdfExtrait {
  name: string;
  type: 'pdf' | 'xlsx';
  buffer: ArrayBuffer;
}

/** Type reconnu d'une pièce jointe, par son nom puis par ses premiers octets. */
function typeDePiece(nom: string, buffer: ArrayBuffer): PdfExtrait['type'] | null {
  if (/\.pdf$/i.test(nom)) return 'pdf';
  if (/\.(xlsx|xlsm|xls|csv|ods)$/i.test(nom)) return 'xlsx';
  // Nom absent ou trompeur : la signature du fichier tranche.
  const tete = new Uint8Array(buffer, 0, Math.min(PDF_SIG.length, buffer.byteLength));
  if (PDF_SIG.every((b, i) => tete[i] === b)) return 'pdf';
  return null;
}

/**
 * Extrait les pièces jointes PDF et Excel d'un fichier .msg Outlook.
 */
export async function extrairePJsDeMsg(file: File): Promise<PdfExtrait[]> {
  try {
    const { lirePiecesJointesMsg } = await import('@/lib/lireMsg');
    const pjs = await lirePiecesJointesMsg(file);
    /* Une seule pièce jointe vue suffit à faire foi : le message qui n'en
       porte aucune d'exploitable (une image de signature, par exemple) n'a
       rien à gagner au balayage binaire, qui ne trouverait que des morceaux. */
    if (pjs.length > 0) {
      return pjs
        .map(pj => ({ name: pj.nom, buffer: pj.buffer, type: typeDePiece(pj.nom, pj.buffer) }))
        .filter((pj): pj is PdfExtrait => pj.type !== null);
    }
  } catch (err) {
    console.warn('[msg] structure illisible, repli sur le balayage binaire :', err);
  }
  return extrairePJsDeMsgHeuristique(file);
}

/** Ancienne méthode, conservée en secours. */
async function extrairePJsDeMsgHeuristique(file: File): Promise<PdfExtrait[]> {
  const buffer = await file.arrayBuffer();
  const bytes  = new Uint8Array(buffer);
  const results: PdfExtrait[] = [];

  // ── 1. PDF : %PDF- … %%EOF ──
  let search = 0;
  let idxPdf = 0;
  while (true) {
    const start = indexOf(bytes, PDF_SIG, search);
    if (start === -1) break;
    const suivant = indexOf(bytes, PDF_SIG, start + 10);
    const borne = suivant !== -1 ? suivant : bytes.length;
    /* Le DERNIER `%%EOF` avant le PDF suivant : un document linéarisé ou
       modifié en porte plusieurs, et seul le dernier ferme le fichier. */
    let end = -1;
    for (let pos = start + 100; ; ) {
      const m = indexOf(bytes, EOF_MARK, pos);
      if (m === -1 || m >= borne) break;
      end = m + EOF_MARK.length;
      pos = end;
    }
    if (end === -1) end = borne;
    const slice = buffer.slice(start, end);
    if (slice.byteLength >= 100) {
      idxPdf++;
      results.push({ name: `piece-jointe-${idxPdf}.pdf`, type: 'pdf', buffer: slice });
    }
    search = end;
  }

  // ── 2. XLSX/ZIP ──
  // Stratégie : parcourir tous les EOCD (PK\x05\x06) et reconstruire le ZIP
  // en calculant le vrai début depuis les offsets du répertoire central.
  // Ceci contourne le problème des data descriptors (tailles à 0 dans LFH).
  {
    let idxXls = 0;
    let eocdSearch = 0;
    while (true) {
      const eocdPos = indexOf(bytes, ZIP_EOCD, eocdSearch);
      if (eocdPos === -1 || eocdPos + 22 > bytes.length) break;

      const commentLen = readU16LE(bytes, eocdPos + 20);
      const zipEnd     = eocdPos + 22 + commentLen;

      // Offset et taille du répertoire central (relatifs au DÉBUT du ZIP)
      const cdSize   = readU32LE(bytes, eocdPos + 12);
      const cdOffset = readU32LE(bytes, eocdPos + 16);

      // Ignorer les valeurs ZIP64 (0xFFFFFFFF) ou incohérentes
      if (cdSize !== 0xFFFFFFFF && cdOffset !== 0xFFFFFFFF && cdSize > 0 && cdOffset < eocdPos) {
        // Déduire le début du ZIP dans le binaire .msg
        const zipStart = eocdPos - cdOffset - cdSize;

        if (zipStart >= 0 && zipStart < eocdPos && zipEnd - zipStart >= 200) {
          // Vérifier que le début ressemble à un LFH (PK\x03\x04) ou un fichier vide (PK\x05\x06)
          const sig0 = bytes[zipStart]; const sig1 = bytes[zipStart + 1];
          const isValidStart = (sig0 === 0x50 && sig1 === 0x4B); // "PK"
          if (isValidStart) {
            const slice = buffer.slice(zipStart, zipEnd);
            idxXls++;
            results.push({ name: `piece-jointe-${idxXls}.xlsx`, type: 'xlsx', buffer: slice });
          }
        }
      }

      eocdSearch = eocdPos + 1;
    }
  }

  return results;
}

/** @deprecated Utiliser extrairePJsDeMsg */
export async function extrairePDFsDeMsg(file: File): Promise<PdfExtrait[]> {
  return (await extrairePJsDeMsg(file)).filter(p => p.type === 'pdf');
}

/**
 * Patterns de lignes techniques à supprimer de l'extraction .msg.
 * Couvre : Exchange DN, flux CFBF, GUID, hex, headers MIME/DKIM, etc.
 */
const TECH_PATTERNS: RegExp[] = [
  // Chemins Exchange DN  : /O=EXCHANGELABS/OU=.../CN=...
  /\/O=|\/OU=|\/CN=RECIPIENTS/i,
  // Identifiants Exchange internes
  /EXCHANGELABS|FYDIBOHF23SPDLT/i,
  // Noms de flux CFBF : __substg1.0_*, __properties, __recip*, __attach*, __nameid*
  /__substg|__properties|__recip|__attach|__nameid|__mapi/i,
  // GUID : 8-4-4-4-12 hex
  /^[{(]?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[})]?$/i,
  // Chaînes hex pures (≥16 chars)
  /^[0-9A-Fa-f]{16,}$/,
  // MAPI property tag (exactement 8 chiffres hex)
  /^[0-9A-F]{8}$/,
  // Headers X- Exchange/Microsoft
  /^x-ms-|^x-exchange|^x-microsoft|^x-originating|^x-forefront|^x-google|^x-mailer/i,
  // Headers MIME / email standards
  /^arc-|^dkim-|^dmarc|^spf |^authentication-results:|^received:|^delivered-to:|^thread-index:/i,
  /^return-path:|^message-id:|^mime-version:|^content-type:|^content-transfer-|^content-disposition:|^in-reply-to:|^references:/i,
  // Mots-clés techniques Exchange
  /EntityExtraction|ItemProcessor|SafeLinks|ATPSafeLinks|substg1/i,
  // Chaînes base64 longues (>40 chars sans espace)
  /^[A-Za-z0-9+/]{40,}={0,2}$/,
  // Valeur technique : clé: hexlong
  /^[A-Za-z0-9_-]{3,30}:\s+[a-f0-9@.\-]{20,}$/i,
  // Adresses Exchange internes (format SMTP interne)
  /^(imceaex-|imcea)/i,
];

function isTechLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  return TECH_PATTERNS.some(p => p.test(t));
}

/**
 * Texte utile d'un message Outlook.
 *
 * On lit d'abord la structure du fichier (voir lireMsg) : objet, expéditeur et
 * corps sont alors exacts. L'ancienne heuristique — balayage des octets puis
 * liste noire — ne sert plus que de secours pour un fichier abîmé ou d'un
 * format inattendu : elle laissait passer les en-têtes de transport Exchange,
 * que l'analyse prenait pour le corps du message.
 */
export async function extraireTexteDeMsg(file: File): Promise<string> {
  try {
    const { lireMsg } = await import('@/lib/lireMsg');
    const msg = await lireMsg(file);
    if (msg.corps || msg.sujet) return msg.texte;
  } catch (err) {
    console.warn('[msg] lecture structurée impossible, repli heuristique :', err);
  }
  return extraireTexteDeMsgHeuristique(file);
}

/** Ancienne méthode, conservée en secours. */
async function extraireTexteDeMsgHeuristique(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes  = new Uint8Array(buffer);
  const chunks: string[] = [];

  // Recherche de séquences UTF-16-LE lisibles (hi-byte = 0, lo-byte printable ASCII)
  let run = '';
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const lo = bytes[i];
    const hi = bytes[i + 1];
    if (hi === 0 && lo >= 0x20 && lo < 0x7F) {
      run += String.fromCharCode(lo);
    } else {
      if (run.length > 40) chunks.push(run);
      run = '';
    }
  }
  if (run.length > 40) chunks.push(run);

  const filtered = chunks
    .join('\n')
    .split('\n')
    .filter(line => !isTechLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Si le résultat ne contient pas de mots lisibles (trop de technique résiduel), retourner vide
  const motsLisibles = (filtered.match(/[a-zA-ZÀ-ÿ]{4,}/g) || []).length;
  if (motsLisibles < 5) return '';

  return filtered;
}
