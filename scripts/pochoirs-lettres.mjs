/**
 * Images des pochoirs LETTRES et CHIFFRES de virages.com (gammes parking, routière, aéroport) :
 * télécharge chaque vignette, remplace le marron par du noir (le blanc = zone peinte reste blanc),
 * écrit <sortie>/<id>.png en 200 px.
 * Usage : node pochoirs-lettres.mjs <dossier de sortie>
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { traiter } from './pochoirs-images.mjs';

const VIRAGES = 'https://www.virages.com/Images/Categorie_B6/';
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const liste = [];
A.forEach((c, i) => liste.push([`Pochoir-Lettre-${c}`, `${11004 + i}-350.jpg`]));
for (let i = 0; i < 10; i++) liste.push([`Pochoir-Chiffre-${i}`, `${11030 + i}-350.jpg`]);
A.forEach((c, i) => liste.push([`Pochoir-Lettre-Routiere-${c}`, `${11044 + i}-350.jpg`]));
for (let i = 0; i < 10; i++) liste.push([`Pochoir-Chiffre-Routier-${i}`, `${11070 + i}-350.jpg`]);
A.forEach((c, i) => liste.push([`Pochoir-Lettre-${c}-Aeroport`, `${27083 + i}-350.gif`]));
for (let i = 0; i < 10; i++) liste.push([`Pochoir-Chiffre-${i}-Aeroport`, `${27109 + i}-350.gif`]);

// Gamme POCHOIR À ENDUIT (plaque bleue) : Virages, Categorie_B21, ids 21650 à 21685 (A à Z puis 0 à 9)
const listeEnduit = [];
A.forEach((c, i) => listeEnduit.push([`Pochoir-Enduit-Lettre-${c}`, `Categorie_B21/${21650 + i}-350.jpg`]));
for (let i = 0; i < 10; i++) listeEnduit.push([`Pochoir-Enduit-Chiffre-${i}`, `Categorie_B21/${21676 + i}-350.jpg`]);

/** Plaque bleue -> noir, ouvertures blanches (même principe que traiter() pour le marron). */
function traiterBleu(d, w, h) {
  const bleu = (r, g, b) => b > r + 35 && b > 130;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0, sr = 0, sg = 0, sb = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (bleu(d[i], d[i + 1], d[i + 2])) { n++; sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (n < 200) return null;
  const B = [sr / n, sg / n, sb / n], vx = 255 - B[0], vy = 255 - B[1], vz = 255 - B[2], v2 = vx * vx + vy * vy + vz * vz;
  const out = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i += 4) {
    let t = ((d[i] - B[0]) * vx + (d[i + 1] - B[1]) * vy + (d[i + 2] - B[2]) * vz) / v2; t = Math.max(0, Math.min(1, t));
    const v = Math.round(255 * t); out[i] = v; out[i + 1] = v; out[i + 2] = v; out[i + 3] = 255;
  }
  return { out };
}

const sortie = process.argv[2] || 'public/pochoirs';
mkdirSync(sortie, { recursive: true });
let ok = 0, echecs = 0;
for (let i = 0; i < liste.length; i += 6) {
  await Promise.all(liste.slice(i, i + 6).map(async ([id, fichier]) => {
    try {
      const rep = await fetch(VIRAGES + fichier); if (!rep.ok) throw new Error('HTTP ' + rep.status);
      const { data, info } = await sharp(Buffer.from(await rep.arrayBuffer())).flatten({ background: '#ffffff' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const o = traiter(data, info.width, info.height, false);
      if (!o) throw new Error('pas de plaque brune détectée');
      await sharp(Buffer.from(o.out.buffer), { raw: { width: info.width, height: info.height, channels: 4 } }).resize(200, 200, { fit: 'inside' }).png({ palette: true }).toFile(`${sortie}/${id}.png`);
      ok++;
    } catch (e) { echecs++; console.error('ÉCHEC', id, e.message); }
  }));
}
for (let i = 0; i < listeEnduit.length; i += 6) {
  await Promise.all(listeEnduit.slice(i, i + 6).map(async ([id, fichier]) => {
    try {
      const rep = await fetch('https://www.virages.com/Images/' + fichier); if (!rep.ok) throw new Error('HTTP ' + rep.status);
      const { data, info } = await sharp(Buffer.from(await rep.arrayBuffer())).flatten({ background: '#ffffff' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const o = traiterBleu(data, info.width, info.height);
      if (!o) throw new Error('pas de plaque bleue détectée');
      await sharp(Buffer.from(o.out.buffer), { raw: { width: info.width, height: info.height, channels: 4 } }).resize(200, 200, { fit: 'inside' }).png({ palette: true }).toFile(`${sortie}/${id}.png`);
      ok++;
    } catch (e) { echecs++; console.error('ÉCHEC', id, e.message); }
  }));
}
console.log(`${ok}/${liste.length + listeEnduit.length} images, échecs ${echecs}`);
if (echecs) process.exit(1);
