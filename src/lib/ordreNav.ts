/* Ordre du menu latéral choisi par l'utilisateur (appui long puis glisser).
 *
 * L'ordre se garde par CLÉS — le chemin d'un lien, `groupe:<libellé>` pour un
 * groupe — et non par positions : le menu change selon les droits (Achat,
 * CRM, onglets réservés aux administrateurs) et s'enrichit d'une version à
 * l'autre. Une position enregistrée glisserait d'un cran dès qu'une entrée
 * apparaît ou disparaît ; une clé désigne toujours la même entrée.
 *
 * Une entrée absente de l'ordre enregistré (ajoutée depuis, ou rendue visible
 * par un droit) garde sa place d'origine au lieu d'être rejetée en fin de
 * liste. Une clé enregistrée qui ne correspond plus à rien est ignorée.
 *
 * Préférence de confort, propre à ce navigateur : rangée en localStorage,
 * jamais en base. */

export type OrdreNav = { racine?: string[]; groupes?: Record<string, string[]> };

const CLE_STOCKAGE = 'crm_nav_ordre';

/** Range `liste` selon `ordre` (clés), les inconnues à leur place d'origine. */
export function ordonner<T>(liste: T[], cle: (t: T) => string, ordre?: string[]): T[] {
  if (!ordre?.length) return liste;
  const rang = new Map(ordre.map((c, i) => [c, i]));
  const res = liste
    .filter(t => rang.has(cle(t)))
    .sort((a, b) => rang.get(cle(a))! - rang.get(cle(b))!);
  liste.forEach((t, i) => {
    if (!rang.has(cle(t))) res.splice(Math.min(i, res.length), 0, t);
  });
  return res;
}

/** Déplace `cle` à la place de `vers` : après lui en descendant, avant en montant. */
export function deplacerCle(cles: string[], cle: string, vers: string): string[] {
  const de = cles.indexOf(cle);
  const a = cles.indexOf(vers);
  if (de < 0 || a < 0 || de === a) return cles;
  const res = cles.slice();
  res.splice(de, 1);
  res.splice(a, 0, cle);
  return res;
}

const estListe = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');

export function lireOrdreNav(): OrdreNav {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_STOCKAGE) ?? '{}');
    const ordre: OrdreNav = {};
    if (estListe(brut?.racine)) ordre.racine = brut.racine;
    if (brut?.groupes && typeof brut.groupes === 'object') {
      ordre.groupes = Object.fromEntries(Object.entries(brut.groupes).filter(([, v]) => estListe(v))) as Record<string, string[]>;
    }
    return ordre;
  } catch {
    return {};
  }
}

export function ecrireOrdreNav(ordre: OrdreNav) {
  try {
    if (!ordre.racine && !Object.keys(ordre.groupes ?? {}).length) localStorage.removeItem(CLE_STOCKAGE);
    else localStorage.setItem(CLE_STOCKAGE, JSON.stringify(ordre));
  } catch { /* stockage indisponible : l'ordre vaut pour la session */ }
}
