/**
 * Génère les images des pochoirs du catalogue Virages pour la page « Surface Pochoirs » :
 *   - télécharge chaque vignette depuis virages.com,
 *   - retire les POIGNÉES (fentes de préhension collées au bord de la plaque),
 *   - remplace le marron par du noir (le blanc = zone peinte reste blanc),
 *   - écrit public/pochoirs/<id>.png et recalcule le taux ajouré
 *     (src/lib/pochoirsTaux.ts : { <id>: taux }), la poignée n'étant pas peinte.
 *
 * Usage (à la racine) :  npm i --no-save sharp  &&  node scripts/pochoirs-images.mjs
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const VIRAGES = 'https://www.virages.com/Images/Categorie_B6/';
// Pochoirs dont le dessin contient de petites ouvertures qui ressemblent à une poignée
// (cercle du panneau, lettres, rails…) : on n'y touche pas.
const SANS_RETRAIT = new Set([
  'pochoir-panneau-homme-trottinette', 'pochoir-panneau-trottinette', '21618-Pochoir-station-Taxis',
  '22762-Pochoir-Chargement-des-Courses', '22868-Pochoir-Famille-Complete-Modele-2', 'Pochoir-SOS-Avec-Chiffres',
]);

/** d : RGBA (Uint8Array), w × h. Rend { out, taux, retirees } ou null si la vignette n'est pas un pochoir brun. */
export function traiter(d, w, h, retraitPoignees = true) {
  const esBrun = (r, g, b) => r > 80 && r < 200 && g > 40 && g < 140 && b < 115 && r > b + 40 && r > g;
  const esBlanc = (r, g, b) => r > 190 && g > 190 && b > 190;
  const N = w * h, M = new Uint8Array(N), RET = new Uint8Array(N);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0, sr = 0, sg = 0, sb = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    if (esBrun(r, g, b)) { M[y * w + x] = 1; n++; sr += r; sg += g; sb += b; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    else if (esBlanc(r, g, b)) M[y * w + x] = 2;
  }
  if (n < 200) return null;
  const B = [sr / n, sg / n, sb / n], bw = x1 - x0 + 1, bh = y1 - y0 + 1, aire = bw * bh;
  const L = new Int32Array(N); let nb = 0; const retirees = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const p = y * w + x; if (M[p] !== 2 || L[p]) continue;
    nb++; const st = [p]; L[p] = nb; let a = 0, cx0 = x, cx1 = x, cy0 = y, cy1 = y, touche = false; const px = [];
    while (st.length) {
      const q = st.pop(); px.push(q); a++; const qx = q % w, qy = (q - qx) / w;
      if (qx <= x0 + 1 || qx >= x1 - 1 || qy <= y0 + 1 || qy >= y1 - 1) touche = true;
      if (qx < cx0) cx0 = qx; if (qx > cx1) cx1 = qx; if (qy < cy0) cy0 = qy; if (qy > cy1) cy1 = qy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = qx + dx, ny = qy + dy; if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const np = ny * w + nx; if (M[np] === 2 && !L[np]) { L[np] = nb; st.push(np); }
      }
    }
    if (!retraitPoignees) continue;
    const cw = cx1 - cx0 + 1, ch = cy1 - cy0 + 1; if (touche || a < 8) continue;
    // Poignée : petite ouverture pleine, allongée PARALLÈLEMENT au bord le plus proche, collée à ce bord, centrée sur le côté.
    const gG = cx0 - x0, gD = x1 - cx1, gH = cy0 - y0, gB = y1 - cy1;
    const ctrX = Math.abs((cx0 + cx1) / 2 - (x0 + x1) / 2) / bw, ctrY = Math.abs((cy0 + cy1) / 2 - (y0 + y1) / 2) / bh;
    const vert = ch >= 1.6 * cw, hor = cw >= 1.6 * ch, plein = a / (cw * ch);
    const surCoteVert = vert && Math.min(gG, gD) <= 0.09 * bw && ctrY <= 0.15;
    const surCoteHor = hor && Math.min(gH, gB) <= 0.09 * bh && ctrX <= 0.15;
    if (a < 0.012 * aire && (surCoteVert || surCoteHor) && plein > 0.7) {
      retirees.push({ x: cx0, y: cy0, w: cw, h: ch, a });
      for (const q of px) { const qx = q % w, qy = (q - qx) / w; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = qy + dy, xx = qx + dx; if (xx >= 0 && xx < w && yy >= 0 && yy < h) RET[yy * w + xx] = 1; } }
      for (const q of px) M[q] = 1;
    }
  }
  // Sortie : on projette chaque pixel sur l'axe brun→blanc (anticrénelage conservé) : brun = noir, blanc = blanc.
  const out = new Uint8ClampedArray(d.length);
  const vx = 255 - B[0], vy = 255 - B[1], vz = 255 - B[2], v2 = vx * vx + vy * vy + vz * vz; let blanc = 0, brun = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4;
    let t = ((d[i] - B[0]) * vx + (d[i + 1] - B[1]) * vy + (d[i + 2] - B[2]) * vz) / v2; t = Math.max(0, Math.min(1, t));
    if (RET[p]) t = 0;
    const v = Math.round(255 * t); out[i] = v; out[i + 1] = v; out[i + 2] = v; out[i + 3] = 255;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) { if (M[p] === 2) blanc++; else if (M[p] === 1) brun++; }
  }
  return { out, taux: +(blanc / (blanc + brun)).toFixed(4), retirees };
}

async function main() {
  const src = readFileSync('src/lib/pochoirsCatalogue.ts', 'utf8');
  const lignes = [...src.matchAll(/\["([^"]+)",\s*"[^"]*",\s*"([^"]+)"/g)].map(m => ({ id: m[1], fichier: m[2] }));
  if (!lignes.length) throw new Error('catalogue illisible');
  mkdirSync('public/pochoirs', { recursive: true });
  const taux = {}; let retires = 0, echecs = 0;
  for (let i = 0; i < lignes.length; i += 6) {
    await Promise.all(lignes.slice(i, i + 6).map(async ({ id, fichier }) => {
      try {
        const rep = await fetch(VIRAGES + fichier); if (!rep.ok) throw new Error('HTTP ' + rep.status);
        const { data, info } = await sharp(Buffer.from(await rep.arrayBuffer())).flatten({ background: '#ffffff' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const o = traiter(data, info.width, info.height, !SANS_RETRAIT.has(id));
        if (!o) throw new Error('pas de plaque brune détectée');
        await sharp(Buffer.from(o.out.buffer), { raw: { width: info.width, height: info.height, channels: 4 } }).png({ palette: true }).toFile(`public/pochoirs/${id}.png`);
        taux[id] = o.taux; if (o.retirees.length) retires++;
      } catch (e) { echecs++; console.error('ÉCHEC', id, e.message); }
    }));
  }
  const tri = Object.fromEntries(Object.entries(taux).sort(([a], [b]) => a.localeCompare(b)));
  const corps = Object.entries(tri).map(([k, v]) => `  ${JSON.stringify(k)}: ${v},`).join('\n');
  writeFileSync('src/lib/pochoirsTaux.ts', `/** Taux ajourés mesurés sur les images retouchées — FICHIER GÉNÉRÉ par scripts/pochoirs-images.mjs. */\nexport const TAUX_MESURES: Record<string, number> = {\n${corps}\n};\n`);
  console.log(`${Object.keys(taux).length}/${lignes.length} images, poignées retirées sur ${retires}, échecs ${echecs}`);
  if (echecs) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('pochoirs-images.mjs')) await main();
