/* Liens web du menu (groupe « Web », 17/11/2026).
 *
 * Le groupe porte d'office le Tarif en ligne et le site isofloor.fr ; le reste
 * (tarif des pochoirs, calculateur du site…) s'ajoute à la main par « Ajouter
 * un lien », parce que ces adresses ne sont écrites nulle part : on ne les
 * devine pas.
 *
 * Chaque lien s'ouvre dans un onglet du NAVIGATEUR, jamais dans un onglet
 * MonCRM : un site tiers refuse le plus souvent d'être affiché dans un cadre.
 *
 * L'adresse sert de clé dans l'ordre du menu (`ordreNav.ts`) : le lien se
 * déplace comme une page, dans le groupe, hors du groupe ou dans un autre.
 *
 * Préférence de confort, propre à ce navigateur : rangée en localStorage,
 * comme l'ordre du menu. */

export type LienWeb = { libelle: string; url: string };

const CLE_STOCKAGE = 'crm_liens_web';

/** Adresse saisie → URL absolue http(s), ou null si elle n'en est pas une.
 *  « isofloor.fr/calcul » → « https://isofloor.fr/calcul ». */
export function normaliserUrl(saisie: string): string | null {
  const s = saisie.trim();
  if (!s || /\s/.test(s)) return null;
  const avecSchema = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(avecSchema);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Libellé par défaut d'un lien : le nom de domaine sans « www. ». */
export function libelleParDefaut(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function lireLiensWeb(): LienWeb[] {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_STOCKAGE) ?? '[]');
    if (!Array.isArray(brut)) return [];
    return brut.filter((l): l is LienWeb =>
      !!l && typeof l.libelle === 'string' && typeof l.url === 'string' && normaliserUrl(l.url) === l.url);
  } catch {
    return [];
  }
}

export function ecrireLiensWeb(liens: LienWeb[]) {
  try {
    if (!liens.length) localStorage.removeItem(CLE_STOCKAGE);
    else localStorage.setItem(CLE_STOCKAGE, JSON.stringify(liens));
  } catch { /* stockage indisponible : les liens valent pour la session */ }
}
