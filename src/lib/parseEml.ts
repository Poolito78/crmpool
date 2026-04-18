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

/** Extrait les headers MIME d'une section (gère CRLF et LF, et les headers repliés) */
function extraireHeaders(headerSection: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = headerSection.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, ' ').split('\n');
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      headers[line.slice(0, idx).toLowerCase().trim()] = line.slice(idx + 1).trim();
    }
  }
  return headers;
}

/** Sépare la section headers de la section body d'une partie MIME */
function splitHeaderBody(part: string): { headerSection: string; body: string } | null {
  // Cherche le séparateur headers/body : ligne vide (\r\n\r\n ou \n\n)
  const crlfIdx = part.indexOf('\r\n\r\n');
  const lfIdx   = part.indexOf('\n\n');
  let sepIdx = -1;
  let sepLen = 4;
  if (crlfIdx !== -1 && (lfIdx === -1 || crlfIdx <= lfIdx)) {
    sepIdx = crlfIdx; sepLen = 4;
  } else if (lfIdx !== -1) {
    sepIdx = lfIdx; sepLen = 2;
  }
  if (sepIdx === -1) return null;
  return {
    headerSection: part.slice(0, sepIdx),
    body: part.slice(sepIdx + sepLen),
  };
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

function parserPartie(part: string, state: ParseState, depth = 0) {
  if (depth > 10) return;

  const split = splitHeaderBody(part);
  if (!split) return;

  const { headerSection, body } = split;
  const headers = extraireHeaders(headerSection);
  const contentType = headers['content-type'] || '';
  const encoding = headers['content-transfer-encoding'] || '7bit';

  // Multipart — cherche le boundary avec regex plus souple (espaces autour du =)
  const boundaryMatch = contentType.match(/boundary\s*=\s*["']?([^"';\s\r\n]+)["']?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const esc = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Découpe sur --boundary (avec ou sans CRLF)
    const parts = body.split(new RegExp(`--${esc}(?:--)?[ \t]*(?:\r?\n|$)`));
    for (const sub of parts.slice(1)) {
      const trimmed = sub.trim();
      if (trimmed && !trimmed.startsWith('--')) parserPartie(trimmed, state, depth + 1);
    }
    return;
  }

  // Partie feuille PDF
  if (contentType.toLowerCase().includes('application/pdf')) {
    const nameMatch = contentType.match(/name\s*=\s*["']?([^"';\s\r\n]+)["']?/i)
      || (headers['content-disposition'] || '').match(/filename\s*=\s*["']?([^"';\s\r\n]+)["']?/i);
    const name = nameMatch ? nameMatch[1] : 'document.pdf';
    try { state.pdfBuffers.push({ name, buffer: base64ToArrayBuffer(body) }); } catch { }
    return;
  }

  // Partie feuille HTML
  if (contentType.toLowerCase().includes('text/html')) {
    const decoded = decoderContenu(body, encoding);
    const stripped = stripHtml(decoded);
    if (stripped) state.html += (state.html ? '\n' : '') + stripped;
    return;
  }

  // Partie feuille texte plain (ou sans content-type)
  if (contentType.toLowerCase().includes('text/plain') || contentType === '') {
    const decoded = decoderContenu(body, encoding);
    if (decoded.trim()) state.plain += (state.plain ? '\n\n' : '') + decoded.trim();
    return;
  }
}

export async function parseEml(file: File): Promise<EmlContent> {
  console.warn('[parseEml] CALLED:', file.name, file.size);
  const raw = await file.text();
  console.warn('[parseEml] raw length:', raw.length, '| starts with:', raw.slice(0, 80).replace(/\r\n/g, '↵'));
  const state: ParseState = { plain: '', html: '', pdfBuffers: [] };

  const subjectMatch = raw.match(/^Subject:\s*(.+)/mi);
  const subjectPrefix = subjectMatch ? `Objet : ${subjectMatch[1].trim()}\n\n` : '';

  parserPartie(raw, state);

  // Contact : privilégie HTML (signature Outlook), fallback sur plain
  const contactSrc = state.html || state.plain;
  const contact = contactSrc ? extraireContactDuTexte(contactSrc) : undefined;

  const texte = subjectPrefix + (state.plain || state.html);

  console.warn('[parseEml] plain:', state.plain.length, 'html:', state.html.length, 'pdfs:', state.pdfBuffers.length);
  console.warn('[parseEml] html[:200]:', state.html.slice(0, 200));
  console.warn('[parseEml] contact:', contact);

  return {
    texte,
    pdfBuffers: state.pdfBuffers,
    contact: contact && (contact.telephone || contact.telephoneMobile || contact.adresse) ? contact : undefined,
  };
}
