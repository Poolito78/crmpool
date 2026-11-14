/**
 * Génère la page du tarif en ligne (`public/tarif.html`) À PARTIR DU
 * CATALOGUE ISOFLOOR (catalogue_2026_preview.html) : même style, mêmes
 * sections, mêmes cartes — mais aux prix du client connecté.
 *
 *   node scripts/tarif-catalogue/generer.mjs ["chemin/catalogue_2026_preview.html"]
 *
 * ⚠️ **AUCUN PRIX DU CATALOGUE NE PASSE DANS LA PAGE.** `prix` et `kg` sont
 * retirés de chaque produit : la page est publique, seuls les textes y sont.
 * Les prix arrivent après connexion, de la fonction `tarif-catalogue`, à la
 * règle du devis (remises de la fiche client). Un produit du catalogue se
 * relie à sa fiche CRM par son champ `crm` ; sans fiche, il sort « Prix sur
 * demande » — jamais au prix écrit dans le catalogue.
 *
 * Ce qui n'est PAS repris : l'édition (annotations, photos, en-têtes et pied
 * de page modifiés), stockée dans le navigateur de l'auteur et non dans le
 * fichier. Seul le contenu du fichier fait foi ; relancer le script après
 * chaque modification du catalogue.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, copyFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = resolve(ici, '../..');
const SOURCE = resolve(process.argv[2]
  || 'C:/Users/f.mouhot/OneDrive - ISOSIGN/Documents/ISOFLOOR/02 MARKETING/Catalogue/catalogue_2026_preview.html');
const dossierSource = dirname(SOURCE);
const SORTIE = join(racine, 'public', 'tarif.html');
const ASSETS = join(racine, 'public', 'catalogue-tarif');

const html = readFileSync(SOURCE, 'utf8');

function entre(debut, fin, depuis = 0) {
  const i = html.indexOf(debut, depuis);
  if (i < 0) throw new Error(`Repère introuvable dans le catalogue : ${debut}`);
  const j = html.indexOf(fin, i + debut.length);
  if (j < 0) throw new Error(`Repère introuvable dans le catalogue : ${fin}`);
  return html.slice(i, j + fin.length);
}
function evaluer(code) {
  return Function(`"use strict"; return (${code});`)();
}

/* ── contenu du catalogue ─────────────────────────────────────────────── */
const style = entre('<style>', '</style>');
const corps = entre('<!-- NAV -->', '</main>');
const pied = entre('<!-- FOOTER -->', '</footer>');

const iP = html.indexOf('const PRODUCTS = [');
const produitsSource = evaluer(html.slice(html.indexOf('[', iP), html.indexOf('\n];', iP) + 2));
const iG = html.indexOf('const GRAN_IMGS');
const granImgs = evaluer(html.slice(html.indexOf('{', iG), html.indexOf('};', iG) + 1));
/* Le rangement d'un article CRM dans une section : même règle que le catalogue. */
const fonctions = [entre('function catToSec(', '\n}'), entre('function catToBc(', '\n}')].join('\n');
const iD = html.indexOf('const DEFAULT_PARAMS');
const params = evaluer(html.slice(html.indexOf('{', iD), html.indexOf('\n};', iD) + 2));

/* ── images : réduites, renommées, jamais le chemin du disque ─────────── */
mkdirSync(join(ASSETS, 'img'), { recursive: true });
const images = new Map();
function image(chemin) {
  if (!chemin) return null;
  if (/^https?:/.test(chemin)) return chemin;
  if (images.has(chemin)) return images.get(chemin);
  const src = resolve(dossierSource, decodeURI(chemin));
  if (!existsSync(src)) { console.warn(`  image absente, ignorée : ${chemin}`); images.set(chemin, null); return null; }
  const nom = createHash('sha1').update(chemin).digest('hex').slice(0, 12) + '.jpg';
  const cible = join(ASSETS, 'img', nom);
  if (!existsSync(cible) || statSync(cible).mtimeMs < statSync(src).mtimeMs) {
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      join(ici, 'reduire-image.ps1'), '-Source', src, '-Cible', cible], { stdio: 'inherit' });
  }
  const url = `/catalogue-tarif/img/${nom}`;
  images.set(chemin, url);
  return url;
}

const BASE = produitsSource.map(p => ({
  ref: p.ref, crm: p.crm || null, name: p.name, cat: p.cat || '', bc: p.bc, sec: p.sec,
  poids: p.poids ?? null, u: p.u || '', desc: p.desc || '', img: image(p.img), delai: p.delai ?? null,
}));
const GRAN = Object.fromEntries(Object.entries(granImgs).map(([k, v]) => [k, image(v)]).filter(([, v]) => v));
copyFileSync(join(dossierSource, 'logo-isofloor.png'), join(ASSETS, 'logo-isofloor.png'));

/* ── connexion Supabase : clé publique, comme l'application ───────────── */
const env = Object.fromEntries(['.env', '.env.local', '.env.production']
  .filter(f => existsSync(join(racine, f)))
  .flatMap(f => readFileSync(join(racine, f), 'utf8').split(/\r?\n/))
  .map(l => l.match(/^\s*(VITE_SUPABASE_[A-Z_]+)\s*=\s*"?([^"\s]+)"?/))
  .filter(Boolean).map(m => [m[1], m[2]]));
const URL_SB = env.VITE_SUPABASE_URL;
const CLE_SB = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL_SB || !CLE_SB) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY introuvables dans .env');

/* ── page ─────────────────────────────────────────────────────────────── */
const page = readFileSync(join(ici, 'modele.html'), 'utf8')
  .replace('/*__STYLE__*/', () => style.replace(/^<style>|<\/style>$/g, ''))
  .replace('<!--__CORPS__-->', () => corps)
  .replace('<!--__PIED__-->', () => pied)
  .replace('/*__FONCTIONS__*/', () => fonctions)
  .replace('/*__DONNEES__*/', () => [
    `const SB_URL = ${JSON.stringify(URL_SB)};`,
    `const SB_CLE = ${JSON.stringify(CLE_SB)};`,
    `const BASE = ${JSON.stringify(BASE)};`,
    `const GRAN_IMGS = ${JSON.stringify(GRAN)};`,
    `const TRANSPORT = ${JSON.stringify(params.transport)};`,
  ].join('\n'));

if (/prix\s*:\s*\d/.test(JSON.stringify(BASE))) throw new Error('Un prix du catalogue passerait dans la page publique.');
writeFileSync(SORTIE, page, 'utf8');
console.log(`✓ ${SORTIE}`);
console.log(`  ${BASE.length} produits (${BASE.filter(p => p.crm).length} reliés au CRM), ${[...images.values()].filter(Boolean).length} images`);
