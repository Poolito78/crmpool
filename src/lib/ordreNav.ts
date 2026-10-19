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
 * Une PAGE peut aussi changer de place dans l'arbre : sortir d'un groupe vers
 * le premier niveau (entre Stock et Calcul Transport), ou passer dans un autre
 * groupe. Sa place se lit dans la liste qui la nomme (`groupes[libellé]` ou
 * `racine`) ; une page qu'aucune liste ne nomme reste dans son groupe
 * d'origine. Un GROUPE ne se range qu'au premier niveau.
 *
 * Préférence de confort, propre à ce navigateur : rangée en localStorage,
 * jamais en base. */

export type OrdreNav = { racine?: string[]; groupes?: Record<string, string[]> };
/** Ordre complet tel qu'affiché : toute clé y figure, dans une seule liste. */
export type StructureNav = { racine: string[]; groupes: Record<string, string[]> };

export const LISTE_RACINE = 'racine';

type LienBase = { type: 'link'; path: string };
type GroupeBase<L extends LienBase> = { type: 'group'; label: string; items: L[] };

/** Clé d'une entrée de premier niveau : le chemin d'un lien, `groupe:<libellé>`. */
export const cleEntree = (e: LienBase | { type: 'group'; label: string }) =>
  e.type === 'group' ? `groupe:${e.label}` : e.path;

/** Le menu (déjà filtré par les droits) rangé selon `ordre`. */
export function appliquerOrdre<L extends LienBase, G extends GroupeBase<L>>(base: Array<L | G>, ordre: OrdreNav): Array<L | G> {
  const liens = new Map<string, L>();
  const origine = new Map<string, string>();
  const groupes = base.filter((e): e is G => e.type === 'group');
  for (const e of base) {
    if (e.type === 'group') for (const i of (e as G).items) { liens.set(i.path, i); origine.set(i.path, (e as G).label); }
    else { liens.set(e.path, e as L); origine.set(e.path, LISTE_RACINE); }
  }
  const libelles = new Set(groupes.map(g => g.label));
  const place = new Map<string, string>();
  for (const [libelle, cles] of Object.entries(ordre.groupes ?? {})) {
    if (!libelles.has(libelle)) continue;
    for (const c of cles) if (liens.has(c) && !place.has(c)) place.set(c, libelle);
  }
  for (const c of ordre.racine ?? []) if (liens.has(c) && !place.has(c)) place.set(c, LISTE_RACINE);
  const ou = (c: string) => place.get(c) ?? origine.get(c)!;
  /** Les liens d'une liste : ceux d'origine restés là, puis ceux venus d'ailleurs. */
  const venus = (liste: string) => [...liens.values()].filter(i => ou(i.path) === liste && origine.get(i.path) !== liste);

  const ranges = new Map(groupes.map(g => [g.label, {
    ...g,
    items: ordonner([...g.items.filter(i => ou(i.path) === g.label), ...venus(g.label)], i => i.path, ordre.groupes?.[g.label]),
  } as G]));
  const racine: Array<L | G> = [
    ...base
      .filter(e => e.type === 'group' || ou(e.path) === LISTE_RACINE)
      .map(e => e.type === 'group' ? ranges.get((e as G).label)! : e),
    ...venus(LISTE_RACINE),
  ];
  return ordonner<L | G>(racine, cleEntree, ordre.racine);
}

export function structureDe(nav: Array<LienBase | GroupeBase<LienBase>>): StructureNav {
  return {
    racine: nav.map(cleEntree),
    groupes: Object.fromEntries(nav.filter((e): e is GroupeBase<LienBase> => e.type === 'group').map(g => [g.label, g.items.map(i => i.path)])),
  };
}

/** Place `cle` dans `liste`, avant ou après `vers` (au début si `vers` est nul).
 *  Rend `s` lui-même quand rien ne change : l'appelant n'a rien à rendre. */
export function placer(s: StructureNav, cle: string, liste: string, vers: string | null, apres: boolean): StructureNav {
  const sans = (l: string[]) => l.filter(c => c !== cle);
  const n: StructureNav = {
    racine: sans(s.racine),
    groupes: Object.fromEntries(Object.entries(s.groupes).map(([g, l]) => [g, sans(l)])),
  };
  const cible = liste === LISTE_RACINE ? n.racine : n.groupes[liste];
  if (!cible) return s;
  if (vers === null) cible.unshift(cle);
  else {
    const i = cible.indexOf(vers);
    if (i < 0) return s;
    cible.splice(i + (apres ? 1 : 0), 0, cle);
  }
  return JSON.stringify(n) === JSON.stringify(s) ? s : n;
}

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
