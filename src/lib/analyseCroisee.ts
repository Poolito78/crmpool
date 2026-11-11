/**
 * Analyse croisée — le « tableau croisé dynamique » d'Odoo (vue pivot de
 * l'Analyse des factures) appliqué aux devis, commandes client et factures
 * client de MonCRM.
 *
 * Le calcul part de FAITS : une ligne d'article d'un document = un fait, le
 * port d'un document = un fait « Frais de port ». On les regroupe ensuite en
 * lignes (plusieurs niveaux : Catégorie › Article) et en colonnes (un niveau :
 * le mois, le client…), et chaque case porte TOUTES les mesures à la fois —
 * total HT, quantité, nombre de documents, nombre de lignes. L'écran choisit
 * celles qu'il montre ; l'agrégat ne change pas.
 *
 * ⚠️ **UN ARTICLE SE RECONNAÎT PAR EXCLUSION** : `type` absent = ligne
 * d'article (les 410 lignes d'article en base portent `type: null`). On écarte
 * groupe / sous-total / texte, jamais on n'exige `'ligne'`.
 *
 * ⚠️ **LE NOMBRE DE DOCUMENTS N'EST PAS UNE SOMME** : un devis qui vend deux
 * articles compte une fois dans sa catégorie, pas deux. L'agrégat garde donc
 * l'ensemble des documents vus (`Set`), pas un compteur.
 *
 * ⚠️ **UN AVOIR SE DÉDUIT** : montant ET quantité au signe −1, comme sur la
 * page Factures (`signe`). Une proforma n'est pas une vente : l'appelant
 * l'écarte avant (`faitsFactures`). Un devis « système » est un modèle, pas
 * une offre : écarté de même (`faitsDevis`).
 *
 * Le libellé d'un article passe par `designationProduit`, seul point de
 * vérité ; une ligne sans article garde le texte du document, qui EST
 * l'information. Rien n'est deviné : une catégorie absente se lit
 * « (sans catégorie) ».
 */
import {
  calculerTotalLigne, designationProduit,
  STATUTS_COMMANDE_CLIENT, STATUTS_FACTURE_CLIENT,
  type CommandeClient, type Devis, type FactureClient, type LigneDevis, type Produit, type Client,
} from '@/lib/store';
import type { VenteOdoo } from '@/lib/ventesOdoo';

export type SourceAnalyse = 'devis' | 'commandes' | 'factures' | 'facturesOdoo' | 'commandesOdoo';

export const LIBELLE_SOURCE: Record<SourceAnalyse, string> = {
  devis: 'Devis',
  commandes: 'Commandes client',
  factures: 'Factures client',
  facturesOdoo: 'Factures Odoo',
  commandesOdoo: 'Commandes Odoo',
};

/** Sources lues dans `ventes_odoo` (copie Odoo), et non dans le store. */
export const estSourceOdoo = (s: SourceAnalyse): s is 'facturesOdoo' | 'commandesOdoo' => s === 'facturesOdoo' || s === 'commandesOdoo';

export interface FaitVente {
  documentId: string;
  numero: string;
  /** Date ISO du document (création ; pour une facture, sa date). */
  date: string;
  client: string;
  commercial: string;
  statut: string;
  /** Clé stable de l'article : id produit, sinon le texte de la ligne libre. */
  articleCle: string;
  article: string;
  reference: string;
  categorie: string;
  /** Premier segment de la catégorie (« ISOMARK » pour « ISOMARK / FLOORING / MMA »). */
  famille: string;
  affaire: string;
  totalHT: number;
  quantite: number;
}

// ── Dimensions ─────────────────────────────────────────────────────────────

export type DimensionId =
  | 'client' | 'commercial' | 'statut' | 'famille' | 'categorie' | 'article' | 'reference'
  | 'document' | 'affaire' | 'annee' | 'trimestre' | 'mois' | 'moisAnnee';

interface Valeur { cle: string; libelle: string }

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function valeurDate(date: string, grain: 'annee' | 'trimestre' | 'mois' | 'moisAnnee'): Valeur {
  const m = /^(\d{4})-(\d{2})/.exec(date || '');
  if (!m) return { cle: '~', libelle: '(sans date)' };
  const an = m[1];
  const mois = Number(m[2]);
  if (grain === 'annee') return { cle: an, libelle: an };
  // Le mois SANS l'année : croisé avec des colonnes « Année », il aligne N et N-1.
  if (grain === 'moisAnnee') return { cle: m[2], libelle: MOIS[mois - 1] };
  if (grain === 'trimestre') { const t = Math.ceil(mois / 3); return { cle: `${an}-T${t}`, libelle: `T${t} ${an}` }; }
  return { cle: `${an}-${m[2]}`, libelle: `${MOIS[mois - 1]} ${an}` };
}

const texte = (v: string, vide: string): Valeur => (v ? { cle: v.toLocaleLowerCase('fr'), libelle: v } : { cle: '~', libelle: vide });

export const DIMENSIONS: { id: DimensionId; label: string; chronologique?: boolean; valeur: (f: FaitVente) => Valeur }[] = [
  { id: 'client', label: 'Client', valeur: f => texte(f.client, '(sans client)') },
  { id: 'commercial', label: 'Commercial', valeur: f => texte(f.commercial === '—' ? '' : f.commercial, '(sans commercial)') },
  { id: 'statut', label: 'Statut', valeur: f => texte(f.statut, '(sans statut)') },
  { id: 'famille', label: 'Famille', valeur: f => texte(f.famille, '(sans catégorie)') },
  { id: 'categorie', label: 'Catégorie', valeur: f => texte(f.categorie, '(sans catégorie)') },
  { id: 'article', label: 'Article', valeur: f => ({ cle: f.articleCle, libelle: f.reference ? `[${f.reference}] ${f.article}` : f.article }) },
  { id: 'reference', label: 'Référence', valeur: f => texte(f.reference, '(sans référence)') },
  { id: 'document', label: 'Document', chronologique: true, valeur: f => ({ cle: `${f.date}|${f.numero}|${f.documentId}`, libelle: f.numero || '(sans numéro)' }) },
  { id: 'affaire', label: 'Réf. affaire', valeur: f => texte(f.affaire, '(sans réf. affaire)') },
  { id: 'annee', label: 'Année', chronologique: true, valeur: f => valeurDate(f.date, 'annee') },
  { id: 'trimestre', label: 'Trimestre', chronologique: true, valeur: f => valeurDate(f.date, 'trimestre') },
  { id: 'mois', label: 'Mois', chronologique: true, valeur: f => valeurDate(f.date, 'mois') },
  { id: 'moisAnnee', label: "Mois de l'année (N / N-1)", chronologique: true, valeur: f => valeurDate(f.date, 'moisAnnee') },
];

export const dimension = (id: DimensionId) => DIMENSIONS.find(d => d.id === id)!;

// ── Mesures ────────────────────────────────────────────────────────────────

export type MesureId = 'totalHT' | 'quantite' | 'documents' | 'lignes' | 'prixMoyen';

export const MESURES: { id: MesureId; label: string; decimales: number }[] = [
  { id: 'totalHT', label: 'Total HT', decimales: 2 },
  { id: 'quantite', label: 'Quantité', decimales: 2 },
  { id: 'documents', label: 'Nombre de documents', decimales: 0 },
  { id: 'lignes', label: 'Nombre de lignes', decimales: 0 },
  { id: 'prixMoyen', label: 'Prix moyen HT', decimales: 2 },
];

export interface Agregat { totalHT: number; quantite: number; lignes: number; documents: Set<string> }

const agregatVide = (): Agregat => ({ totalHT: 0, quantite: 0, lignes: 0, documents: new Set() });

function ajouter(a: Agregat, f: FaitVente) {
  a.totalHT += f.totalHT;
  a.quantite += f.quantite;
  a.lignes += 1;
  a.documents.add(f.documentId);
}

/** Valeur d'une mesure ; `null` = rien à afficher (case vide, prix moyen sans quantité). */
export function valeurMesure(a: Agregat | undefined, m: MesureId): number | null {
  if (!a || a.lignes === 0) return null;
  switch (m) {
    case 'totalHT': return Math.round(a.totalHT * 100) / 100;
    case 'quantite': return Math.round(a.quantite * 100) / 100;
    case 'documents': return a.documents.size;
    case 'lignes': return a.lignes;
    case 'prixMoyen': return a.quantite ? Math.round((a.totalHT / a.quantite) * 100) / 100 : null;
  }
}

export function formaterMesure(v: number | null, m: MesureId): string {
  if (v === null) return '';
  const dec = MESURES.find(x => x.id === m)!.decimales;
  return v.toLocaleString('fr-FR', { minimumFractionDigits: m === 'quantite' ? 0 : dec, maximumFractionDigits: dec });
}

// ── Pivot ──────────────────────────────────────────────────────────────────

export interface NoeudPivot {
  cle: string;
  libelle: string;
  /** Chemin unique depuis la racine (clés jointes) — sert à déplier / replier. */
  chemin: string;
  niveau: number;
  total: Agregat;
  parColonne: Map<string, Agregat>;
  enfants: NoeudPivot[];
}

/** Un en-tête de colonne : même arbre que les lignes, sans agrégat propre. */
export interface NoeudColonne {
  cle: string;
  libelle: string;
  /** Clé des cases `parColonne` des lignes (racine = '' = total). */
  chemin: string;
  niveau: number;
  enfants: NoeudColonne[];
}

export interface Pivot {
  racine: NoeudPivot;
  /** Arbre des colonnes ; sa racine est la colonne « Total ». */
  colRacine: NoeudColonne;
  /** Premier niveau de colonnes (raccourci). */
  colonnes: NoeudColonne[];
}

const SEP = '';

/** Clé de case d'une colonne, depuis les clés de ses niveaux (`cheminColonne('2026', '2026-03')`). */
export const cheminColonne = (...cles: string[]) => cles.map(c => SEP + c).join('');

function nouveauNoeud(v: Valeur, chemin: string, niveau: number): NoeudPivot {
  return { cle: v.cle, libelle: v.libelle, chemin, niveau, total: agregatVide(), parColonne: new Map(), enfants: [] };
}

function trierValeurs<T extends Valeur>(vs: T[], dim: DimensionId | null | undefined): T[] {
  const chrono = dim ? dimension(dim).chronologique : false;
  return [...vs].sort((a, b) => {
    // Les valeurs « (sans …) » (clé « ~ ») toujours en dernier.
    if (a.cle === '~' || b.cle === '~') return a.cle === b.cle ? 0 : a.cle === '~' ? 1 : -1;
    return chrono ? a.cle.localeCompare(b.cle) : a.libelle.localeCompare(b.libelle, 'fr', { sensitivity: 'base', numeric: true });
  });
}

/**
 * Regroupe les faits. Chaque fait alimente la racine et chacun de ses
 * ancêtres — total de la ligne et case de CHAQUE niveau de sa colonne —, si
 * bien que les sous-totaux, en ligne comme en colonne, sont des agrégats
 * vrais (un document compté une fois), jamais des sommes de cases.
 */
export function construirePivot(faits: FaitVente[], dimsLignes: DimensionId[], dimsColonnes: DimensionId[] | DimensionId | null): Pivot {
  const dimsCol = dimsColonnes === null ? [] : Array.isArray(dimsColonnes) ? dimsColonnes : [dimsColonnes];
  const racine = nouveauNoeud({ cle: '', libelle: 'Total' }, '', 0);
  const colRacine: NoeudColonne = { cle: '', libelle: 'Total', chemin: '', niveau: 0, enfants: [] };
  const index = new Map<string, NoeudPivot>();
  const indexCol = new Map<string, NoeudColonne>();
  const defs = dimsLignes.map(dimension);
  const defsCol = dimsCol.map(dimension);

  for (const f of faits) {
    // Chemins de la colonne du fait, à chaque niveau.
    const cheminsCol: string[] = [];
    let col = colRacine;
    for (let i = 0; i < defsCol.length; i++) {
      const v = defsCol[i].valeur(f);
      const chemin = col.chemin + SEP + v.cle;
      let enfant = indexCol.get(chemin);
      if (!enfant) {
        enfant = { cle: v.cle, libelle: v.libelle, chemin, niveau: i + 1, enfants: [] };
        indexCol.set(chemin, enfant);
        col.enfants.push(enfant);
      }
      col = enfant;
      cheminsCol.push(chemin);
    }
    let noeud = racine;
    const chaine = [racine];
    for (let i = 0; i < defs.length; i++) {
      const v = defs[i].valeur(f);
      const chemin = noeud.chemin + SEP + v.cle;
      let enfant = index.get(chemin);
      if (!enfant) {
        enfant = nouveauNoeud(v, chemin, i + 1);
        index.set(chemin, enfant);
        noeud.enfants.push(enfant);
      }
      noeud = enfant;
      chaine.push(noeud);
    }
    for (const n of chaine) {
      ajouter(n.total, f);
      for (const c of cheminsCol) {
        let a = n.parColonne.get(c);
        if (!a) { a = agregatVide(); n.parColonne.set(c, a); }
        ajouter(a, f);
      }
    }
  }

  const ordonner = (n: NoeudPivot) => {
    if (!n.enfants.length) return;
    n.enfants = trierValeurs(n.enfants, dimsLignes[n.niveau]);
    n.enfants.forEach(ordonner);
  };
  ordonner(racine);
  const ordonnerCol = (n: NoeudColonne) => {
    if (!n.enfants.length) return;
    n.enfants = trierValeurs(n.enfants, dimsCol[n.niveau]);
    n.enfants.forEach(ordonnerCol);
  };
  ordonnerCol(colRacine);
  return { racine, colRacine, colonnes: colRacine.enfants };
}

/**
 * Les colonnes affichées (feuilles visibles) : la racine est ouverte dès
 * qu'il y a un niveau de colonnes, un nœud fermé tient lieu de ses enfants.
 * Vide = pas de colonnes, seule la colonne Total.
 */
export function colonnesFeuilles(colRacine: NoeudColonne, ouverts: Set<string>): NoeudColonne[] {
  const out: NoeudColonne[] = [];
  const parcourir = (n: NoeudColonne) => {
    if (n.enfants.length && (n === colRacine || ouverts.has(n.chemin))) n.enfants.forEach(parcourir);
    else out.push(n);
  };
  if (colRacine.enfants.length) parcourir(colRacine);
  return out;
}

/** Tri des lignes par une mesure (dans une colonne, ou au total), à chaque niveau. */
export function trierParMesure(racine: NoeudPivot, mesure: MesureId, colonne: string | null, sens: 'asc' | 'desc'): NoeudPivot {
  const val = (n: NoeudPivot) => valeurMesure(colonne === null ? n.total : n.parColonne.get(colonne), mesure);
  const trier = (n: NoeudPivot): NoeudPivot => ({
    ...n,
    enfants: [...n.enfants]
      .sort((a, b) => {
        const va = val(a), vb = val(b);
        if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
        return sens === 'asc' ? va - vb : vb - va;
      })
      .map(trier),
  });
  return trier(racine);
}

/** Les nœuds visibles, dans l'ordre d'affichage : un nœud fermé cache ses enfants. */
export function lignesVisibles(racine: NoeudPivot, ouverts: Set<string>): NoeudPivot[] {
  const out: NoeudPivot[] = [];
  const parcourir = (n: NoeudPivot) => {
    out.push(n);
    if (n === racine || ouverts.has(n.chemin)) n.enfants.forEach(parcourir);
  };
  parcourir(racine);
  return out;
}

/** Tous les chemins dépliables (pour « Tout déplier »). */
export function cheminsDepliables(racine: NoeudPivot): string[] {
  const out: string[] = [];
  const parcourir = (n: NoeudPivot) => {
    if (n !== racine && n.enfants.length) out.push(n.chemin);
    n.enfants.forEach(parcourir);
  };
  parcourir(racine);
  return out;
}

// ── Faits depuis les documents ─────────────────────────────────────────────

export interface ContexteFaits {
  clientParId: (id: string) => Client | undefined;
  produitParId: (id?: string) => Produit | undefined;
  nomCommercial: (userId?: string) => string;
}

interface DocumentVente {
  id: string;
  numero: string;
  date: string;
  clientId: string;
  userId?: string;
  statut: string;
  lignes: LigneDevis[];
  fraisPortHT?: number;
  affaire?: string;
  signe: 1 | -1;
}

const estArticle = (l: LigneDevis) => l.type !== 'groupe' && l.type !== 'soustotal' && l.type !== 'texte';

function faitsDuDocument(d: DocumentVente, ctx: ContexteFaits): FaitVente[] {
  const c = ctx.clientParId(d.clientId);
  const commun = {
    documentId: d.id,
    numero: d.numero,
    date: d.date,
    client: c ? (c.societe || c.nom || '') : '',
    commercial: ctx.nomCommercial(d.userId),
    statut: d.statut,
    affaire: d.affaire || '',
  };
  const faits: FaitVente[] = [];
  for (const l of d.lignes || []) {
    if (!estArticle(l)) continue;
    const p = l.produitId ? ctx.produitParId(l.produitId) : undefined;
    const categorie = (p?.categorie || '').trim();
    const libre = (l.description || '').trim();
    faits.push({
      ...commun,
      articleCle: p ? p.id : `libre:${libre.toLocaleLowerCase('fr')}`,
      article: p ? designationProduit(p) : (libre || '(ligne sans libellé)'),
      reference: p?.reference || l.referenceOdoo || '',
      categorie,
      famille: categorie.split('/')[0].trim(),
      totalHT: d.signe * calculerTotalLigne(l).totalHT,
      quantite: d.signe * (Number(l.quantite) || 0),
    });
  }
  if (d.fraisPortHT) {
    faits.push({
      ...commun,
      articleCle: 'port', article: 'Frais de port', reference: '',
      categorie: 'Frais de port', famille: 'Frais de port',
      totalHT: d.signe * d.fraisPortHT, quantite: d.signe,
    });
  }
  return faits;
}

const LIBELLE_STATUT_DEVIS: Record<Devis['statut'], string> = {
  brouillon: 'Brouillon', envoyé: 'Envoyé', accepté: 'Accepté', refusé: 'Refusé',
  expiré: 'Expiré', système: 'Système', archivé: 'Archivé',
};

/** Devis : les modèles (« système ») ne sont pas des offres et restent dehors. */
export function faitsDevis(devis: Devis[], ctx: ContexteFaits): FaitVente[] {
  return devis
    .filter(d => d.statut !== 'système')
    .flatMap(d => faitsDuDocument({
      id: d.id, numero: d.numero, date: d.dateCreation, clientId: d.clientId, userId: d.userId,
      statut: LIBELLE_STATUT_DEVIS[d.statut] || d.statut, lignes: d.lignes, fraisPortHT: d.fraisPortHT,
      affaire: d.referenceAffaire, signe: 1,
    }, ctx));
}

export function faitsCommandes(commandes: CommandeClient[], ctx: ContexteFaits): FaitVente[] {
  return commandes.flatMap(c => faitsDuDocument({
    id: c.id, numero: c.numero, date: c.dateCreation, clientId: c.clientId, userId: c.userId,
    statut: STATUTS_COMMANDE_CLIENT[c.statut]?.label || c.statut, lignes: c.lignes, fraisPortHT: c.fraisPortHT,
    affaire: c.referenceAffaire, signe: 1,
  }, ctx));
}

/** Factures : sans les proformas ; un avoir au signe −1. */
export function faitsFactures(factures: FactureClient[], ctx: ContexteFaits): FaitVente[] {
  return factures
    .filter(f => !f.estProforma)
    .flatMap(f => faitsDuDocument({
      id: f.id,
      numero: f.numero || (f.typeDocument === 'avoir' ? 'Avoir brouillon' : 'Brouillon'),
      date: f.dateCreation, clientId: f.clientId, userId: f.userId,
      statut: STATUTS_FACTURE_CLIENT[f.statut]?.label || f.statut, lignes: f.lignes, fraisPortHT: f.fraisPortHT,
      affaire: f.referenceAffaire, signe: f.typeDocument === 'avoir' ? -1 : 1,
    }, ctx));
}

/**
 * Lignes de la copie Odoo (`ventes_odoo`). Déjà signées (avoir négatif) et
 * déjà réduites au périmètre lu (lignes Flooring seules). Le client est la
 * fiche MonCRM rattachée, à défaut le nom Odoo.
 */
export function faitsVentesOdoo(lignes: VenteOdoo[], source: 'facturesOdoo' | 'commandesOdoo', ctx: Pick<ContexteFaits, 'clientParId'>): FaitVente[] {
  const voulu = source === 'facturesOdoo' ? 'facture' : 'commande';
  return lignes.filter(l => l.source === voulu).map(l => {
    const c = l.client_id ? ctx.clientParId(l.client_id) : undefined;
    const categorie = (l.categorie || '').trim();
    const designation = (l.designation || '').trim();
    return {
      documentId: `odoo:${l.source}:${l.odoo_document_id}`,
      numero: l.numero,
      date: l.date || '',
      client: c ? (c.societe || c.nom || '') : (l.partenaire_nom || ''),
      commercial: l.commercial || '',
      statut: l.type_document === 'avoir' ? `Avoir — ${l.statut || ''}`.replace(/ — $/, '') : (l.statut || ''),
      articleCle: `odoo:${(l.reference || designation).toLocaleLowerCase('fr')}`,
      article: designation || '(ligne sans libellé)',
      reference: l.reference || '',
      categorie,
      famille: categorie.split('/')[0].trim(),
      affaire: l.reference_affaire || '',
      totalHT: Number(l.total_ht) || 0,
      quantite: Number(l.quantite) || 0,
    };
  });
}
