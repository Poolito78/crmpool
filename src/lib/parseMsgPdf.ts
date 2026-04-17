/**
 * Extraction de PDF depuis un fichier .msg Outlook (format CFBF)
 *
 * Stratégie : balayage binaire des signatures PDF (%PDF-) et fins (%%EOF)
 * dans le flux brut du fichier .msg. Fonctionne pour la plupart des pièces
 * jointes PDF non compressées stockées dans le CFBF.
 */

const PDF_SIG   = [0x25, 0x50, 0x44, 0x46, 0x2D]; // %PDF-
const EOF_MARK  = [0x25, 0x25, 0x45, 0x4F, 0x46]; // %%EOF

function indexOf(bytes: Uint8Array, pattern: number[], from = 0): number {
  outer: for (let i = from; i <= bytes.length - pattern.length; i++) {
    for (let j = 0; j < pattern.length; j++) {
      if (bytes[i + j] !== pattern[j]) continue outer;
    }
    return i;
  }
  return -1;
}

export interface PdfExtrait {
  name: string;
  buffer: ArrayBuffer;
}

export async function extrairePDFsDeMsg(file: File): Promise<PdfExtrait[]> {
  const buffer = await file.arrayBuffer();
  const bytes   = new Uint8Array(buffer);
  const results: PdfExtrait[] = [];
  let   search  = 0;
  let   index   = 0;

  while (true) {
    const start = indexOf(bytes, PDF_SIG, search);
    if (start === -1) break;

    // Chercher %%EOF après le début du PDF
    let end = indexOf(bytes, EOF_MARK, start + 100);
    if (end === -1) {
      // Pas de marqueur de fin trouvé → prendre jusqu'à la prochaine signature ou fin du fichier
      const nextPdf = indexOf(bytes, PDF_SIG, start + 10);
      end = nextPdf !== -1 ? nextPdf : bytes.length;
    } else {
      end += EOF_MARK.length; // inclure %%EOF
    }

    const slice = buffer.slice(start, end);
    // Vérification minimale : un PDF valide fait au moins 100 octets
    if (slice.byteLength >= 100) {
      index++;
      results.push({ name: `piece-jointe-${index}.pdf`, buffer: slice });
    }

    search = end;
  }

  return results;
}

/** Tente d'extraire le corps texte brut d'un .msg (heuristique Unicode) */
export async function extraireTexteDeMsg(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes  = new Uint8Array(buffer);
  const chunks: string[] = [];

  // Recherche de séquences UTF-16-LE lisibles (caractères ASCII étendu)
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

  return chunks.join('\n').trim();
}
