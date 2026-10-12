/* Fenêtres du CRM — ouvrir une page à côté, retrouver une fenêtre ouverte.
 *
 * On chiffre un devis dans une fenêtre en gardant le catalogue, le client ou
 * le CRM dans une autre. Le système ne dit pas à une fenêtre quelles sœurs
 * existent : chacune s'annonce sur un BroadcastChannel (`useFenetres`), et ce
 * module se charge de les ouvrir et de les mettre au premier plan.
 *
 * L'IDENTITÉ D'UNE FENÊTRE EST `window.name`, PAS sessionStorage : Chrome
 * copie le sessionStorage de l'ouvreuse dans la fenêtre ouverte, deux fenêtres
 * porteraient le même identifiant. `window.name` survit au rechargement, et
 * c'est lui que `window.open('', nom)` retrouve.
 *
 * ⚠️ BASCULER SE FAIT PAR `window.open('', nom)`, JAMAIS PAR `w.focus()`.
 * Mesuré dans Chrome le 12/10/2026, fenêtres séparées : `focus()` n'agit que
 * de la mère vers sa fille ET pendant un clic dans la mère — d'une sœur à
 * l'autre, vers la mère, ou relayé par la mère (appel dans son contexte,
 * minuteur hors clic), il est ignoré sans erreur. C'est ce qui laissait le clic
 * du menu sans effet. `window.open('', nom)` depuis un clic, lui, met au
 * premier plan n'importe quelle fenêtre du même groupe — sœur comme mère — et
 * ne la recharge pas (URL vide).
 *
 * LE GROUPE : les fenêtres ouvertes les unes par les autres (`opener`).
 * `ouvrirFenetre` ne coupe donc jamais le lien (pas de `noopener`). Une
 * fenêtre lancée depuis la barre des tâches forme son propre groupe :
 * `window.open` ne la trouverait pas et ouvrirait une page vierge. On compare
 * d'abord les racines (`racineFenetre`) pour ne pas tenter ; la page vierge
 * reste détectée et refermée si le cas se présente quand même. */

const PREFIXE = 'crm-';

function nouveauNom(): string {
  return PREFIXE + Math.random().toString(36).slice(2, 10);
}

/** Identifiant de cette fenêtre (son `window.name`), posé au premier appel. */
export function idFenetre(): string {
  if (!window.name.startsWith(PREFIXE)) window.name = nouveauNom();
  return window.name;
}

/** Deux fenêtres au même nom (onglet dupliqué) : la plus récente change. */
export function renommerFenetre(): string {
  window.name = nouveauNom();
  return window.name;
}

/** Nom de la fenêtre au sommet de la chaîne des `opener` : deux fenêtres de
 *  même racine sont du même groupe et peuvent basculer l'une vers l'autre. */
export function racineFenetre(): string {
  let w: Window = window;
  try {
    while (w.opener && w.opener !== w && !w.opener.closed) w = w.opener;
  } catch { /* opener d'une autre origine : on s'arrête là */ }
  if (w === window) return idFenetre();
  try { return w.name || idFenetre(); } catch { return idFenetre(); }
}

/** Ouvre `path` dans une nouvelle fenêtre du groupe. `null` si le navigateur bloque. */
export function ouvrirFenetre(path: string): Window | null {
  return window.open(path, nouveauNom());
}

/** Met au premier plan la fenêtre `nom`, du même groupe. À appeler pendant un
 *  clic ou une touche. `false` si elle n'a pas été retrouvée. */
export function basculerVers(nom: string): boolean {
  let w: Window | null = null;
  try { w = window.open('', nom); } catch { return false; }
  if (!w) return false;
  let vierge = false;
  try { vierge = w.location.href === 'about:blank'; } catch { /* autre origine */ }
  if (vierge) { w.close(); return false; }
  return true;
}
