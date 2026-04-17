/**
 * Extraction de pièces jointes depuis un fichier .msg Outlook (format CFBF)
 *
 * Stratégie : balayage binaire des signatures connues dans le flux brut.
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

/**
 * Extrait les pièces jointes PDF et Excel d'un fichier .msg Outlook.
 */
export async function extrairePJsDeMsg(file: File): Promise<PdfExtrait[]> {
  const buffer = await file.arrayBuffer();
  const bytes  = new Uint8Array(buffer);
  const results: PdfExtrait[] = [];

  // ── 1. PDF : %PDF- … %%EOF ──
  let search = 0;
  let idxPdf = 0;
  while (true) {
    const start = indexOf(bytes, PDF_SIG, search);
    if (start === -1) break;
    let end = indexOf(bytes, EOF_MARK, start + 100);
    if (end === -1) {
      const next = indexOf(bytes, PDF_SIG, start + 10);
      end = next !== -1 ? next : bytes.length;
    } else {
      end += EOF_MARK.length;
    }
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
  /^X-MS-|^X-ms-|^X-Exchange|^X-Microsoft|^X-Originating|^X-Forefront/,
  // Headers MIME / email standards
  /^ARC-|^DKIM-|^DMARC|^SPF |^Authentication-Results:|^Received:/,
  /^Return-Path:|^Message-ID:|^MIME-Version:|^Content-Type:|^Content-Transfer-|^Content-Disposition:/,
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
 * Tente d'extraire le corps texte utile d'un .msg (heuristique UTF-16-LE).
 * Filtre agressivement toutes les métadonnées CFBF et routing Exchange.
 */
export async function extraireTexteDeMsg(file: File): Promise<string> {
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
