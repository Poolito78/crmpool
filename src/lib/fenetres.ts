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
 * BASCULER : une fenêtre ne peut pas se donner le focus elle-même — le
 * navigateur le refuse sans geste de l'utilisateur DANS cette fenêtre. Il faut
 * la poignée `Window` et l'appeler depuis le clic. On la cherche dans l'arbre
 * des fenêtres liées (chacune expose ses enfants sur `__crmEnfants`, l'arbre se
 * remonte par `opener`), puis par `window.open('', nom)`. Seules les fenêtres
 * ouvertes par `ouvrirFenetre` sont liées ; une fenêtre lancée depuis la barre
 * des tâches ne se retrouve pas — `window.open` crée alors une page vierge,
 * refermée aussitôt, et l'appelant le dit. */

const PREFIXE = 'crm-';

type FenetreCrm = Window & { __crmEnfants?: Map<string, Window> };

const enfants = new Map<string, Window>();
(window as FenetreCrm).__crmEnfants = enfants;

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

/** Ouvre `path` dans une nouvelle fenêtre liée. `null` si le navigateur bloque. */
export function ouvrirFenetre(path: string): Window | null {
  const nom = nouveauNom();
  const w = window.open(path, nom);
  if (!w) return null;
  enfants.set(nom, w);
  try { w.focus(); } catch { /* ignore */ }
  return w;
}

function ouverte(w: Window | null | undefined): w is FenetreCrm {
  try { return !!w && !w.closed; } catch { return false; }
}

/** Parcourt l'arbre des fenêtres liées, depuis la racine des `opener`. */
function chercherDansArbre(nom: string): Window | null {
  let racine: FenetreCrm = window as FenetreCrm;
  const vues = new Set<Window>([racine]);
  try {
    while (ouverte(racine.opener) && !vues.has(racine.opener)) {
      racine = racine.opener as FenetreCrm;
      vues.add(racine);
    }
  } catch { /* opener d'une autre origine */ }

  const pile: FenetreCrm[] = [racine];
  const visitees = new Set<Window>();
  while (pile.length) {
    const w = pile.pop()!;
    if (visitees.has(w)) continue;
    visitees.add(w);
    try {
      if (w !== window && w.name === nom) return w;
      w.__crmEnfants?.forEach(e => { if (ouverte(e)) pile.push(e as FenetreCrm); });
    } catch { /* fenêtre déchargée */ }
  }
  return null;
}

/** Met au premier plan la fenêtre `nom`. À appeler depuis un geste de
 *  l'utilisateur. `false` si elle n'a pas pu être retrouvée. */
export function basculerVers(nom: string): boolean {
  let cible = chercherDansArbre(nom);
  if (!cible) {
    try {
      const w = window.open('', nom);
      if (w) {
        let vierge = false;
        try { vierge = w.location.href === 'about:blank'; } catch { /* autre origine */ }
        if (vierge) w.close(); else cible = w;
      }
    } catch { /* ignore */ }
  }
  if (!cible) return false;
  try { cible.focus(); } catch { return false; }
  return true;
}
