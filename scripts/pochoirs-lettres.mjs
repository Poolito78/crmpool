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
console.log(`${ok}/${liste.length} images, échecs ${echecs}`);
if (echecs) process.exit(1);
