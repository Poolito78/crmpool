import type { LigneKit, Produit } from './store';

/**
 * VARIANTES COMPOSÉES d'un article : chacune est une combinaison de produits
 * (un mini « produit composé ») proposée à la saisie de l'article dans un
 * devis, AVANT les options.
 *
 * Choisie, elle tient sur UNE ligne : la désignation reprend celle de
 * l'article de base et le nom de la variante en complément, le prix est la
 * somme de ses composants.
 *
 * ELLE VIT DANS `variantesChoisies` de la ligne, sous la clé `__compo`
 * (valeur = identifiant de la variante) : toutes les relectures de prix du
 * devis passent par `getPrixLigne(…, l.variantesChoisies, …)` et la retrouvent
 * sans qu'on ait à les toucher une à une. Les clés qui commencent par `__`
 * sont INTERNES : elles ne s'affichent jamais (`valeursVisibles`).
 */

export interface VarianteCompo {
  id: string;
  nom: string;
  composants: LigneKit[];
}

export const CLE_COMPO = '__compo';

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Donne le prix unitaire courant de l'article d'un composant (celui du devis : client, niveau de tarif), ou `undefined`. */
export type ResoudrePrix = (c: LigneKit) => number | undefined;

/**
 * Prix unitaire d'un composant. Un composant qui désigne un ARTICLE en suit le
 * prix courant (`resoudre`) — c'est le reflet de l'article de base, il bouge
 * avec lui. Il ne garde son prix enregistré que si on l'a saisi à la main
 * (`prixFige`), ou si l'article est introuvable.
 */
export function prixComposant(c: LigneKit, resoudre?: ResoudrePrix): number {
  const vivant = !c.prixFige && c.produitId && resoudre ? resoudre(c) : undefined;
  // Un prix d'article non renseigné (0) ne remplace pas le prix enregistré : on ne vend pas à 0 par défaut.
  return vivant != null && vivant > 0 ? vivant : (c.prixUnitaireHT || 0);
}

/** Prix HT d'un ensemble : somme des composants, remise comprise. */
export function prixVarianteCompo(v: VarianteCompo, resoudre?: ResoudrePrix): number {
  return arrondi(v.composants.reduce(
    (s, c) => s + (c.quantite || 0) * prixComposant(c, resoudre) * (1 - (c.remise || 0) / 100), 0));
}

/**
 * VARIANTES EN CASCADE. Un composant peut être lui-même un article à variantes
 * composées : SNLR dans une variante de 319R. Son choix est demandé à la suite,
 * et vit sur la MÊME ligne, sous `__compo/<id de l'article composant>` (valeur
 * = identifiant de la sous-variante). Le composant vaut alors le prix de sa
 * sous-variante, et l'intitulé de la ligne l'annonce.
 *
 * Indexé par ARTICLE et non par position : le même article choisi deux fois
 * dans une ligne prend la même sous-variante, et la clé survit à un
 * réordonnancement des composants. La profondeur est bornée (`PROFONDEUR_MAX`)
 * : une boucle de fiches (A dans B dans A) ne doit pas figer le devis.
 */
export const cleSousCompo = (produitId: string) => `${CLE_COMPO}/${produitId}`;
const PROFONDEUR_MAX = 5;

type AvecVariantes = Pick<Produit, 'id' | 'variantesCompo'>;

/** La sous-variante choisie pour l'article d'un composant, s'il en a une. */
export function sousVarianteDe<P extends AvecVariantes>(
  c: LigneKit,
  trouver: (id: string) => P | undefined,
  variantesChoisies?: Record<string, string>,
): { produit: P; variante: VarianteCompo } | undefined {
  if (!c.produitId) return undefined;
  const id = variantesChoisies?.[cleSousCompo(c.produitId)];
  if (!id) return undefined;
  const produit = trouver(c.produitId);
  const variante = produit?.variantesCompo?.find(v => v.id === id);
  return produit && variante ? { produit, variante } : undefined;
}

/**
 * Le `resoudre` d'une ligne : un composant à sous-variante choisie vaut le prix
 * de celle-ci (récursivement), les autres le prix de leur article. Un prix
 * saisi à la main (`prixFige`) reste prioritaire, comme partout.
 */
export function resoudreAvecSousVariantes(
  resoudre: ResoudrePrix,
  trouver: (id: string) => AvecVariantes | undefined,
  variantesChoisies?: Record<string, string>,
  profondeur = 0,
): ResoudrePrix {
  return c => {
    const sous = !c.prixFige && profondeur < PROFONDEUR_MAX ? sousVarianteDe(c, trouver, variantesChoisies) : undefined;
    if (sous) return prixVarianteCompo(sous.variante, resoudreAvecSousVariantes(resoudre, trouver, variantesChoisies, profondeur + 1));
    return resoudre(c);
  };
}

/** Les sous-variantes retenues dans une variante, en profondeur, dans l'ordre des composants. */
export function sousVariantesRetenues<P extends AvecVariantes>(
  v: VarianteCompo,
  trouver: (id: string) => P | undefined,
  variantesChoisies?: Record<string, string>,
  profondeur = 0,
): { produit: P; variante: VarianteCompo }[] {
  if (profondeur >= PROFONDEUR_MAX) return [];
  return v.composants.flatMap(c => {
    const sous = sousVarianteDe(c, trouver, variantesChoisies);
    return sous ? [sous, ...sousVariantesRetenues(sous.variante, trouver, variantesChoisies, profondeur + 1)] : [];
  });
}

/**
 * LE DÉTAIL D'UNE LIGNE À VARIANTE COMPOSÉE, mis à plat.
 *
 * Une ligne « KIT FLOWFAST 319 ROAD » se lit, dépliée, comme si l'on avait
 * saisi ses articles un par un : 319 Unpigmented, SNLR, pigment — sous-variantes
 * dépliées à leur place, quantités multipliées. Chaque composant porte son prix
 * de vente, son poids, son prix d'achat ; le prix de vente se force à la main
 * (`LigneDevis.prixComposants`, clé = `cle` ci-dessous) et le prix de la ligne
 * est alors la somme du détail — un seul calcul, `prixDetailCompo`, pour
 * l'affichage ET le prix de la ligne.
 *
 * La CLÉ suit le chemin dans la composition (`<variante>:<rang>/<sous-variante>:<rang>`) :
 * deux fois le même article dans une variante restent deux composants.
 */
export interface ComposantDetaille<P> {
  cle: string;
  composant: LigneKit;
  produit?: P;
  /** Quantité pour UNE unité de la ligne (sous-variantes multipliées). */
  quantite: number;
  /** Remise(s) du chemin, en facteur (0,9 pour 10 %). */
  facteurRemise: number;
  /** Prix de vente unitaire retenu (forcé à la main s'il l'est). */
  prixUnitaire: number;
  /** Prix de vente calculé, sans le forçage — pour le montrer et y revenir. */
  prixCalcule: number;
  force: boolean;
  /** Niveau dans la composition (0 = composant direct). */
  profondeur: number;
}

/**
 * LA COMPOSITION PROPRE À UNE LIGNE. Dès qu'on retouche le détail — une
 * quantité, un produit (SNLR11 → SNLR5), un composant dupliqué pour mêler deux
 * RAL —, la ligne ne suit plus la variante de la fiche : elle garde SA liste,
 * à plat, sous `__composants` (JSON) dans `variantesChoisies`. Comme les prix
 * forcés, elle suit ainsi la ligne dans toutes les relectures de prix.
 *
 * Chaque composant porte sa quantité pour UNE unité de la ligne, son prix
 * (figé s'il a été saisi, sinon celui de l'article au tarif du devis) et, au
 * besoin, sa propre teinte. « Rétablir » efface la clé : la variante reprend.
 */
export const CLE_COMPOSANTS = '__composants';

export interface ComposantLigne extends LigneKit {
  /** Teinte propre à ce composant (« RAL 1015… ») ; sans elle, celle de la ligne. */
  teinte?: string;
  /**
   * L'œil du composant sur le devis imprimé : `true` masqué, `false` affiché,
   * absent = par défaut (affiché s'il a été MODIFIÉ, voir `composantsVisibles`).
   * Masqué, il reste compté dans le prix.
   */
  masque?: boolean;
}

/**
 * Quels composants s'impriment — dans l'ordre de `detailCompo`.
 *
 * Règle du 11/10/2026 : quand la ligne a sa propre composition, seuls les
 * composants MODIFIÉS s'impriment par défaut — produit changé, quantité
 * retouchée, teinte propre, prix forcé, composant ajouté. Ceux restés tels que
 * la fiche article les donne n'apprennent rien au client : masqués d'office.
 * Sans composition propre (ligne simplement dépliée), tout s'imprime. L'œil
 * d'un composant (`masque`) l'emporte toujours.
 */
export function composantsVisibles<P extends AvecVariantes>(
  v: VarianteCompo, resoudre: ResoudrePrix, trouver: (id: string) => P | undefined, vc?: Record<string, string>,
): boolean[] {
  const perso = composantsPersonnalises(vc);
  if (!perso) return detailCompo(v, resoudre, trouver, vc, prixForces(vc)).map(() => true);
  // La composition de la fiche : la même ligne sans sa composition propre.
  const sansPerso = { ...(vc ?? {}) };
  delete sansPerso[CLE_COMPOSANTS];
  const origine = aPlat(v, resoudre, trouver, sansPerso);
  const pris = new Set<number>();
  return perso.map(c => {
    if (c.masque === true) return false;
    if (c.masque === false) return true;
    // Inchangé = un composant de la fiche, même produit, même quantité, sans teinte ni prix propres.
    const k = c.teinte || c.prixFige ? -1 : origine.findIndex((o, i) => !pris.has(i)
      && o.produitId === c.produitId && Math.abs((o.quantite || 0) - (c.quantite || 0)) < 1e-6 && !o.prixFige);
    if (k >= 0) { pris.add(k); return false; }
    return true;
  });
}

export function composantsPersonnalises(vc?: Record<string, string>): ComposantLigne[] | null {
  const brut = vc?.[CLE_COMPOSANTS];
  if (!brut) return null;
  try {
    const l = JSON.parse(brut);
    return Array.isArray(l) ? l as ComposantLigne[] : null;
  } catch { return null; }
}

export function avecComposants(vc: Record<string, string> | undefined, composants: ComposantLigne[] | null): Record<string, string> {
  const out = { ...(vc ?? {}) };
  if (composants == null) delete out[CLE_COMPOSANTS];
  else {
    out[CLE_COMPOSANTS] = JSON.stringify(composants);
    // La liste porte désormais ses prix : les forçages par chemin n'ont plus d'objet.
    for (const k of Object.keys(out)) if (k.startsWith(PREFIXE_PRIX)) delete out[k];
  }
  return out;
}

/**
 * La composition à plat, pour en faire la composition propre de la ligne : les
 * prix forcés deviennent des prix figés, les remises du chemin une remise.
 */
export function aPlat<P extends AvecVariantes>(
  v: VarianteCompo, resoudre: ResoudrePrix, trouver: (id: string) => P | undefined, vc?: Record<string, string>,
): ComposantLigne[] {
  return detailCompo(v, resoudre, trouver, vc, prixForces(vc)).map(d => ({
    ...d.composant,
    quantite: Math.round(d.quantite * 1e6) / 1e6,
    remise: Math.round((1 - d.facteurRemise) * 1e4) / 100,
    ...(d.force ? { prixFige: true, prixUnitaireHT: d.prixUnitaire } : {}),
  }));
}

export function detailCompo<P extends AvecVariantes>(
  v: VarianteCompo,
  resoudre: ResoudrePrix,
  trouver: (id: string) => P | undefined,
  variantesChoisies?: Record<string, string>,
  forces?: Record<string, number>,
  base = '',
  facteur = 1,
  facteurRemise = 1,
  profondeur = 0,
): ComposantDetaille<P>[] {
  if (profondeur >= PROFONDEUR_MAX) return [];
  // Composition propre à la ligne : elle remplace celle de la variante, déjà à plat.
  const perso = profondeur === 0 ? composantsPersonnalises(variantesChoisies) : null;
  if (perso) {
    return perso.map((c, i) => {
      const prixCalcule = prixComposant({ ...c, prixFige: false }, resoudre);
      const prix = prixComposant(c, resoudre);
      return {
        cle: `perso:${i}`, composant: c, produit: c.produitId ? trouver(c.produitId) : undefined,
        quantite: c.quantite || 0, facteurRemise: 1 - (c.remise || 0) / 100,
        prixUnitaire: prix, prixCalcule, force: !!c.prixFige, profondeur: 0,
      };
    });
  }
  return v.composants.flatMap((c, i) => {
    const cle = `${base}${v.id}:${i}`;
    const q = (c.quantite || 0) * facteur;
    const fr = facteurRemise * (1 - (c.remise || 0) / 100);
    const sous = !c.prixFige ? sousVarianteDe(c, trouver, variantesChoisies) : undefined;
    if (sous) return detailCompo(sous.variante, resoudre, trouver, variantesChoisies, forces, `${cle}/`, q, fr, profondeur + 1);
    const prixCalcule = prixComposant(c, resoudre);
    const force = forces?.[cle];
    return [{
      cle, composant: c, produit: c.produitId ? trouver(c.produitId) : undefined,
      quantite: q, facteurRemise: fr,
      prixUnitaire: force != null ? force : prixCalcule, prixCalcule, force: force != null, profondeur,
    }];
  });
}

/**
 * Les prix forcés vivent dans `variantesChoisies`, sous `__prix/<clé>` : comme
 * la variante elle-même, ils suivent la ligne dans TOUTES les relectures de
 * prix (`getPrixLigne`, changement de client ou de niveau) sans qu'on ait à les
 * passer à part. Clé interne (`__`) : jamais affichée.
 */
export const PREFIXE_PRIX = '__prix/';

export function prixForces(vc?: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(vc ?? {})) {
    if (!k.startsWith(PREFIXE_PRIX)) continue;
    const n = Number(v);
    if (Number.isFinite(n)) out[k.slice(PREFIXE_PRIX.length)] = n;
  }
  return out;
}

/** `variantesChoisies` avec le prix d'un composant forcé (`null` : il reprend son prix calculé). */
export function avecPrixForce(vc: Record<string, string> | undefined, cle: string, prix: number | null): Record<string, string> {
  const out = { ...(vc ?? {}) };
  if (prix == null) delete out[PREFIXE_PRIX + cle]; else out[PREFIXE_PRIX + cle] = String(prix);
  return out;
}

/** Prix d'UNE unité de la ligne : somme du détail (prix forcés compris). Égal à `prixVarianteCompo` sans forçage. */
export function prixDetailCompo(detail: ComposantDetaille<unknown>[]): number {
  return arrondi(detail.reduce((s, d) => s + d.quantite * d.prixUnitaire * d.facteurRemise, 0));
}

/** LE prix d'une ligne à variante composée : sous-variantes et prix forcés compris. */
export function prixLigneCompo(
  v: VarianteCompo,
  resoudre: ResoudrePrix,
  trouver: (id: string) => AvecVariantes | undefined,
  variantesChoisies?: Record<string, string>,
): number {
  return prixDetailCompo(detailCompo(v, resoudre, trouver, variantesChoisies, prixForces(variantesChoisies)));
}

/**
 * LES TEINTES DES COMPOSANTS. Le pigment d'un kit (PIGMENTKG, PIGMENT02) porte
 * la dimension « Teinte » et ses 220 RAL ; l'article de la ligne (319R, SNLR+P)
 * n'en porte aucune. Sans cela la ligne partait sans teinte, et aucun
 * sélecteur ne s'affichait. Les dimensions des composants sont donc demandées
 * après la variante, AVANT les options, et se rangent dans `variantesChoisies`
 * sous l'identifiant de la dimension du composant.
 *
 * Regroupées par NOM de dimension : deux pigments dans un même kit prennent la
 * même teinte, demandée une fois.
 */
type AvecDimensions = AvecVariantes & Pick<Produit, 'variantes'>;

export interface DimensionDeComposant<P> {
  /** Nom commun (« Teinte ») — la question posée une fois. */
  nom: string;
  /** Dimensions des composants qui portent ce nom (chacune reçoit le choix). */
  dimensions: NonNullable<Produit['variantes']>;
  /** Les articles qui les portent (pour l'affichage). */
  produits: P[];
}

export function dimensionsDesComposants<P extends AvecDimensions>(
  v: VarianteCompo,
  trouver: (id: string) => P | undefined,
  variantesChoisies?: Record<string, string>,
): DimensionDeComposant<P>[] {
  // Composition propre à la ligne : déjà à plat, ce sont SES composants qui portent les teintes.
  const perso = composantsPersonnalises(variantesChoisies);
  const variantes = perso
    ? [{ id: 'perso', nom: v.nom, composants: perso }]
    : [v, ...sousVariantesRetenues(v, trouver, variantesChoisies).map(s => s.variante)];
  const parNom = new Map<string, DimensionDeComposant<P>>();
  const vues = new Set<string>();
  for (const vr of variantes) {
    for (const c of vr.composants) {
      // Un composant déplié en sous-variante est représenté par SES composants.
      if (!perso && sousVarianteDe(c, trouver, variantesChoisies)) continue;
      const p = c.produitId ? trouver(c.produitId) : undefined;
      for (const d of p?.variantes ?? []) {
        if (!d.options.length || vues.has(d.id)) continue;
        vues.add(d.id);
        const cle = (d.nom || 'Variante').trim().toLowerCase();
        const g = parNom.get(cle) ?? { nom: d.nom || 'Variante', dimensions: [], produits: [] };
        g.dimensions.push(d);
        if (!g.produits.includes(p!)) g.produits.push(p!);
        parNom.set(cle, g);
      }
    }
  }
  return [...parNom.values()];
}

/**
 * L'ARTICLE PORTE DÉJÀ LA DIMENSION : elle ne se demande qu'une fois.
 *
 * PIGMENT a sa propre « Teinte » (220 RAL) ET des variantes composées — un
 * sachet de 1 kg, c'est PIGMENTKG, qui porte la sienne. La ligne affichait
 * donc deux sélecteurs « Teinte », l'un choisi, l'autre « à choisir ».
 * Quand l'article porte une dimension du même nom, c'est elle qui fait foi :
 * son choix est recopié sur les dimensions des composants (que lisent le
 * détail et l'impression), et le sélecteur des composants n'est pas affiché.
 */
const cleNom = (n?: string) => (n || 'Variante').trim().toLowerCase();

/** Les noms des dimensions de l'article lui-même (« teinte »…), en clé de comparaison. */
export function nomsDimensionsArticle(article?: Pick<Produit, 'variantes'>): Set<string> {
  return new Set((article?.variantes ?? []).filter(d => d.options.length > 0).map(d => cleNom(d.nom)));
}

/** Les groupes que l'article ne porte PAS lui-même : seuls ceux-là se demandent à part. */
export function groupesPropresAuxComposants<P>(
  groupes: DimensionDeComposant<P>[], article?: Pick<Produit, 'variantes'>,
): DimensionDeComposant<P>[] {
  const noms = nomsDimensionsArticle(article);
  return groupes.filter(g => !noms.has(cleNom(g.nom)));
}

/**
 * `variantesChoisies` où chaque dimension de l'article choisie est recopiée
 * sur les dimensions des composants du même nom ; `null` si rien ne change.
 */
export function avecDimensionsSuivies<P>(
  vc: Record<string, string> | undefined, groupes: DimensionDeComposant<P>[], article?: Pick<Produit, 'variantes'>,
): Record<string, string> | null {
  let out: Record<string, string> | null = null;
  for (const d of article?.variantes ?? []) {
    const valeur = vc?.[d.id];
    if (!valeur) continue;
    for (const g of groupes) {
      if (cleNom(g.nom) !== cleNom(d.nom)) continue;
      for (const gd of g.dimensions) {
        if ((out ?? vc)?.[gd.id] === valeur) continue;
        out = { ...(out ?? vc ?? {}), [gd.id]: valeur };
      }
    }
  }
  return out;
}

/**
 * Coût d'achat d'un ensemble, ou `undefined` : on ne le calcule que si CHAQUE
 * composant est un article du catalogue AVEC un prix d'achat renseigné — un coût partiel annoncerait une
 * marge fausse, et on n'invente pas une donnée métier. Un composant à
 * sous-variante choisie coûte ce que coûte sa sous-variante.
 */
export function achatVarianteCompo(
  v: VarianteCompo,
  produits: (Pick<Produit, 'id' | 'prixAchat'> & Partial<Pick<Produit, 'variantesCompo'>>)[],
  variantesChoisies?: Record<string, string>,
  profondeur = 0,
): number | undefined {
  // Composition propre à la ligne : son coût est celui de SES composants.
  const perso = profondeur === 0 ? composantsPersonnalises(variantesChoisies) : null;
  if (perso) return achatVarianteCompo({ id: 'perso', nom: v.nom, composants: perso }, produits, undefined, 1);
  if (v.composants.length === 0) return undefined;
  const trouver = (id: string) => produits.find(x => x.id === id);
  let total = 0;
  for (const c of v.composants) {
    const sous = profondeur < PROFONDEUR_MAX ? sousVarianteDe(c, trouver, variantesChoisies) : undefined;
    if (sous) {
      const achat = achatVarianteCompo(sous.variante, produits, variantesChoisies, profondeur + 1);
      if (achat === undefined) return undefined;
      total += (c.quantite || 0) * achat;
      continue;
    }
    const p = c.produitId ? trouver(c.produitId) : undefined;
    // Le prix d'achat de l'article doit être RENSEIGNÉ : à 0, on ne sait pas, on ne compte pas 0.
    if (!p || !(p.prixAchat > 0)) return undefined;
    total += (c.quantite || 0) * p.prixAchat;
  }
  return arrondi(total);
}

/** La variante composée portée par une ligne (`variantesChoisies`), si elle existe encore sur l'article. */
export function varianteDeLigne(
  produit: Pick<Produit, 'variantesCompo'> | undefined,
  variantesChoisies?: Record<string, string>,
): VarianteCompo | undefined {
  const id = variantesChoisies?.[CLE_COMPO];
  return id ? produit?.variantesCompo?.find(v => v.id === id) : undefined;
}

/**
 * Le nom d'une variante, ou à défaut celui de ses composants (« FLOWFAST 319
 * Flexible Seal Unpigmented (20 kg) + SNL 319 ROAD ») : le nom est FACULTATIF
 * dès que la variante désigne des articles. Les désignations vides ou sans
 * lettre (« . ») sont sautées. Sert à l'affichage (fiche, choix au devis) :
 * l'intitulé de la ligne, lui, ne reprend que le nom saisi.
 */
export function nomVariante(v: Pick<VarianteCompo, 'nom' | 'composants'>, nommer: (c: LigneKit) => string): string {
  if (significatif(v.nom)) return v.nom;
  return v.composants.map(nommer).filter(significatif).join(' + ');
}

/** Un libellé qui dit quelque chose : au moins une lettre ou un chiffre (« . » ne dit rien). */
const significatif = (t: string | undefined) => !!t && /[\p{L}\p{N}]/u.test(noteSansBalises(t));
/** Le texte sans balises de mise en forme (`**`), pour juger s'il est vide. */
const noteSansBalises = (t: string) => t.replace(/\*\*/g, '').replace(/\{\{#[0-9a-f]{3,8}\|/gi, '').replace(/\}\}/g, '');

/**
 * « Désignation de l'article - nom de la variante (article composant : sa variante) ».
 *
 * Les morceaux VIDES sont sautés : la variante de FLOWFAST319R n'a pas de nom
 * et l'article SNLR+P a pour désignation « . » — on écrivait
 * « KIT FLOWFAST 319 ROAD (45,8 kg) — (. : 2 Kits…) ». Sans nom de variante,
 * les sous-variantes prennent sa place, sans parenthèses ; sans désignation
 * lisible, l'article composant n'est pas nommé.
 */
export function designationAvecVariante(
  designationBase: string,
  v: Pick<VarianteCompo, 'nom'>,
  /** Sous-variantes retenues : « désignation de l'article composant » + nom de sa variante. */
  sous: { article: string; nom: string }[] = [],
): string {
  const sousTexte = sous
    .filter(s => significatif(s.nom) || significatif(s.article))
    .map(s => significatif(s.article) && significatif(s.nom) ? `${s.article} : ${s.nom}` : (significatif(s.nom) ? s.nom : s.article))
    .join(' - ');
  const nom = significatif(v.nom) ? v.nom.trim() : '';
  if (nom) return `${designationBase} - ${nom}${sousTexte ? ` (${sousTexte})` : ''}`;
  return sousTexte ? `${designationBase} - ${sousTexte}` : designationBase;
}

/** Les valeurs d'un `variantesChoisies` destinées à l'affichage (clés internes écartées). */
export function valeursVisibles(vc?: Record<string, string>): string[] {
  return Object.entries(vc ?? {}).filter(([k]) => !k.startsWith('__')).map(([, v]) => v);
}

/** Le même objet sans ses clés internes. */
export function sansClesInternes(vc?: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(vc ?? {}).filter(([k]) => !k.startsWith('__')));
}
