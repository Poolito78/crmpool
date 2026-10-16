/**
 * Image d'une page de PDF, au plus léger SANS PERTE VISIBLE.
 *
 * Le PDF d'un devis est une capture (`generatePdfFromElement`, html2canvas) :
 * chaque page est une image. En JPEG 0,92, deux pages pesaient le méga-octet,
 * et le JPEG bave autour des lettres. Or une page de devis ne porte que
 * quelques centaines de couleurs — blanc, noir, rouge et les demi-teintes de
 * l'anti-crénelage : les 256 plus fréquentes couvrent 99,8 % des pixels
 * (mesuré). En PNG à palette, la page se compresse sans perte, ≈ −60 % sur
 * une page de texte, et le texte reste plus net qu'en JPEG.
 *
 * Un pixel hors palette prend la couleur la plus proche. Tant que l'écart
 * reste faible (un bord de lettre), il ne se voit pas. Une PHOTO — vignette
 * d'article, image collée dans une note — en porte des milliers d'éloignés :
 * la palette la postériserait. La page repart alors en JPEG, comme avant
 * (`indexerPixels` rend `null`). On ne perd jamais en qualité pour gagner en
 * poids.
 *
 * Le logo des en-têtes répétés suit la même logique (`logoAllege`) : posé à
 * 28 mm, il était embarqué à 1 376 px, non compressé — 1,2 Mo à lui seul,
 * plus que les pages. 660 px, c'est déjà 600 dpi à l'impression.
 */

/** Écart toléré par canal (sur 255) entre un pixel et sa couleur de palette. */
export const ECART_TOLERE = 24;
/** Au-delà de ce nombre de pixels trop écartés, la page garde le JPEG. */
export const PIXELS_ECARTES_MAX = 400;

/**
 * Palette (RVB, 3 octets par couleur) et indice de chaque pixel, ou `null`
 * quand la palette dégraderait l'image (photo). L'alpha est ignoré : la
 * capture est faite sur fond blanc opaque.
 */
export function indexerPixels(
  rgba: Uint8ClampedArray | Uint8Array,
  largeur: number,
  hauteur: number,
): { palette: Uint8Array; indices: Uint8Array } | null {
  const n = largeur * hauteur;
  const compte = new Map<number, number>();
  for (let i = 0; i < n * 4; i += 4) {
    const k = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    compte.set(k, (compte.get(k) ?? 0) + 1);
  }

  const couleurs = [...compte.entries()].sort((a, b) => b[1] - a[1]);
  const retenues = couleurs.slice(0, 256).map(e => e[0]);
  const indice = new Map<number, number>(retenues.map((k, i) => [k, i]));

  // Les couleurs hors palette : la plus proche, et on compte celles qui s'en écartent trop.
  let ecartes = 0;
  for (const [k, occurrences] of couleurs.slice(256)) {
    const r = (k >> 16) & 255, g = (k >> 8) & 255, b = k & 255;
    let meilleur = 0, distance = Infinity;
    for (let i = 0; i < retenues.length; i++) {
      const p = retenues[i];
      const dr = ((p >> 16) & 255) - r, dg = ((p >> 8) & 255) - g, db = (p & 255) - b;
      const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (d < distance) { distance = d; meilleur = i; }
    }
    const p = retenues[meilleur];
    const ecart = Math.max(
      Math.abs(((p >> 16) & 255) - r), Math.abs(((p >> 8) & 255) - g), Math.abs((p & 255) - b),
    );
    if (ecart > ECART_TOLERE) {
      ecartes += occurrences;
      if (ecartes > PIXELS_ECARTES_MAX) return null;
    }
    indice.set(k, meilleur);
  }

  const palette = new Uint8Array(retenues.length * 3);
  retenues.forEach((k, i) => {
    palette[i * 3] = (k >> 16) & 255;
    palette[i * 3 + 1] = (k >> 8) & 255;
    palette[i * 3 + 2] = k & 255;
  });
  const indices = new Uint8Array(n);
  for (let j = 0, i = 0; j < n; j++, i += 4) {
    indices[j] = indice.get((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2])!;
  }
  return { palette, indices };
}

// ─── Écriture du PNG à palette ───────────────────────────────────────────────

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(octets: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloc(type: string, donnees: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + donnees.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, donnees.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(donnees, 8);
  dv.setUint32(8 + donnees.length, crc32(out.subarray(4, 8 + donnees.length)));
  return out;
}

async function zlib(octets: Uint8Array): Promise<Uint8Array> {
  const flux = new Blob([octets]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

/**
 * PNG à palette de l'image, ou `null` si elle doit rester en JPEG (photo, ou
 * navigateur sans `CompressionStream`).
 */
export async function pngIndexe(image: { data: Uint8ClampedArray; width: number; height: number }): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  const { width: l, height: h } = image;
  const indexe = indexerPixels(image.data, l, h);
  if (!indexe) return null;

  // Une ligne PNG = un octet de filtre (0, aucun) puis les indices.
  const lignes = new Uint8Array((l + 1) * h);
  for (let y = 0; y < h; y++) lignes.set(indexe.indices.subarray(y * l, (y + 1) * l), y * (l + 1) + 1);

  const entete = new Uint8Array(13);
  const dv = new DataView(entete.buffer);
  dv.setUint32(0, l);
  dv.setUint32(4, h);
  entete[8] = 8; // 8 bits par indice
  entete[9] = 3; // couleurs indexées

  const morceaux = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    bloc('IHDR', entete),
    bloc('PLTE', indexe.palette),
    bloc('IDAT', await zlib(lignes)),
    bloc('IEND', new Uint8Array()),
  ];
  const png = new Uint8Array(morceaux.reduce((s, m) => s + m.length, 0));
  let pos = 0;
  for (const m of morceaux) { png.set(m, pos); pos += m.length; }
  return png;
}

/** Largeur du logo des en-têtes : 28 mm à 600 dpi. */
export const LOGO_LARGEUR_PX = 660;

/** Le logo ramené à `LOGO_LARGEUR_PX`, en PNG. Rend l'original en cas d'échec. */
export async function logoAllege(dataUrl: string): Promise<string> {
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    if (img.naturalWidth <= LOGO_LARGEUR_PX) return dataUrl;
    const c = document.createElement('canvas');
    c.width = LOGO_LARGEUR_PX;
    c.height = Math.round((img.naturalHeight * LOGO_LARGEUR_PX) / img.naturalWidth);
    const ctx = c.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } catch {
    return dataUrl;
  }
}
