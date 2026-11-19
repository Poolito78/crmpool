/**
 * Les panneaux de police DESSINÉS sur un plan d'exécution, quand le PDF n'est
 * qu'une image.
 *
 * AGILIS (CD28, « Plan Panneau pour CD28.pdf ») envoie un plan de voirie
 * imprimé par « Microsoft Print To PDF » : ni texte, ni calque — une photo de
 * plan. L'analyse n'y voyait qu'un mail (« voici les 7 panneaux ») et le
 * classait en demande de devis SANS LIGNE. Le Chiffrage ISOSIGN, lui, détecte
 * les panneaux d'un plan de CAO par ses CALQUES (`pdf_panels.py`) : il n'y en
 * a pas ici.
 *
 * On reprend donc la seconde moitié de sa détection, celle qui marche sur une
 * image : la reconnaissance d'un symbole par comparaison aux 387 pictogrammes
 * officiels IISR (`iisr_pictos.json`, copiée du Chiffrage dans `public/`) —
 * même empreinte (répartition des couleurs sur l'encre + silhouette 16×16,
 * `imgFeatures` / `featDist` du Chiffrage). Ce que le Chiffrage n'a pas, la
 * LOCALISATION sans calque, se fait ici sans IA : un panneau de police est une
 * tache bleu franc ou rouge franc, à peu près aussi haute que large, ronde ou
 * pleine. Les traits de cote (rouges aussi) sont longs ou ne couvrent que
 * deux directions : écartés.
 *
 * ⚠️ **ON NE DEVINE PAS LE CODE.** La bibliothèque IISR n'a ni B21-1/B21-2 ni
 * B21a1/a2, et un symbole de plan est tourné dans le sens de la circulation :
 * un rond bleu à flèche ressemble à TOUS les ronds bleus à flèche. Un code
 * n'est retenu que s'il se détache nettement du suivant
 * (`reconnaissance`) ; sinon le panneau est compté, montré en vignette avec
 * ses candidats, et reste « code à vérifier » — hors du chiffrage tant qu'on
 * ne l'a pas choisi. Le plan ne porte aucune cote : la gamme est celle de
 * l'écran, comme pour un « AB4 » écrit dans un mail.
 */

/* ───────────────────────── localisation ───────────────────────── */

export type CouleurSymbole = 'bleu' | 'rouge';
/**
 * La forme du signe : un triangle de danger ne se compare qu'à des
 * triangles, un carré d'indication qu'à des carrés. « rond » couvre aussi
 * l'octogone du STOP, trop petit sur un plan pour s'en distinguer.
 */
export type FormeSymbole = 'triangle' | 'triangle_inverse' | 'carre' | 'rond';

export interface BoiteSymbole {
  x: number;
  y: number;
  w: number;
  h: number;
  couleurs: CouleurSymbole[];
  forme?: FormeSymbole;
}

/**
 * Résolution de travail : la page est rendue pour que son grand côté fasse
 * ~5 000 px (un A3 à 300 dpi). Les seuils de taille ci-dessous s'y rapportent.
 */
export const GRAND_COTE_RENDU = 5000;
const TAILLE_MIN = 12;
const TAILLE_MAX = 110;

/** Bleu d'un panneau d'obligation (pas le bleu marine des bordures, plus sombre). */
export function estBleuPanneau(r: number, g: number, b: number): boolean {
  return b > 120 && b - r > 70 && b - g > 40 && g > 25;
}
/** Rouge d'un panneau (pas le magenta des tracés, ni l'orange des trottoirs). */
export function estRougePanneau(r: number, g: number, b: number): boolean {
  return r > 150 && r - g > 80 && r - b > 70;
}

/** Une tache d'une couleur de panneau, avant tri. */
export interface Tache {
  x: number;
  y: number;
  w: number;
  h: number;
  couleur: CouleurSymbole;
  /** Part de la boîte couverte par la couleur. */
  densite: number;
  /** Directions (sur 16) où la tache atteint sa périphérie. */
  secteurs: number;
  forme: FormeSymbole;
}

/** Toutes les taches bleu panneau et rouge panneau de l'image. */
export function taches(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Tache[] {
  const n = w * h;
  const taches: Tache[] = [];
  const classe = new Uint8Array(n);
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    if (estBleuPanneau(r, g, b)) classe[p] = 1;
    else if (estRougePanneau(r, g, b)) classe[p] = 2;
  }
  for (const c of [1, 2] as const) {
    /* Dilatation d'un pixel : le JPEG du plan émiette une couronne rouge fine
       en arcs qui ne se touchent plus. */
    const dil = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (classe[y * w + x] !== c) continue;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < w) dil[yy * w + xx] = 1;
          }
        }
      }
    }
    const vu = new Uint8Array(n);
    const pile: number[] = [];
    for (let s = 0; s < n; s++) {
      if (!dil[s] || vu[s]) continue;
      vu[s] = 1; pile.push(s);
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      const pts: number[] = [];
      while (pile.length) {
        const p = pile.pop()!;
        const px = p % w, py = (p - px) / w;
        /* La boîte suit les pixels de couleur, pas la dilatation : un pixel de
           trop de chaque côté décale toute la carte d'empreinte. */
        if (classe[p] === c) {
          pts.push(p);
          if (px < x0) x0 = px; if (px > x1) x1 = px;
          if (py < y0) y0 = py; if (py > y1) y1 = py;
        }
        for (let dy = -1; dy <= 1; dy++) {
          const yy = py + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = px + dx;
            if (xx < 0 || xx >= w) continue;
            const q = yy * w + xx;
            if (dil[q] && !vu[q]) { vu[q] = 1; pile.push(q); }
          }
        }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      const dedans = new Uint8Array(bw * bh);
      for (const p of pts) { const px = p % w; dedans[((p - px) / w - y0) * bw + (px - x0)] = 1; }
      taches.push({
        x: x0, y: y0, w: bw, h: bh, couleur: c === 1 ? 'bleu' : 'rouge',
        ...couverture(pts, w, x0, y0, bw, bh), forme: formeDuMasque(dedans, bw, bh),
      });
    }
  }
  return taches;
}

/**
 * Les taches de couleur de panneau, en boîtes. `rgba` = pixels RVBA ligne par
 * ligne (ImageData). Une tache rouge qui entoure une bleue est UN panneau
 * (stationnement interdit : fond bleu, couronne rouge).
 */
export function localiserSymboles(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): BoiteSymbole[] {
  const boites = taches(rgba, w, h)
    .filter(t => estTacheDePanneau(t))
    .map(t => ({ x: t.x, y: t.y, w: t.w, h: t.h, couleurs: [t.couleur], forme: t.forme }));
  return fusionnerEmboites(boites);
}

/** Une tache retenue comme panneau : taille, proportions, forme. */
export function estTacheDePanneau(t: Tache): boolean {
  if (t.w < TAILLE_MIN || t.h < TAILLE_MIN || t.w > TAILLE_MAX || t.h > TAILLE_MAX) return false;
  if (t.w / t.h < 0.7 || t.w / t.h > 1.43) return false;
  return t.densite >= (t.couleur === 'bleu' ? 0.25 : 0.15) && t.secteurs >= 13;
}

/**
 * Une tache de panneau couvre toutes les directions autour de son centre
 * (disque, couronne, octogone, carré, triangle) ; un trait de cote, une
 * flèche de marquage, deux traits qui se croisent n'en couvrent que
 * quelques-unes. `secteurs` : sur 16, ceux où la tache atteint sa périphérie.
 */
function couverture(pts: number[], w: number, x0: number, y0: number, bw: number, bh: number): { densite: number; secteurs: number } {
  const cx = x0 + (bw - 1) / 2, cy = y0 + (bh - 1) / 2;
  const rayon = Math.max(bw, bh) / 2;
  const SECTEURS = 16;
  const couverts = new Uint8Array(SECTEURS);
  for (const p of pts) {
    const px = p % w, py = (p - px) / w;
    const dx = px - cx, dy = py - cy;
    if (Math.hypot(dx, dy) < rayon * 0.35) continue;
    const a = Math.atan2(dy, dx);
    couverts[Math.min(SECTEURS - 1, Math.floor(((a + Math.PI) / (2 * Math.PI)) * SECTEURS))] = 1;
  }
  let n = 0;
  for (const v of couverts) n += v;
  return { densite: pts.length / (bw * bh), secteurs: n };
}

/**
 * La forme d'un masque (1 = couleur du signe) dans sa boîte : un triangle a
 * son quart haut bien plus étroit que son quart bas (l'inverse pour AB3a) ;
 * un carré remplit au moins deux de ses coins (la flèche d'un J5 en vide
 * deux) ; le reste est rond — disque, couronne, octogone.
 */
export function formeDuMasque(m: Uint8Array, bw: number, bh: number): FormeSymbole {
  const etendue = (y: number) => {
    let a = -1, b = -1;
    for (let x = 0; x < bw; x++) if (m[y * bw + x]) { if (a < 0) a = x; b = x; }
    return a < 0 ? 0 : (b - a + 1) / bw;
  };
  const bande = Math.max(1, Math.round(bh / 4));
  let haut = 0, bas = 0;
  for (let y = 0; y < bande; y++) { haut += etendue(y); bas += etendue(bh - 1 - y); }
  haut /= bande; bas /= bande;
  if (haut < bas * 0.6) return 'triangle';
  if (bas < haut * 0.6) return 'triangle_inverse';
  const cw = Math.max(1, Math.round(bw / 5)), chh = Math.max(1, Math.round(bh / 5));
  let pleins = 0;
  for (const [ox, oy] of [[0, 0], [bw - cw, 0], [0, bh - chh], [bw - cw, bh - chh]]) {
    let n = 0;
    for (let y = oy; y < oy + chh; y++) for (let x = ox; x < ox + cw; x++) n += m[y * bw + x];
    if (n / (cw * chh) > 0.4) pleins++;
  }
  return pleins >= 2 ? 'carre' : 'rond';
}

/**
 * Deux symboles accolés sur un mât (B21 au-dessus d'un B2c) se touchent sans
 * s'emboîter : ce sont deux panneaux. On ne fusionne que si le centre de l'un
 * tombe dans l'autre.
 */
function fusionnerEmboites(boites: BoiteSymbole[]): BoiteSymbole[] {
  const dans = (o: BoiteSymbole, b: BoiteSymbole) => {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    return cx > o.x && cx < o.x + o.w && cy > o.y && cy < o.y + o.h;
  };
  const out: BoiteSymbole[] = [];
  for (const b of boites) {
    const k = out.findIndex(o => dans(o, b) || dans(b, o));
    if (k < 0) { out.push({ ...b, couleurs: [...b.couleurs] }); continue; }
    const o = out[k];
    const x = Math.min(o.x, b.x), y = Math.min(o.y, b.y);
    out[k] = {
      x, y,
      forme: (o.w * o.h >= b.w * b.h ? o : b).forme,
      w: Math.max(o.x + o.w, b.x + b.w) - x,
      h: Math.max(o.y + o.h, b.y + b.h) - y,
      couleurs: [...new Set([...o.couleurs, ...b.couleurs])],
    };
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/* ───────────────────────── reconnaissance (Chiffrage) ───────────────────────── */

/**
 * Empreinte d'un symbole : la répartition des couleurs sur l'encre du
 * Chiffrage (5 classes : rouge, bleu, vert, autre, gris) et une CARTE de
 * 12×12 cases, chacune rangée dans une classe de couleur (`classeCouleur`).
 */
export interface Empreinte {
  hist: number[];
  carte: Uint8Array;
  /** Forme du signe, quand on la connaît : la comparaison s'y restreint. */
  forme?: FormeSymbole;
}

/** Image RVBA simple. */
export interface ImageRVBA {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

/** Rééchantillonnage par sur-échantillonnage bilinéaire 3×3 (agrandit comme il réduit). */
function reechantillonner(src: ImageRVBA, sx: number, sy: number, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dw * dh * 4);
  const S = 3;
  const lire = (x: number, y: number, k: number) => {
    const xi = Math.min(src.width - 1, Math.max(0, x)), yi = Math.min(src.height - 1, Math.max(0, y));
    return src.data[(yi * src.width + xi) * 4 + k];
  };
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const acc = [0, 0, 0];
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          const fx = sx + ((x + (i + 0.5) / S) * sw) / dw - 0.5;
          const fy = sy + ((y + (j + 0.5) / S) * sh) / dh - 0.5;
          const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
          for (let k = 0; k < 3; k++) {
            acc[k] += (lire(x0, y0, k) * (1 - ax) + lire(x0 + 1, y0, k) * ax) * (1 - ay)
              + (lire(x0, y0 + 1, k) * (1 - ax) + lire(x0 + 1, y0 + 1, k) * ax) * ay;
          }
        }
      }
      const o = (y * dw + x) * 4;
      out[o] = acc[0] / (S * S); out[o + 1] = acc[1] / (S * S); out[o + 2] = acc[2] / (S * S); out[o + 3] = 255;
    }
  }
  return out;
}

const blanc = (r: number, g: number, b: number) => r > 235 && g > 235 && b > 235;
const COTE_CARTE = 12;

/** Classes de couleur d'une case : 0 hors du signe, 1 blanc, 2 noir, 3 gris, 4 rouge, 5 bleu, 6 jaune, 7 vert, 8 autre. */
export function classeCouleur(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx - mn, lum = (r + g + b) / 3;
  if (sat < 60) return lum > 165 ? 1 : lum < 95 ? 2 : 3;
  if (r >= g && r >= b) {
    if (g > r * 0.6 && b < r * 0.55) return 6;
    return 4;
  }
  if (b >= r && b >= g) return 5;
  if (g >= r && g >= b) return r > g * 0.8 && b < g * 0.55 ? 6 : 7;
  return 8;
}

/** Deux classes voisines (gris ↔ blanc, gris ↔ noir) ne comptent que pour moitié. */
function ecartClasses(a: number, b: number): number {
  if (a === b) return 0;
  if ((a === 3 && (b === 1 || b === 2)) || (b === 3 && (a === 1 || a === 2))) return 0.5;
  return 1;
}

/**
 * L'empreinte d'une vignette (déjà recadrée sur le symbole, hors-disque blanchi
 * par `vignetteSymbole`).
 *
 * ⚠️ Le Chiffrage compare un masque d'encre binaire 16×16 (`imgFeatures`).
 * Sur un symbole de 20 px tiré d'un JPEG, TOUT le disque est « encre » : le
 * masque d'un STOP, d'un B2c et d'un rond bleu est le même disque plein, et
 * seule la couleur départageait — le STOP du CD28 tombait sur D79a, rouge lui
 * aussi. La carte garde ce que l'œil lit : la bande blanche du STOP, la
 * couronne et la flèche noire du B2c, la flèche blanche d'un rond bleu. Elle
 * est rangée en CLASSES de couleur, pas en valeurs : le blanc d'un plan
 * scanné est à 225, le bleu délavé, et une distance en RVB les punissait.
 */
export function empreinte(img: ImageRVBA): Empreinte | null {
  const N = COTE_CARTE;
  const d = reechantillonner(img, 0, 0, img.width, img.height, N, N);
  const hist = [0, 0, 0, 0, 0];
  const carte = new Uint8Array(N * N);
  const c = (N - 1) / 2;
  let encre = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const x = p % N, y = (p - x) / N;
    const dedans = ((x - c) / (N / 2)) ** 2 + ((y - c) / (N / 2)) ** 2 <= 0.9;
    carte[p] = dedans ? classeCouleur(r, g, b) : 0;
    if (blanc(r, g, b)) continue;
    encre++;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    let cls: number;
    if (sat < 45) cls = 4;
    else if (r >= g && r >= b) cls = 0;
    else if (b >= r && b >= g) cls = 1;
    else if (g >= r && g >= b) cls = 2;
    else cls = 3;
    hist[cls]++;
  }
  if (encre < 4) return null;
  return { hist: hist.map(v => v / encre), carte };
}

/**
 * Distance de deux empreintes, 0 = identiques : écart de répartition des
 * couleurs (celui du Chiffrage, `featDist`), à moitié, + part des cases du
 * disque dont la classe de couleur diffère, au double.
 */
export function distanceEmpreintes(a: Empreinte, b: Empreinte): number {
  let ch = 0;
  for (let k = 0; k < 5; k++) ch += Math.abs(a.hist[k] - b.hist[k]);
  let ec = 0, n = 0;
  for (let p = 0; p < a.carte.length; p++) {
    if (!a.carte[p] && !b.carte[p]) continue;
    n++;
    ec += ecartClasses(a.carte[p], b.carte[p]);
  }
  return ch * 0.5 + (n ? ec / n : 0) * 2;
}

/**
 * Le symbole découpé dans le plan, prêt à comparer : ce qui déborde du disque
 * inscrit dans la boîte (hachures d'espace vert, bordures, cotes) est blanchi,
 * comme le blanc qui entoure un pictogramme de la bibliothèque.
 */
export function vignetteSymbole(img: ImageRVBA, b: BoiteSymbole, marge = 0): ImageRVBA {
  const x0 = Math.max(0, b.x - marge), y0 = Math.max(0, b.y - marge);
  const x1 = Math.min(img.width, b.x + b.w + marge), y1 = Math.min(img.height, b.y + b.h + marge);
  const w = x1 - x0, h = y1 - y0;
  const data = new Uint8ClampedArray(w * h * 4);
  const cx = (w - 1) / 2, cy = (h - 1) / 2, rx = w / 2, ry = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const dedans = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.08;
      if (!dedans) { data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 255; continue; }
      const s = ((y0 + y) * img.width + (x0 + x)) * 4;
      data[o] = img.data[s]; data[o + 1] = img.data[s + 1]; data[o + 2] = img.data[s + 2]; data[o + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

/**
 * ⚠️ **UN PICTOGRAMME IISR PORTE SA LÉGENDE.** Les 387 vignettes du Chiffrage
 * sont découpées dans le document réglementaire : le signe à gauche, le début
 * de sa légende à droite (« STOP · Arrêt de p… »). Mesurée telle quelle,
 * l'empreinte comptait le texte comme de l'encre — le STOP du plan CD28
 * ressemblait davantage à E33b (« PARC NATU… ») qu'à AB4. Le signe est la plus
 * grande tache COLORÉE (la légende est noire ; un « Créé » rouge est petit) :
 * on ne garde que sa boîte.
 */
export function zoneDuSigne(img: ImageRVBA): BoiteSymbole | null {
  const { width: w, height: h, data } = img;
  const colore = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 60) colore[p] = 1;
  }
  const vu = new Uint8Array(w * h);
  let meilleure: { x: number; y: number; w: number; h: number; pts: number[] } | null = null;
  for (let s = 0; s < w * h; s++) {
    if (!colore[s] || vu[s]) continue;
    vu[s] = 1;
    const pile = [s];
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    const pts: number[] = [];
    while (pile.length) {
      const p = pile.pop()!;
      const px = p % w, py = (p - px) / w;
      pts.push(p);
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      /* Voisinage de 2 px : le blanc d'une flèche coupe un fond bleu en morceaux. */
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = px + dx, yy = py + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          if (colore[q] && !vu[q]) { vu[q] = 1; pile.push(q); }
        }
      }
    }
    const aire = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (!meilleure || aire > meilleure.w * meilleure.h) meilleure = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, pts };
  }
  if (!meilleure || meilleure.w < 6 || meilleure.h < 6) return null;
  const { x, y, w: bw, h: bh } = meilleure;
  const m = new Uint8Array(bw * bh);
  for (const p of meilleure.pts) { const px = p % w; m[((p - px) / w - y) * bw + (px - x)] = 1; }
  return { x, y, w: bw, h: bh, couleurs: [], forme: formeDuMasque(m, bw, bh) };
}

/** L'empreinte d'un pictogramme de la bibliothèque, mesurée sur le seul signe. */
export function empreintePictogramme(img: ImageRVBA): Empreinte | null {
  const zone = zoneDuSigne(img);
  /* Un signe rectangulaire (directionnel D/E) ou réduit à quelques pixels
     ne ressemble à aucun symbole de police : hors bibliothèque. */
  if (!zone || zone.w < 14 || zone.h < 14 || zone.w / zone.h < 0.7 || zone.w / zone.h > 1.43) return null;
  const f = empreinte(vignetteSymbole(img, zone, 0));
  return f ? { ...f, forme: zone.forme } : null;
}

export interface Candidat {
  code: string;
  distance: number;
}

/**
 * Seuils de décision, réglés sur le plan CD28 : un code n'est retenu que s'il
 * ressemble (distance ≤ DISTANCE_MAX) ET se détache du second candidat d'au
 * moins ECART_MIN. Le STOP s'y détache ; les ronds bleus à flèche, non.
 */
export const DISTANCE_MAX = 0.6;
export const ECART_MIN = 0.15;

export interface Reconnaissance {
  /** Les trois codes les plus proches, du plus ressemblant au moins. */
  candidats: Candidat[];
  /** Le code retenu, seulement s'il se détache — sinon « à vérifier ». */
  code: string | null;
}

/**
 * Le code IISR d'un symbole. `index` : empreintes de la bibliothèque. Les
 * panonceaux (M…) sont écartés : ils sont blancs et rectangulaires, un
 * symbole de couleur de panneau n'en est jamais un.
 */
export function reconnaissance(f: Empreinte, index: Map<string, Empreinte>): Reconnaissance {
  const tous: Candidat[] = [];
  /* Seule la distinction triangle / autre est sûre à 20 px : un J5 dessiné
     de biais perd ses coins et passe pour un rond. */
  const tri = (x?: FormeSymbole) => x === 'triangle' || x === 'triangle_inverse';
  for (const [code, e] of index) {
    if (/^M\d/i.test(code)) continue;
    if (f.forme && e.forme && tri(f.forme) !== tri(e.forme)) continue;
    tous.push({ code, distance: distanceEmpreintes(f, e) });
  }
  tous.sort((a, b) => a.distance - b.distance);
  const candidats = tous.slice(0, 5).map(c => ({ code: c.code, distance: Math.round(c.distance * 1000) / 1000 }));
  const [p, s] = tous;
  const net = !!p && p.distance <= DISTANCE_MAX && (!s || s.distance - p.distance >= ECART_MIN);
  return { candidats, code: net ? p.code : null };
}

/* ───────────────────────── panneaux du plan ───────────────────────── */

export interface PanneauDetecte {
  page: number;
  boite: BoiteSymbole;
  candidats: Candidat[];
  /** Code retenu d'office (net) ou choisi à l'écran ; null = « à vérifier ». */
  code: string | null;
  /** Vignette (data URL PNG) pour vérifier à l'œil — navigateur seulement. */
  vignette?: string;
}

/**
 * Le nombre de panneaux que le mail annonce (« voici les 7 panneaux »),
 * contrôle du compte détecté. Les nombres en lettres jusqu'à douze suffisent.
 */
export function panneauxAnnonces(texte: string): number | null {
  const LETTRES: Record<string, number> = {
    un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
  };
  const m = String(texte || '').toLowerCase().match(/\b(\d{1,3}|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze)\s+panneaux\b/);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : LETTRES[m[1]];
  return n > 0 ? n : null;
}

/**
 * Un plan à lire sur le dessin : PDF sans texte (au plus quelques caractères
 * par page) et une demande qui parle de panneaux — dans le mail ou le nom du
 * fichier (« Plan Panneau pour CD28.pdf »).
 */
export function estPlanDePanneauxEnImage(pages: string[], texteMail: string, nomFichier: string): boolean {
  if (!pages.length || !pages.every(t => t.replace(/\s/g, '').length < 40)) return false;
  return /panneau|signalisation\s+verticale/i.test(`${texteMail}\n${nomFichier}`);
}

/** Marque des lignes du plan dont le code reste à choisir. */
export const SUFFIXE_PLAN = 'détecté sur le plan';
const A_VERIFIER = 'code à vérifier';

/**
 * Le libellé de la ligne du panneau n° `n` (1 = le premier du plan). Un code
 * reconnu ou choisi part SEUL (« AB4 ») : c'est ce que le rapprochement, la
 * grille et la recherche Odoo savent lire — « détecté sur le plan, n° 6 »
 * n'y ajouterait que des mots à relâcher.
 */
export function libellePanneauPlan(code: string | null, n: number): string {
  return code ? code : `Panneau n° ${n} ${SUFFIXE_PLAN} — ${A_VERIFIER}`;
}

/** Ligne d'un panneau du plan dont le code n'est pas choisi : ni article, ni Odoo, ni prix. */
export function estPanneauAVerifier(texte: string): boolean {
  return texte.includes(SUFFIXE_PLAN) && texte.includes(A_VERIFIER);
}

/**
 * Les lignes de demande : UNE PAR PANNEAU DU PLAN, dans l'ordre du dessin.
 * Chaque panneau est son propre ensemble (son support, ses brides) : rien sur
 * un plan sans cote ne dit qu'ils partagent un mât, et la suite
 * (`ensembleDeLigne`) chiffre un « AB4 » comme s'il était écrit dans un mail.
 * Un panneau sans code part en « code à vérifier », sans référence — et rien
 * ne le chiffre tant qu'on n'a pas choisi.
 */
export function lignesDesPanneaux(panneaux: PanneauDetecte[]): { reference: string; description: string; quantite: number }[] {
  return panneaux.map((p, k) => ({ reference: '', description: libellePanneauPlan(p.code, k + 1), quantite: 1 }));
}

/**
 * Les lignes de l'analyse, complétées par celles du plan. Une ligne de l'IA qui
 * ne parle que de panneaux, sans code (« 7 panneaux », « Panneaux sous
 * fourreaux »), est le résumé de ce que le plan détaille : la garder les
 * compterait deux fois. Elle est rendue à part, pour la note.
 */
export function avecPanneauxDuPlan<L extends { reference?: string; description?: string }>(
  lignes: L[],
  panneaux: PanneauDetecte[],
  aUnCode: (texte: string) => boolean,
): { lignes: (L | { reference: string; description: string; quantite: number })[]; resumees: string[] } {
  const resumees: string[] = [];
  const gardees = lignes.filter(l => {
    const t = [l.reference, l.description].filter(Boolean).join(' ').trim();
    if (/panneau/i.test(t) && !aUnCode(t)) { resumees.push(t); return false; }
    return true;
  });
  return { lignes: [...gardees, ...lignesDesPanneaux(panneaux)], resumees };
}

/* ───────────────────────── navigateur ───────────────────────── */

let indexIisr: Promise<Map<string, Empreinte>> | null = null;

/** Empreintes des 387 pictogrammes IISR du Chiffrage (`public/iisr_pictos.json`), calculées une fois. */
function chargerIndexIisr(): Promise<Map<string, Empreinte>> {
  indexIisr ??= (async () => {
    const rep = await fetch('/iisr_pictos.json');
    if (!rep.ok) throw new Error(`pictogrammes IISR introuvables (${rep.status})`);
    const lib = await rep.json() as Record<string, string>;
    const index = new Map<string, Empreinte>();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('canvas indisponible');
    await Promise.all(Object.entries(lib).map(async ([code, url]) => {
      const im = new Image();
      im.src = url;
      try { await im.decode(); } catch { return; }
      canvas.width = im.naturalWidth; canvas.height = im.naturalHeight;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(im, 0, 0);
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const f = empreintePictogramme({ data: d.data, width: d.width, height: d.height });
      if (f) index.set(code, f);
    }));
    return index;
  })();
  indexIisr.catch(() => { indexIisr = null; });
  return indexIisr;
}

function enDataUrl(v: ImageRVBA): string {
  const c = document.createElement('canvas');
  c.width = v.width; c.height = v.height;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const id = ctx.createImageData(v.width, v.height);
  id.data.set(v.data);
  ctx.putImageData(id, 0, 0);
  return c.toDataURL('image/png');
}

/** Plafond de pages lues : un plan d'exécution en compte une ou deux. */
const PAGES_MAX = 6;

/**
 * Les panneaux dessinés sur un PDF-image : chaque page rendue (grand côté
 * ~5 000 px), symboles localisés puis reconnus. Sans IA, sans réseau autre
 * que la bibliothèque de pictogrammes.
 */
export async function detecterPanneauxSurPlan(buffer: ArrayBuffer): Promise<PanneauDetecte[]> {
  const pdfjsLib = await import('pdfjs-dist');
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
  const index = await chargerIndexIisr();
  const out: PanneauDetecte[] = [];
  for (let n = 1; n <= Math.min(pdf.numPages, PAGES_MAX); n++) {
    const page = await pdf.getPage(n);
    const v1 = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: GRAND_COTE_RENDU / Math.max(v1.width, v1.height) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) continue;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const img: ImageRVBA = { data: d.data, width: d.width, height: d.height };
    for (const boite of localiserSymboles(d.data, d.width, d.height)) {
      const v = vignetteSymbole(img, boite);
      const f = empreinte(v);
      const r = f ? reconnaissance({ ...f, forme: boite.forme }, index) : { candidats: [], code: null };
      /* La vignette montrée garde son fond (marge de 4 px) : on juge mieux un
         symbole dans son contexte. */
      const x0 = Math.max(0, boite.x - 4), y0 = Math.max(0, boite.y - 4);
      const w = Math.min(d.width, boite.x + boite.w + 4) - x0, h = Math.min(d.height, boite.y + boite.h + 4) - y0;
      out.push({
        page: n, boite, candidats: r.candidats, code: r.code,
        vignette: enDataUrl({ data: ctx.getImageData(x0, y0, w, h).data, width: w, height: h }),
      });
    }
    canvas.width = canvas.height = 0;
  }
  return out;
}
