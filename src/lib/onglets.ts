/* Onglets du CRM — plusieurs pages ouvertes dans une même fenêtre, comme les
 * onglets d'un navigateur (barre au-dessus du titre, `BarreOnglets`).
 *
 * UN ONGLET GARDE SA PAGE MONTÉE. Passer du devis en cours au catalogue ne
 * doit rien perdre : chaque onglet rend ses routes à sa propre adresse
 * (`<Routes location>`, `PageOnglet`) et l'onglet caché passe en
 * `display: none`. Les dialogues de la page se rendent DANS l'onglet
 * (`OngletContext.conteneur`) et cessent d'être modaux quand il est caché —
 * sans quoi le verrou de défilement et de clic d'un devis ouvert figerait
 * l'onglet voisin. Voir `useOnglet.ts`.
 *
 * L'ADRESSE DU NAVIGATEUR EST CELLE DE L'ONGLET ACTIF. Basculer remplace
 * l'entrée d'historique (`replace`) ; une navigation dans la page met à jour
 * l'onglet actif ; celle d'un onglet caché (un `<Navigate>`, un
 * `setSearchParams` d'effet) ne touche que lui. « Précédent » vers l'adresse
 * d'un autre onglet bascule sur cet onglet au lieu de la recopier.
 *
 * La liste est gardée en sessionStorage sous le nom de la fenêtre
 * (`idFenetre`) : un rechargement la retrouve, une fenêtre ouverte à côté —
 * qui hérite du sessionStorage de son ouvreuse — part d'un seul onglet. */

import { parsePath, type Location } from 'react-router-dom';

export type Onglet = {
  id: string;
  location: Location;
  /** Précision posée par la page (« DEV-2026-134 »), jamais enregistrée. */
  titre?: string | null;
};

export type EtatOnglets = { onglets: Onglet[]; actif: string };

export const MAX_ONGLETS = 10;

export function nouvelIdOnglet(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function cheminDe(l: { pathname: string; search: string; hash: string }): string {
  return l.pathname + l.search + l.hash;
}

export function versLocation(chemin: string, state: unknown = null): Location {
  const p = parsePath(chemin);
  return {
    pathname: p.pathname || '/',
    search: p.search || '',
    hash: p.hash || '',
    state,
    key: nouvelIdOnglet(),
  };
}

/** L'entrée de menu `path` (« /parametres?tab=devis ») désigne-t-elle cette
 *  adresse ? Même règle que le lien actif du menu : le chemin, et l'onglet
 *  `?tab=` quand l'entrée en nomme un. */
export function memePage(l: { pathname: string; search: string }, path: string): boolean {
  const [base, query] = path.split('?');
  if (l.pathname !== base) return false;
  if (!query) return true;
  const voulu = new URLSearchParams(query).get('tab');
  const courant = new URLSearchParams(l.search).get('tab') || 'dashboard';
  return voulu === courant;
}

type Stocke = { onglets: { id: string; chemin: string }[]; actif: string };

export function serialiser(e: EtatOnglets): string {
  const s: Stocke = { onglets: e.onglets.map(o => ({ id: o.id, chemin: cheminDe(o.location) })), actif: e.actif };
  return JSON.stringify(s);
}

/** État de départ : la liste enregistrée, l'adresse courante faisant foi pour
 *  l'onglet actif (un lien collé, un rechargement sur une autre page). */
export function restaurer(brut: string | null, ici: Location): EtatOnglets {
  const seul = (): EtatOnglets => {
    const id = nouvelIdOnglet();
    return { onglets: [{ id, location: ici }], actif: id };
  };
  if (!brut) return seul();
  let s: Stocke;
  try { s = JSON.parse(brut); } catch { return seul(); }
  if (!s || !Array.isArray(s.onglets)) return seul();
  const onglets: Onglet[] = s.onglets
    .filter(o => o && typeof o.id === 'string' && typeof o.chemin === 'string' && o.chemin.startsWith('/'))
    .slice(0, MAX_ONGLETS)
    .map(o => ({ id: o.id, location: versLocation(o.chemin) }));
  if (!onglets.length) return seul();
  const chemin = cheminDe(ici);
  const meme = onglets.find(o => cheminDe(o.location) === chemin);
  const actif = meme?.id ?? (onglets.some(o => o.id === s.actif) ? s.actif : onglets[0].id);
  return { onglets: onglets.map(o => (o.id === actif ? { ...o, location: ici } : o)), actif };
}
