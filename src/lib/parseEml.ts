export interface EmlContent {
  texte: string;
  pdfBuffers: { name: string; buffer: ArrayBuffer }[];
}

/** Décode une chaîne base64 en ArrayBuffer */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const clean = b64.replace(/\s/g, '');
  const binary = atob(clean);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

/** Décode le contenu d'une partie MIME (base64 ou quoted-printable ou plain) */
function decoderContenu(contenu: string, encoding: string): string {
  const enc = encoding.toLowerCase().trim();
  if (enc === 'base64') {
    try { return atob(contenu.replace(/\s/g, '')); } catch { return ''; }
  }
  if (enc === 'quoted-printable') {
    return contenu
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }
  return contenu;
}

/** Extrait les en-têtes d'une partie MIME */
function extraireHeaders(part: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const [headerSection] = part.split(/\r?\n\r?\n/);
  // Déplier les lignes continuées (commençant par espace/tab)
  const lines = headerSection.replace(/\r?\n[ \t]/g, ' ').split(/\r?\n/);
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      headers[line.slice(0, idx).toLowerCase().trim()] = line.slice(idx + 1).trim();
    }
  }
  return headers;
}

/** Parse récursivement une partie MIME */
function parserPartie(part: string, result: EmlContent) {
  const headers = extraireHeaders(part);
  const contentType = headers['content-type'] || '';
  const encoding = headers['content-transfer-encoding'] || '7bit';

  // Multipart → récursion
  const boundaryMatch = contentType.match(/boundary=["']?([^"';\s]+)["']?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const bodyStart = part.indexOf('\n\n') + 2;
    const body = part.slice(bodyStart);
    const parts = body.split(new RegExp(`--${escapeRegex(boundary)}(?:--)?`));
    for (const sub of parts.slice(1)) {
      if (sub.trim() && !sub.trim().startsWith('--')) parserPartie(sub.trim(), result);
    }
    return;
  }

  // Extraire le corps de la partie
  const bodyStart = part.indexOf('\n\n');
  if (bodyStart === -1) return;
  const rawBody = part.slice(bodyStart + 2);

  // PDF en pièce jointe
  if (contentType.toLowerCase().includes('application/pdf')) {
    const nameMatch = contentType.match(/name=["']?([^"';\s]+)["']?/i)
      || (headers['content-disposition'] || '').match(/filename=["']?([^"';\s]+)["']?/i);
    const name = nameMatch ? nameMatch[1] : 'document.pdf';
    try {
      const buffer = base64ToArrayBuffer(rawBody);
      result.pdfBuffers.push({ name, buffer });
    } catch { /* ignore */ }
    return;
  }

  // Texte plain
  if (contentType.toLowerCase().includes('text/plain') || contentType === '') {
    const decoded = decoderContenu(rawBody, encoding);
    if (decoded.trim()) result.texte += (result.texte ? '\n\n' : '') + decoded.trim();
    return;
  }

  // HTML → strip tags
  if (contentType.toLowerCase().includes('text/html')) {
    const decoded = decoderContenu(rawBody, encoding);
    const stripped = decoded.replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|tr|li|td)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    // HTML toujours préféré au texte plain — les signatures Outlook sont uniquement dans le HTML
    if (stripped) result.texte = stripped;
  }
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Parse un fichier .eml et extrait le texte + les PDF en pièces jointes */
export async function parseEml(file: File): Promise<EmlContent> {
  const raw = await file.text();
  const result: EmlContent = { texte: '', pdfBuffers: [] };

  // Extraire le sujet comme contexte
  const subjectMatch = raw.match(/^Subject:\s*(.+)/mi);
  if (subjectMatch) result.texte = `Objet : ${subjectMatch[1].trim()}\n\n`;

  parserPartie(raw, result);
  return result;
}
