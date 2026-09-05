import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { LienProduit } from './liensProduit';

/**
 * Documents attachés à une CATÉGORIE d'articles.
 *
 * LE PROBLÈME : les prefabriqués thermoplastiques partagent la même fiche
 * produit, le même masque d'homologation, les mêmes photos de pose. Ces
 * documents se renseignaient article par article — donc jamais, parce que
 * personne ne recopie une adresse SharePoint vingt-neuf fois, et parce qu'un
 * changement de fiche obligerait à repasser sur les vingt-neuf.
 *
 * LA CATÉGORIE EST UN CHEMIN, ET C'EST CE QUI PORTE L'HÉRITAGE.
 * `produit.categorie` s'écrit « ISOMARK / H2 / PREFA THERMO ». Un document
 * posé sur « ISOMARK / H2 » s'affiche donc aussi sur les articles de
 * « ISOMARK / H2 / PREFA THERMO ». Sans cet héritage la fonction serait
 * inutilisable telle quelle : 29 articles thermoplastiques sont rangés dans
 * « ISOMARK / H2 », et 2 seulement dans « ISOMARK / H2 / PREFA THERMO » —
 * attacher au plus précis n'en toucherait que deux.
 *
 * QUE DES LIENS, AUCUN FICHIER. Le forfait Supabase est le gratuit (1 Go, dont
 * ~103 Mo déjà pris). Un PDF d'homologation pèse 2 à 5 Mo et ne se compresse
 * pas comme une photo. Ces documents vivent là où ils sont déjà publiés —
 * SharePoint, site fournisseur — et on n'en garde que l'adresse.
 */

export type GenreDocument = 'fiche' | 'homologation' | 'photo' | 'autre';

export const LIBELLE_GENRE: Record<GenreDocument, string> = {
  fiche: 'Fiche technique',
  homologation: 'Homologation',
  photo: 'Photo',
  autre: 'Document',
};

export const GENRES: GenreDocument[] = ['fiche', 'homologation', 'photo', 'autre'];

export interface DocumentCategorie {
  id: string;
  /** La catégorie EXACTE d'attache, telle qu'elle est écrite sur les articles. */
  categorie: string;
  libelle: string;
  url: string;
  genre: GenreDocument;
  ordre: number;
  createdAt: string;
}

/** Un document tel qu'il s'affiche sur un article, avec sa provenance. */
export interface DocumentApplicable extends DocumentCategorie {
  /** Vrai quand il vient d'une catégorie PARENTE, pas de celle de l'article. */
  herite: boolean;
}

export const SEPARATEUR = '/';

/* ── Fonctions pures ──────────────────────────────────────────────────────── */

/**
 * La catégorie, normalisée pour être comparable.
 *
 * Les chemins sont saisis à la main et importés d'Odoo : « ISOMARK/H2 »,
 * « ISOMARK / H2  » et « ISOMARK /H2 » désignent la même chose. Sans cette
 * mise au net, un document posé sur l'une resterait invisible depuis l'autre —
 * et l'utilisateur n'aurait aucun moyen de comprendre pourquoi.
 */
export function normaliserCategorie(categorie: string | undefined | null): string {
  return (categorie || '')
    .split(SEPARATEUR)
    .map(s => s.trim())
    .filter(Boolean)
    .join(` ${SEPARATEUR} `);
}

/**
 * La chaîne des catégories dont un article hérite, DU PLUS PRÉCIS AU PLUS
 * GÉNÉRAL.
 *
 * « ISOMARK / H2 / PREFA THERMO » donne, dans cet ordre :
 * la catégorie elle-même, « ISOMARK / H2 », puis « ISOMARK ».
 *
 * L'ordre n'est pas cosmétique : il décide de ce qu'on lit en premier dans la
 * fiche, et il tranche les doublons (voir `documentsPourCategorie`).
 */
export function chaineCategories(categorie: string | undefined | null): string[] {
  const segments = normaliserCategorie(categorie).split(` ${SEPARATEUR} `).filter(Boolean);
  const out: string[] = [];
  for (let n = segments.length; n > 0; n--) {
    out.push(segments.slice(0, n).join(` ${SEPARATEUR} `));
  }
  return out;
}

/**
 * Les documents qui s'appliquent à un article, du plus précis au plus général.
 *
 * LE PLUS PRÉCIS GAGNE SUR LE DOUBLON. Si la même adresse est attachée à
 * « ISOMARK » et à « ISOMARK / H2 », l'article de H2 ne la voit qu'une fois,
 * portée par H2 : c'est l'attache la plus proche qui décrit le mieux le rôle du
 * document, et deux fois la même ligne dans une liste de liens ferait douter de
 * la justesse du reste.
 */
export function documentsPourCategorie(
  documents: DocumentCategorie[],
  categorie: string | undefined | null,
): DocumentApplicable[] {
  const chaine = chaineCategories(categorie);
  if (!chaine.length) return [];
  const parNiveau = new Map<string, DocumentCategorie[]>();
  for (const d of documents) {
    const clef = normaliserCategorie(d.categorie);
    if (!chaine.includes(clef)) continue;
    const liste = parNiveau.get(clef);
    if (liste) liste.push(d); else parNiveau.set(clef, [d]);
  }
  const vues = new Set<string>();
  const out: DocumentApplicable[] = [];
  chaine.forEach((niveau, rang) => {
    const liste = (parNiveau.get(niveau) || [])
      .slice()
      .sort((a, b) => a.ordre - b.ordre || a.libelle.localeCompare(b.libelle, 'fr'));
    for (const d of liste) {
      const adresse = d.url.trim().toLowerCase();
      if (vues.has(adresse)) continue;
      vues.add(adresse);
      out.push({ ...d, herite: rang > 0 });
    }
  });
  return out;
}

/**
 * Combien d'articles un document posé sur cette catégorie va toucher.
 *
 * À AFFICHER AVANT D'ATTACHER, et ce n'est pas un détail : « ISOMARK / H2 »
 * compte 780 articles. On ne pose pas un masque d'homologation sur 780 fiches
 * sans le savoir.
 */
export function articlesConcernes(
  produits: { categorie?: string }[],
  categorie: string | undefined | null,
): number {
  const cible = normaliserCategorie(categorie);
  if (!cible) return 0;
  const prefixe = `${cible} ${SEPARATEUR} `;
  return produits.filter(p => {
    const c = normaliserCategorie(p.categorie);
    return c === cible || c.startsWith(prefixe);
  }).length;
}

/**
 * Les documents de famille des articles d'un devis, en liens collables.
 *
 * ILS NE SORTENT PAS DE `liensDuProduit` ET C'EST VOULU : un document de
 * famille n'appartient à aucun article, il appartient à la catégorie. Deux
 * articles de la même famille ne doivent donc en produire qu'un seul lien —
 * sans quoi un devis de six panneaux carrés proposerait six fois le même
 * masque d'homologation.
 *
 * Ils arrivent DÉCOCHÉS dans le dialogue d'envoi : une homologation ne
 * s'invite pas d'elle-même dans tous les devis, elle se joint quand elle est
 * demandée.
 */
export function liensDocumentsCategorie(
  articles: { id: string; categorie?: string }[],
  documents: DocumentCategorie[],
): LienProduit[] {
  const vus = new Set<string>();
  const out: LienProduit[] = [];
  for (const a of articles) {
    for (const d of documentsPourCategorie(documents, a.categorie)) {
      if (vus.has(d.id)) continue;
      vus.add(d.id);
      out.push({
        id: `cat:${d.id}`,
        produitId: a.id,
        cible: 'categorie',
        label: d.libelle,
        url: d.url,
      });
    }
  }
  return out;
}

/* ── Mapping base ↔ application ──────────────────────────────────────────── */

type Row = Record<string, unknown>;

/** Une ligne `categorie_documents` telle que l'application la manipule. */
export function dbToDocumentCategorie(r: Row): DocumentCategorie {
  const genre = String(r.genre || 'autre');
  return {
    id: String(r.id),
    categorie: String(r.categorie),
    libelle: String(r.libelle),
    url: String(r.url),
    genre: (GENRES as string[]).includes(genre) ? (genre as GenreDocument) : 'autre',
    ordre: Number(r.ordre) || 0,
    createdAt: String(r.created_at),
  };
}

/* ── Hook ────────────────────────────────────────────────────────────────── */

/**
 * Les documents de catégorie, tous chargés d'un bloc.
 *
 * La table compte une ligne par document RÉELLEMENT attaché — quelques
 * dizaines, pas une par article. C'est tout l'intérêt de la fonction : une
 * lecture à la demande par article n'aurait rien à économiser.
 */
export function useCategorieDocuments() {
  const [documents, setDocuments] = useState<DocumentCategorie[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const { data, error } = await supabase
      .from('categorie_documents').select('*')
      .order('categorie').order('ordre');
    if (error) {
      console.error('[categorie_documents]', error.message);
      setErreur(error.message);
      setDocuments([]);
    } else {
      setDocuments((data || []).map(dbToDocumentCategorie));
    }
    setChargement(false);
  }, []);

  useEffect(() => { void recharger(); }, [recharger]);

  const ajouter = useCallback(async (
    doc: { categorie: string; libelle: string; url: string; genre: GenreDocument },
  ): Promise<string | null> => {
    const categorie = normaliserCategorie(doc.categorie);
    if (!categorie) return "Cet article n'a pas de catégorie : rangez-le d'abord.";
    const libelle = doc.libelle.trim();
    const url = doc.url.trim();
    if (!libelle) return 'Donnez un texte au lien — c’est ce que le lecteur verra.';
    if (!url) return "L'adresse du document manque.";
    const { data, error } = await supabase
      .from('categorie_documents')
      .insert({ categorie, libelle, url, genre: doc.genre } as never)
      .select().single();
    if (error) return error.message;
    setDocuments(prev => [...prev, dbToDocumentCategorie(data as Row)]);
    return null;
  }, []);

  const modifier = useCallback(async (
    id: string, champs: Partial<Pick<DocumentCategorie, 'libelle' | 'url' | 'genre' | 'ordre'>>,
  ): Promise<string | null> => {
    const { error } = await supabase
      .from('categorie_documents').update(champs as never).eq('id', id);
    if (error) return error.message;
    setDocuments(prev => prev.map(d => (d.id === id ? { ...d, ...champs } : d)));
    return null;
  }, []);

  const supprimer = useCallback(async (id: string): Promise<string | null> => {
    const { error } = await supabase.from('categorie_documents').delete().eq('id', id);
    if (error) return error.message;
    setDocuments(prev => prev.filter(d => d.id !== id));
    return null;
  }, []);

  return { documents, chargement, erreur, recharger, ajouter, modifier, supprimer };
}
