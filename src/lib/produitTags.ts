import { useCallback, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Produit } from '@/lib/store';

/**
 * Tags d'articles : les mots par lesquels le CLIENT demande un article.
 *
 * ⚠️ **LE CLIENT N'EMPLOIE PAS LE VOCABULAIRE DU CATALOGUE, ET C'EST TOUT LE
 * PROBLÈME.** Il écrit « cycliste » ; l'article s'appelle « Homme à vélo ».
 * Ni la référence, ni la description, ni la catégorie ne contiennent le mot
 * tapé : la recherche ne rend rien, et le commercial retrouve l'article de
 * tête. Il le retrouve **à chaque fois**, et son collègue ne profite jamais de
 * ce qu'il sait — le rapprochement est refait à neuf à chaque devis.
 *
 * Un tag est donc un **synonyme du catalogue**, pas une note de devis : il
 * n'appartient ni au devis ni au client, il est vrai pour tout le monde dès
 * qu'il a été constaté une fois. D'où la table commune `produit_tags`.
 *
 * ⚠️ **JAMAIS AFFICHÉ DANS UN DEVIS.** Le tag est le mot du client, pas la
 * désignation commerciale — « cycliste » sur une ligne de devis à la place de
 * « Homme à vélo » serait une erreur de fond. Il ne sert qu'à retrouver
 * l'article. Aucun rendu (`DevisPreview`, PDF, mail, Odoo) ne le lit.
 *
 * ⚠️ **TOUS LES MOTS DE LA DEMANDE NE SONT PAS DES TAGS.** « 30 m² de résine
 * époxy » ne doit pas apprendre « 30 », « m² » ni « résine » — le premier est
 * une quantité, le deuxième une unité, le troisième figure déjà dans la
 * désignation de l'article. N'a de valeur que ce qui reste : ce que le client
 * dit et que le catalogue ne dit pas. `tagACandidat` ne garde que cela, et
 * n'apprend tout seul que si ce reste tient en un ou deux mots — au-delà, la
 * phrase est trop circonstancielle pour valoir synonyme, et on la propose au
 * lieu de l'inscrire.
 */

export type OrigineTag = 'manuel' | 'appris';

export interface TagArticle {
  id: string;
  produitId: string;
  /** Toujours en minuscules, espaces resserrés — la forme que compare la recherche. */
  tag: string;
  origine: OrigineTag;
  createdAt: string;
}

/* ── Fonctions pures ──────────────────────────────────────────────────────── */

export function sansAccents(t: string) {
  return t.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Forme retenue en base : minuscules, espaces resserrés, ponctuation de bord
 * enlevée. Les accents sont CONSERVÉS — « bétonnière » reste lisible sur la
 * fiche article ; c'est la comparaison, pas le stockage, qui les ignore.
 */
export function normaliserTag(brut: string): string {
  return brut
    .toLowerCase()
    .replace(/[«»"'’(),.;:!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Deux tags sont le même dès qu'ils ne diffèrent que par la casse ou les accents. */
export function memeTag(a: string, b: string) {
  return sansAccents(normaliserTag(a)) === sansAccents(normaliserTag(b));
}

/**
 * Mots qui ne désignent jamais un article.
 *
 * Pas une liste de mots interdits « métier » — celle-là serait fausse en six
 * mois, et l'article s'en charge déjà (voir `motsDuProduit`). Uniquement la
 * grammaire de la demande : liaisons, formules de politesse, et le vocabulaire
 * du bon de commande (quantité, livraison, référence) qui accompagne n'importe
 * quel article sans en distinguer aucun.
 */
const MOTS_VIDES = new Set([
  'a', 'au', 'aux', 'avec', 'ce', 'ces', 'cet', 'cette', 'd', 'dans', 'de', 'des',
  'du', 'en', 'et', 'l', 'la', 'le', 'les', 'ou', 'par', 'pour', 'sans', 'se',
  'sur', 'un', 'une', 'nous', 'vous', 'je', 'il', 'elle', 'on', 'qui', 'que',
  'bonjour', 'merci', 'svp', 'stp', 'cordialement', 'besoin', 'voudrais',
  'souhaite', 'souhaitons', 'demande', 'commande', 'commander', 'livraison',
  'livrer', 'devis', 'prix', 'tarif', 'ref', 'reference', 'references',
  'article', 'articles', 'produit', 'produits', 'qte', 'quantite', 'quantites',
  'total', 'ht', 'ttc', 'tva', 'euro', 'euros', 'remise', 'unite', 'unites',
]);

/** Unités et conditionnements : ils qualifient la quantité, pas l'article. */
const UNITES = new Set([
  'm', 'm2', 'm²', 'm3', 'm³', 'ml', 'mm', 'cm', 'km', 'kg', 'g', 'l', 'cl',
  'u', 'pc', 'pce', 'pces', 'piece', 'pieces', 'ens', 'ensemble', 'jeu', 'lot',
  'sac', 'sacs', 'pot', 'pots', 'seau', 'seaux', 'fut', 'futs', 'palette',
  'palettes', 'carton', 'cartons', 'boite', 'boites', 'paquet', 'paquets',
]);

/** Un mot qui n'apprend rien : liaison, unité, ou nombre (y compris « 80x40 »). */
function motInutile(mot: string): boolean {
  const m = sansAccents(mot);
  if (m.length < 2) return true;
  if (MOTS_VIDES.has(m) || UNITES.has(m)) return true;
  // Nombres, dimensions, codes purement numériques : « 30 », « 3,50 », « 80x40 ».
  if (/^[\d.,]+$/.test(m)) return true;
  if (/^\d+[x×]\d+(?:[x×]\d+)?$/.test(m)) return true;
  // Nombre collé à son unité : « 20kg », « 3m », « 500ml ».
  const sansNombre = m.replace(/^[\d.,]+/, '');
  if (sansNombre !== m && UNITES.has(sansNombre)) return true;
  return false;
}

/** Découpe un texte en mots comparables (minuscules, sans accents). */
export function motsDe(texte: string): string[] {
  return sansAccents(texte.toLowerCase())
    .split(/[^a-z0-9²³×]+/)
    .filter(Boolean);
}

/**
 * Le vocabulaire que l'article porte déjà.
 *
 * Référence, désignation, description détaillée et catégorie : un mot qui s'y
 * trouve n'apprend rien, la recherche le trouve sans tag. C'est ce filtre qui
 * évite d'apprendre « résine » sur une résine.
 */
export function motsDuProduit(p: Produit): Set<string> {
  const champs = [p.reference, p.description, p.descriptionDetaillee, p.categorie];
  return new Set(champs.filter(Boolean).flatMap(c => motsDe(c as string)));
}

/**
 * Le vocabulaire des RÉFÉRENCES du catalogue : ce qu'un tag ne doit jamais
 * retenir tout seul.
 *
 * ⚠️ **UN CODE N'EST PAS UN SYNONYME, ET L'APPRENTISSAGE NE SAVAIT PAS LES
 * DISTINGUER.** Sur « panneau AK3 », un AK14 retenu par erreur pendant un
 * essai a fait inscrire le tag « panneau ak3 » sur cet AK14. Inerte tant que
 * les tags ne servaient qu'à la recherche à la main ; devenu ravageur dès
 * qu'ils ont pesé 60 points dans le rapprochement, c'est-à-dire une
 * certitude : toute demande contenant « panneau AK3 » retenait un AK14
 * d'office, sans un mot d'avertissement.
 *
 * Le critère est mesuré sur le catalogue réel, pas choisi au jugé — `ak3`
 * figure dans **18** références, `panneau` dans **2** : les deux mots de la
 * fausse leçon sont donc écartés, et rien n'est appris. À l'inverse `plot`
 * (0 référence), `cycliste` et `pvc` passent, et ce sont précisément les
 * synonymes qu'on veut retenir. Pas de seuil de fréquence sur les
 * DÉSIGNATIONS : `plot` en compte 38, et c'est justement parce que le
 * PLASTOBLOC n'en fait pas partie que le tag a de la valeur.
 *
 * ⚠️ Ne s'applique qu'à l'apprentissage AUTOMATIQUE. Un tag saisi à la main
 * sur la fiche article reste libre : celui qui l'écrit sait ce qu'il fait.
 */
const cacheVocabulaire = new WeakMap<readonly Produit[], Set<string>>();

export function vocabulaireCatalogue(produits: Produit[]): Set<string> {
  const connu = cacheVocabulaire.get(produits);
  if (connu) return connu;
  const v = new Set<string>();
  for (const p of produits) for (const m of motsDe(p.reference || '')) v.add(m);
  cacheVocabulaire.set(produits, v);
  return v;
}

/**
 * Ce que la demande dit et que l'article ne dit pas.
 *
 * Rend les mots dans l'ordre où le client les a écrits — « plots bordure »
 * n'est pas « bordure plots », et un tag qui inverse les mots ne se retrouve
 * pas à la relecture.
 */
export function motsAppris(
  demande: string,
  produit: Produit,
  tagsConnus: string[] = [],
  vocabulaire?: ReadonlySet<string>,
): string[] {
  const deja = motsDuProduit(produit);
  for (const t of tagsConnus) for (const m of motsDe(t)) deja.add(m);

  const vus = new Set<string>();
  const sortie: string[] = [];
  for (const brut of demande.split(/[^\p{L}\p{N}²³×]+/u)) {
    const mot = brut.toLowerCase();
    if (!mot) continue;
    const cle = sansAccents(mot);
    // Un code du catalogue n'est pas un mot de client : voir `vocabulaireCatalogue`.
    if (motInutile(mot) || deja.has(cle) || vus.has(cle) || vocabulaire?.has(cle)) continue;
    vus.add(cle);
    sortie.push(mot);
  }
  return sortie;
}

export interface CandidatTag {
  /** Le tag proposé, déjà normalisé — prêt à écrire. */
  tag: string;
  /**
   * Vrai quand le CRM l'inscrit sans rien demander.
   *
   * Un ou deux mots retenus : c'est un synonyme, on l'apprend. Trois et plus :
   * c'est une phrase de circonstance (« bordure trottoir côté nord »), qui ne
   * vaudra plus rien au devis suivant — on la propose, l'utilisateur tranche.
   */
  automatique: boolean;
}

/** Nombre de mots retenus au-delà duquel on propose au lieu d'inscrire. */
export const MOTS_MAX_AUTOMATIQUE = 2;

/**
 * Le tag à retenir d'un choix d'article fait à la main, ou rien.
 *
 * `demande` est le texte que l'utilisateur avait sous les yeux avant de
 * choisir : la description qu'il a tapée sur la ligne de devis, ou le libellé
 * de la demande client dans l'analyse de document.
 */
export function tagACandidat(
  demande: string,
  produit: Produit,
  tagsConnus: string[] = [],
  /** `vocabulaireCatalogue(produits)` — les mots qui sont des codes, pas des synonymes. */
  vocabulaire?: ReadonlySet<string>,
): CandidatTag | null {
  const mots = motsAppris(demande || '', produit, tagsConnus, vocabulaire);
  if (!mots.length) return null;
  const tag = normaliserTag(mots.join(' '));
  if (!tag) return null;
  if (tagsConnus.some(t => memeTag(t, tag))) return null;
  return { tag, automatique: mots.length <= MOTS_MAX_AUTOMATIQUE };
}

/** Regroupe les tags par article — l'index que consulte la recherche. */
export function tagsParProduit(tags: TagArticle[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const t of tags) {
    const l = m.get(t.produitId);
    if (l) l.push(t.tag);
    else m.set(t.produitId, [t.tag]);
  }
  return m;
}

/* ── Réserve partagée ─────────────────────────────────────────────────────── */

/**
 * ⚠️ **UNE SEULE LECTURE POUR TOUTE L'APPLICATION**, et c'est la raison d'être
 * de cette réserve au lieu d'un `useState` par composant.
 *
 * Le sélecteur d'article (`ProduitCombobox`) est monté **une fois par ligne de
 * devis**. Un hook qui interrogerait Supabase à chaque montage ferait trente
 * requêtes à l'ouverture d'un devis de trente lignes, et autant à chaque
 * réouverture. La table est ici chargée une fois, partagée par tous les
 * abonnés, et mise à jour en place quand on ajoute ou retire un tag.
 */
let liste: TagArticle[] = [];
let chargement = true;
let promesse: Promise<void> | null = null;
const abonnes = new Set<() => void>();

function notifier() {
  for (const f of [...abonnes]) f();
}

let cacheParProduit: { source: TagArticle[]; index: Map<string, string[]> } | null = null;

function poser(next: TagArticle[]) {
  liste = next;
  cacheParProduit = null;
  notifier();
}

/** L'index par article, recalculé seulement quand la liste change. */
export function indexTags(): Map<string, string[]> {
  if (!cacheParProduit || cacheParProduit.source !== liste) {
    cacheParProduit = { source: liste, index: tagsParProduit(liste) };
  }
  return cacheParProduit.index;
}

interface LigneDb {
  id: string;
  produit_id: string;
  tag: string;
  origine: string;
  created_at: string;
}

function dbToTag(r: LigneDb): TagArticle {
  return {
    id: r.id,
    produitId: r.produit_id,
    tag: r.tag,
    origine: r.origine === 'appris' ? 'appris' : 'manuel',
    createdAt: r.created_at,
  };
}

async function charger(): Promise<void> {
  const { data, error } = await supabase
    .from('produit_tags' as never)
    .select('*')
    .order('tag');
  if (error) {
    // La table peut manquer sur un environnement pas encore migré : la
    // recherche doit continuer de fonctionner sans les tags.
    console.error('[produit_tags]', error.message);
    liste = [];
  } else {
    liste = ((data || []) as unknown as LigneDb[]).map(dbToTag);
  }
  cacheParProduit = null;
  chargement = false;
  notifier();
}

function assurerChargement() {
  if (!promesse) promesse = charger();
  return promesse;
}

function abonner(f: () => void) {
  abonnes.add(f);
  void assurerChargement();
  return () => { abonnes.delete(f); };
}

/* ── Écritures ────────────────────────────────────────────────────────────── */

/**
 * Inscrit un tag. Rend l'erreur à afficher, ou `null`.
 *
 * L'écriture est idempotente en base : l'index unique `(produit_id, tag)`
 * fait que le même mot appris deux fois ne crée pas de doublon.
 */
export async function ajouterTag(
  produitId: string,
  brut: string,
  origine: OrigineTag = 'manuel',
): Promise<string | null> {
  const tag = normaliserTag(brut);
  if (!tag) return 'Un tag vide n’apprend rien.';
  if (indexTags().get(produitId)?.some(t => memeTag(t, tag))) return null;

  const { data, error } = await supabase
    .from('produit_tags' as never)
    .insert({ produit_id: produitId, tag, origine } as never)
    .select()
    .single();
  if (error) return error.message;
  poser([...liste, dbToTag(data as unknown as LigneDb)]);
  return null;
}

export async function supprimerTag(id: string): Promise<string | null> {
  const { error } = await supabase.from('produit_tags' as never).delete().eq('id', id);
  if (error) return error.message;
  poser(liste.filter(t => t.id !== id));
  return null;
}

/** Retire un tag d'un article en le désignant par son mot, pas par son id. */
export async function oublierTag(produitId: string, tag: string): Promise<string | null> {
  const ligne = liste.find(t => t.produitId === produitId && memeTag(t.tag, tag));
  return ligne ? supprimerTag(ligne.id) : null;
}

/* ── Hook ─────────────────────────────────────────────────────────────────── */

export function useProduitTags() {
  const tags = useSyncExternalStore(abonner, () => liste, () => liste);
  const enCours = useSyncExternalStore(abonner, () => chargement, () => chargement);

  const parProduit = indexTags();

  const tagsDe = useCallback(
    (produitId?: string | null) => (produitId ? parProduit.get(produitId) ?? [] : []),
    [parProduit],
  );

  return {
    tags,
    chargement: enCours,
    parProduit,
    tagsDe,
    ajouter: ajouterTag,
    supprimer: supprimerTag,
    oublier: oublierTag,
  };
}
