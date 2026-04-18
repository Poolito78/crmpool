export interface EmlContent {
  texte: string;
  pdfBuffers: { name: string; buffer: ArrayBuffer }[];
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const clean = b64.replace(/\s/g, '');
  const binary = atob(clean);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

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

function extraireHeaders(part: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const [headerSection] = part.split(/\r?\n\r?\n/);
  const lines = headerSection.replace(/\r?\n[ \t]/g, ' ').split(/\r?\n/);
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      headers[line.slice(0, idx).toLowerCase().trim()] = line.slice(idx + 1).trim();
    }
  }
  return headers;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
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
}

/** Détecte si un texte contient des coordonnées de contact (tél, adresse) */
function hasContactInfo(s: string): boolean {
  return /(?:tel|tél|mobile|mob|fixe?)\s*[:.]/i.test(s)
    || /\+33/.test(s)
    || /\b0[67]\d{8}\b/.test(s)
    || /\b\d{5}\s+[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ]/.test(s);
}

interface ParseState {
  plain: string;
  html: string;
  pdfBuffers: { name: string; buffer: ArrayBuffer }[];
}

function parserPartie(part: string, state: ParseState) {
  const headers = extraireHeaders(part);
  const contentType = headers['content-type'] || '';
  const encoding = headers['content-transfer-encoding'] || '7bit';

  const boundaryMatch = contentType.match(/boundary=["']?([^"';\s]+)["']?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const bodyStart = part.indexOf('\n\n') + 2;
    const body = part.slice(bodyStart);
    const esc = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = body.split(new RegExp(`--${esc}(?:--)?`));
    for (const sub of parts.slice(1)) {
      if (sub.trim() && !sub.trim().startsWith('--')) parserPartie(sub.trim(), state);
    }
    return;
  }

  const bodyStart = part.indexOf('\n\n');
  if (bodyStart === -1) return;
  const rawBody = part.slice(bodyStart + 2);

  if (contentType.toLowerCase().includes('application/pdf')) {
    const nameMatch = contentType.match(/name=["']?([^"';\s]+)["']?/i)
      || (headers['content-disposition'] || '').match(/filename=["']?([^"';\s]+)["']?/i);
    const name = nameMatch ? nameMatch[1] : 'document.pdf';
    try { state.pdfBuffers.push({ name, buffer: base64ToArrayBuffer(rawBody) }); } catch { }
    return;
  }

  if (contentType.toLowerCase().includes('text/plain') || contentType === '') {
    const decoded = decoderContenu(rawBody, encoding);
    if (decoded.trim()) state.plain += (state.plain ? '\n\n' : '') + decoded.trim();
    return;
  }

  if (contentType.toLowerCase().includes('text/html')) {
    const decoded = decoderContenu(rawBody, encoding);
    const stripped = stripHtml(decoded);
    if (stripped && !state.html) state.html = stripped;
  }
}

export async function parseEml(file: File): Promise<EmlContent> {
  const raw = await file.text();
  const state: ParseState = { plain: '', html: '', pdfBuffers: [] };

  const subjectMatch = raw.match(/^Subject:\s*(.+)/mi);
  const subjectPrefix = subjectMatch ? `Objet : ${subjectMatch[1].trim()}\n\n` : '';

  parserPartie(raw, state);

  // Stratégie : texte plain pour l'analyse générale,
  // mais si le plain n'a pas de coords de contact et le HTML oui → utiliser HTML
  let texte: string;
  if (state.plain && hasContactInfo(state.plain)) {
    texte = subjectPrefix + state.plain;
  } else if (state.html && hasContactInfo(state.html)) {
    texte = subjectPrefix + state.html;
  } else {
    texte = subjectPrefix + (state.plain || state.html);
  }

  return { texte, pdfBuffers: state.pdfBuffers };
}
