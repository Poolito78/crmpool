/**
 * Projet du Chiffrage ISOSIGN (« Projet_….json ») allégé avant de rejoindre
 * les pièces jointes d'un devis.
 *
 * Le Chiffrage enregistre dans chaque projet TOUTE sa bibliothèque d'images
 * personnalisées (`artImg` : visuels BAT des panneaux spécifiques, en
 * base64), pas seulement celles du projet. Projet_Plan DISPAM 45.json
 * pesait 2,1 Mo dont 1,73 Mo d'`artImg` — 56 visuels de panneaux pour un
 * marquage au sol qui n'en pose aucun. Le métré lui-même (lignes, zones,
 * quantités) tient en moins de 100 Ko, le plan (`planData`) en 305 Ko.
 *
 * On ne garde donc que les images des articles que le projet POSE ou
 * CHIFFRE : le `code` des panneaux, lignes, zones, saisies manuelles et
 * ensembles BAT, et les codes des quantités forcées. Le bordereau, lui, ne
 * dit rien : il liste tout le catalogue chargé (256 articles).
 *
 * Rien n'est perdu : à l'ouverture d'un projet, le Chiffrage FUSIONNE ses
 * images avec la bibliothèque qu'il garde déjà (`artImg={...artImg,
 * ...o.artImg}`). Le plan, le métré et tous les réglages restent intacts.
 */

/** Ce qui fait reconnaître un projet du Chiffrage. */
export function estProjetChiffrage(o: unknown): o is Record<string, unknown> & { artImg: Record<string, unknown> } {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const p = o as Record<string, unknown>;
  return !!p.artImg && typeof p.artImg === 'object' && !Array.isArray(p.artImg)
    && Array.isArray(p.bordereau) && 'planName' in p;
}

/** Les éléments du projet qui posent ou chiffrent un article. */
const POSES = ['panels', 'linears', 'areas', 'manual', 'batEnsembles'];
/** Clés « CODE|col:blanc|zone:… » : le code est avant la première barre. */
const FORCAGES = ['qtyOverride', 'puOverride', 'qtyMult'];

function codesDe(v: unknown, sortie: Set<string>) {
  if (Array.isArray(v)) { v.forEach(x => codesDe(x, sortie)); return; }
  if (!v || typeof v !== 'object') return;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (k === 'code' && typeof x === 'string' && x) sortie.add(x);
    else if (typeof x === 'object') codesDe(x, sortie);
  }
}

/** Codes d'article employés par le projet, renommages compris dans les deux sens. */
export function codesEmployes(projet: Record<string, unknown>): Set<string> {
  const codes = new Set<string>();
  for (const k of POSES) codesDe(projet[k], codes);
  for (const k of FORCAGES) {
    const o = projet[k];
    if (o && typeof o === 'object') for (const cle of Object.keys(o)) codes.add(cle.split('|')[0]);
  }
  /* BRIDE40 → BRIDE8040 : l'image peut être rangée sous l'un ou l'autre nom. */
  const renommages = projet.artRename;
  if (renommages && typeof renommages === 'object') {
    for (const [ancien, nouveau] of Object.entries(renommages as Record<string, unknown>)) {
      if (typeof nouveau !== 'string') continue;
      if (codes.has(ancien)) codes.add(nouveau);
      if (codes.has(nouveau)) codes.add(ancien);
    }
  }
  return codes;
}

/** Le projet sans les images des articles qu'il n'emploie pas, et combien en sont retirées. */
export function allegerProjetChiffrage<T extends Record<string, unknown> & { artImg: Record<string, unknown> }>(
  projet: T,
): { projet: T; retirees: number } {
  const codes = codesEmployes(projet);
  const gardees = Object.fromEntries(Object.entries(projet.artImg).filter(([code]) => codes.has(code)));
  return {
    projet: { ...projet, artImg: gardees },
    retirees: Object.keys(projet.artImg).length - Object.keys(gardees).length,
  };
}

function lireTexte(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result ?? ''));
    r.onerror = () => ko(r.error);
    r.readAsText(file);
  });
}

/**
 * Le fichier tel qu'il doit partir avec le devis : un projet du Chiffrage
 * est allégé, tout autre fichier passe inchangé (y compris un JSON illisible).
 */
export async function preparerPieceJointe(file: File): Promise<File> {
  if (!/\.json$/i.test(file.name)) return file;
  let o: unknown;
  try { o = JSON.parse(await lireTexte(file)); } catch { return file; }
  if (!estProjetChiffrage(o)) return file;
  const { projet, retirees } = allegerProjetChiffrage(o);
  if (!retirees) return file;
  return new File([JSON.stringify(projet)], file.name, { type: 'application/json' });
}
