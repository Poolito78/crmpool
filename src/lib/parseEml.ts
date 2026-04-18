export interface EmlContent {
  texte: string;
  pdfBuffers: { name: string; buffer: ArrayBuffer }[];
  contact?: {
    telephone: string;
    telephoneMobile: string;
    adresse: string;
    ville: string;
    codePostal: string;
  };
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const clean = b64.replace(/\s/g, '');
  const binary = atob(clean);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

function base64ToString(b64: string): string {
  try {
    const clean = b64.replace(/\s/g, '');
    const binary = atob(clean);
    // Tente décodage UTF-8
    try {
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return binary;
    }
  } catch { return ''; }
}

function decoderContenu(contenu: string, encoding: string): string {
  const enc = encoding.toLowerCase().trim();
  if (enc === 'base64') return base64ToString(contenu);
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

function extraireContactDuTexte(txt: string) {
  let fixe = '', mobile = '';
  const phones: string[] = [];
  for (const m of txt.matchAll(/(?:t[eé]l?|phone|fixe?|mobile|mob|port(?:able)?|gsm)\s*[:.]\s*([+\d][\d\s.\-/]{5,18}\d)/gi))
    phones.push(m[1].replace(/\s+/g, ' ').trim());
  for (const m of txt.matchAll(/(?<![.\d@])(\+33[\s.\-]?[1-9](?:[\s.\-]?\d{2}){4}|0[1-9](?:[\s.\-]?\d{2}){4})(?![.\d])/g))
    phones.push(m[1].replace(/\s+/g, ' ').trim());
  for (const num of [...new Set(phones)]) {
    const d = num.replace(/\D/g, '');
    const isMobile = /^(06|07|336|337)/.test(d) || /^(6|7)/.test(d.replace(/^33/, ''));
    if (isMobile && !mobile) mobile = num;
    else if (!isMobile && !fixe) fixe = num;
  }
  const cpMatch = txt.match(/(\d{5})\s+([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ][A-Za-zÀ-ÿ\s\-]{2,40})/);
  const addrMatch = txt.match(/(\d+[\s,]+(?:rue|avenue|av\.?|boulevard|bd\.?|chemin|place|impasse|allée|route|voie|cité|résidence)\s+[^\n\r,]{3,60})/i);
  return {
    telephone: fixe,
    telephoneMobile: mobile,
    adresse: addrMatch ? addrMatch[1].trim() : '',
    codePostal: cpMatch ? cpMatch[1] : '',
    ville: cpMatch ? cpMatch[2].trim() : '',
  };
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
    // Accumule tous les fragments HTML (pas seulement le premier)
    if (stripped) state.html += (state.html ? '\n' : '') + stripped;
  }
}

export async function parseEml(file: File): Promise<EmlContent> {
  const raw = await file.text();
  const state: ParseState = { plain: '', html: '', pdfBuffers: [] };

  const subjectMatch = raw.match(/^Subject:\s*(.+)/mi);
  const subjectPrefix = subjectMatch ? `Objet : ${subjectMatch[1].trim()}\n\n` : '';

  parserPartie(raw, state);

  // Extraire les coordonnées depuis le HTML (qui contient la signature Outlook)
  const contact = state.html ? extraireContactDuTexte(state.html) : undefined;

  // Pour le texte envoyé à l'IA : plain text (plus propre pour analyse)
  const texte = subjectPrefix + (state.plain || state.html);

  return {
    texte,
    pdfBuffers: state.pdfBuffers,
    contact: contact && (contact.telephone || contact.telephoneMobile || contact.adresse) ? contact : undefined,
  };
}
