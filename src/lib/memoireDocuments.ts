import { supabase } from '@/integrations/supabase/client';
import type { TypeDocument } from './analyseDocument';

/**
 * Mémoire de l'analyseur : QUI ÉMET le document → son sens et son fournisseur.
 *
 * ⚠️ **UNE CORRECTION NE SE FAIT QU'UNE FOIS** (demande du 15/10/2026). Le
 * devis 73974 de TRAFIC TECHNOLOGIE SYSTEME, adressé à « ISOSIGN SAS »,
 * sortait en devis CLIENT avec ISOSIGN pour partenaire ; corrigé à la main
 * en devis fournisseur, le suivant du même émetteur repartait sur la même
 * erreur. Un devis fournisseur n'est pas un devis ISOSIGN : l'analyse doit
 * l'apprendre de la première correction.
 *
 * L'émetteur se reconnaît à des SIGNATURES lues sans IA dans le texte
 * (`signaturesEmetteur`) : son SIREN (écrit seul, dans le SIRET, le numéro
 * de TVA ou le RCS) et le domaine de son site ou de ses adresses — jamais
 * ceux d'ISOSIGN ni d'une messagerie publique. Chaque signature retient :
 *   - le SENS du document (`fournisseur` : il nous vend ; `client` : il nous
 *     achète). Pas le type exact : un même fournisseur envoie devis, BL et
 *     factures. Le sens suffit à remettre un « devis client » à l'endroit ;
 *   - le fournisseur MonCRM retenu, et le nom de l'émetteur.
 *
 * ⚠️ **UNE SIGNATURE QUI DIT DEUX CHOSES NE DIT PLUS RIEN** (`conflit`). Le
 * numéro de TVA d'ISOSIGN figure dans le bloc client de certains
 * fournisseurs : il serait retenu pour l'un puis pour l'autre. Dès qu'une
 * signature est vue pour deux fournisseurs ou deux sens, elle est écartée
 * du rappel — et au rappel, des signatures qui se contredisent ne
 * désignent rien (`souvenirParSignatures`). On ne devine pas.
 *
 * Table commune `memoire_documents` (RLS « tous authentifiés »), migration
 * `20261015120000`. Absente, l'analyse continue sans mémoire.
 */

export type SensDocument = 'fournisseur' | 'client';

export interface MemoireDocument {
  /** La signature : `siren:398379214`, `site:ttsys.eu`. Unique. */
  cle: string;
  sens: SensDocument;
  /** Le dernier type retenu à la main pour cet émetteur. */
  typeDocument?: TypeDocument;
  nom?: string;
  fournisseurId?: string;
  nb: number;
  conflit: boolean;
}

/* ── Fonctions pures ──────────────────────────────────────────────────────── */

/** Le sens d'un type : qui, de l'émetteur ou d'ISOSIGN, vend ? */
export function sensDuType(t?: TypeDocument): SensDocument | undefined {
  switch (t) {
    case 'devis_fournisseur': case 'facture_fournisseur':
    case 'commande_fournisseur': case 'bon_livraison':
      return 'fournisseur';
    case 'devis_client': case 'facture_client': case 'commande_client': case 'demande_devis':
      return 'client';
    default:
      return undefined;
  }
}

/**
 * Le type remis dans le sens que la mémoire connaît. Un « devis client »
 * d'un émetteur connu comme fournisseur est un devis fournisseur ; une
 * « facture client », une facture fournisseur. Le reste ne bouge pas.
 */
export function typeDansLeSens(t: TypeDocument, sens: SensDocument): TypeDocument {
  if (sens === 'fournisseur') {
    if (t === 'devis_client' || t === 'demande_devis') return 'devis_fournisseur';
    if (t === 'facture_client') return 'facture_fournisseur';
    if (t === 'commande_client') return 'commande_fournisseur';
  } else {
    if (t === 'devis_fournisseur') return 'devis_client';
    if (t === 'facture_fournisseur') return 'facture_client';
  }
  return t;
}

/** Messageries publiques : leur domaine ne désigne personne. */
const DOMAINES_PUBLICS = new Set([
  'gmail.com', 'outlook.com', 'outlook.fr', 'hotmail.com', 'hotmail.fr', 'live.fr', 'live.com',
  'yahoo.com', 'yahoo.fr', 'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'laposte.net',
  'icloud.com', 'neuf.fr', 'bbox.fr', 'aol.com', 'gmx.fr', 'protonmail.com',
]);

const chiffres = (s: string) => s.replace(/\D/g, '');

/**
 * Les signatures de l'émetteur lues dans le texte du document : SIREN (seul,
 * dans un SIRET, un n° de TVA FR ou un RCS) et domaines (site, adresses) —
 * jamais ISOSIGN ni une messagerie publique.
 */
export function signaturesEmetteur(texte: string): string[] {
  const t = String(texte || '');
  const sirens = new Set<string>();
  for (const m of t.matchAll(/SIRET\s*(?:N°|:)?\s*((?:\d[\s.]?){14})/gi)) {
    const d = chiffres(m[1]);
    if (d.length >= 14) sirens.add(d.slice(0, 9));
  }
  for (const m of t.matchAll(/SIREN\s*(?:N°|:)?\s*((?:\d[\s.]?){9})/gi)) sirens.add(chiffres(m[1]).slice(0, 9));
  for (const m of t.matchAll(/\bFR\s?[0-9A-Z]{2}\s?((?:\d\s?){9})(?!\d)/g)) sirens.add(chiffres(m[1]));
  for (const m of t.matchAll(/\bRCS\s+[A-Za-zÀ-ÿ' -]{2,30}?\s(?:[AB]\s)?((?:\d\s?){9})(?!\d)/gi)) sirens.add(chiffres(m[1]));

  const domaines = new Set<string>();
  for (const m of t.matchAll(/(?:\bwww\.|@)([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) {
    const d = m[1].toLowerCase().replace(/\.+$/, '');
    if (/isosign/.test(d) || DOMAINES_PUBLICS.has(d)) continue;
    domaines.add(d);
  }
  return [
    ...[...sirens].filter(s => s.length === 9).map(s => `siren:${s}`),
    ...[...domaines].map(d => `site:${d}`),
  ];
}

/**
 * Ce que la mémoire dit de l'émetteur, d'après ses signatures. Rien si
 * aucune n'est connue, si toutes sont en conflit, ou si elles se
 * contredisent (sens ou fournisseur différents).
 */
export function souvenirParSignatures(
  memoires: MemoireDocument[],
  signatures: string[],
): MemoireDocument | undefined {
  const vues = signatures
    .map(s => memoires.find(m => m.cle === s))
    .filter((m): m is MemoireDocument => !!m && !m.conflit);
  if (!vues.length) return undefined;
  const sens = new Set(vues.map(m => m.sens));
  const fournisseurs = new Set(vues.map(m => m.fournisseurId).filter(Boolean));
  if (sens.size > 1 || fournisseurs.size > 1) return undefined;
  /* Le souvenir le plus étayé porte le nom et le fournisseur. */
  const meilleur = [...vues].sort((a, b) =>
    Number(!!b.fournisseurId) - Number(!!a.fournisseurId) || b.nb - a.nb)[0];
  return meilleur;
}

/** Mots qui font un titre ou une rubrique, jamais un nom de société. */
const PAS_UN_NOM = /isosign|\bdevis\b|facture|commande|adresse|livraison|page\s*\d|\bdate\b|client|t[ée]l\b|t[ée]l[ée]phone|fax|e-?mail|contact|d[ée]partement|bon de|offre|r[ée]f[ée]rence|\btva\b|siret|capital/i;
/* Une ligne d'adresse en capitales (« ZA DU MONAY ») a l'allure d'un nom. */
const ADRESSE = /\b(ZA|ZI|ZAC|ZAE|PA|RUE|AVENUE|AV|BD|BOULEVARD|CHEMIN|ROUTE|ALL[ÉE]E|IMPASSE|PLACE|QUAI|BP|CS|CEDEX|FRANCE|LIEU[- ]DIT|PARC|SITE)\b/i;

/**
 * Le nom de l'émetteur lu dans l'EN-TÊTE, sans IA — repli quand l'extraction
 * rend ISOSIGN (le destinataire) ou rien. On cherche, au-dessus de la ligne
 * qui porte le capital, le SIRET ou le RCS, une ligne qui a l'allure d'une
 * raison sociale ; à défaut, la première de l'en-tête.
 */
export function emetteurDuTexte(texte: string): string | undefined {
  const lignes = String(texte || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const estNom = (l: string) => {
    if (l.length < 4 || l.length > 60 || PAS_UN_NOM.test(l) || ADRESSE.test(l) || /@|www\.|https?:/i.test(l)) return false;
    if ((l.match(/\d/g) || []).length > 2) return false;
    const lettres = l.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (lettres.length < 4) return false;
    const majuscules = l.replace(/[^A-ZÀ-Þ]/g, '').length;
    return majuscules / lettres.length >= 0.6;
  };
  const legal = lignes.findIndex(l => /capital|SIRET|SIREN|\bRCS\b|N°\s*TVA/i.test(l));
  if (legal > 0) {
    for (let i = legal - 1; i >= Math.max(0, legal - 6); i--) if (estNom(lignes[i])) return lignes[i];
  }
  return lignes.slice(0, 8).find(estNom);
}

/* ── Lecture et écriture ──────────────────────────────────────────────────── */

interface LigneDb {
  cle: string;
  sens: string;
  type_document: string | null;
  nom: string | null;
  fournisseur_id: string | null;
  nb: number | null;
  conflit: boolean | null;
}

const dbToMemoire = (r: LigneDb): MemoireDocument => ({
  cle: r.cle,
  sens: r.sens === 'client' ? 'client' : 'fournisseur',
  typeDocument: (r.type_document || undefined) as TypeDocument | undefined,
  nom: r.nom || undefined,
  fournisseurId: r.fournisseur_id || undefined,
  nb: r.nb || 1,
  conflit: !!r.conflit,
});

let tableAbsente = false;

/** Les souvenirs de ces signatures — une requête, rien si la table manque. */
export async function souvenirDocument(signatures: string[]): Promise<MemoireDocument | undefined> {
  if (!signatures.length || tableAbsente) return undefined;
  const { data, error } = await supabase
    .from('memoire_documents' as never)
    .select('*')
    .in('cle', signatures);
  if (error) {
    console.error('[memoire_documents]', error.message);
    tableAbsente = /does not exist|could not find|schema cache/i.test(error.message);
    return undefined;
  }
  return souvenirParSignatures(((data || []) as unknown as LigneDb[]).map(dbToMemoire), signatures);
}

/**
 * Retient l'émetteur sous chacune de ses signatures. Une signature déjà vue
 * pour un autre sens ou un autre fournisseur passe en conflit, et n'est plus
 * rappelée. Rend l'erreur à afficher, ou `null`.
 */
export async function retenirDocument(
  signatures: string[],
  souvenir: { sens: SensDocument; typeDocument?: TypeDocument; nom?: string; fournisseurId?: string },
): Promise<string | null> {
  if (!signatures.length) return null;
  if (tableAbsente) return 'La table memoire_documents manque : appliquer la migration 20261015120000.';
  const { data, error } = await supabase
    .from('memoire_documents' as never)
    .select('*')
    .in('cle', signatures);
  if (error) {
    tableAbsente = /does not exist|could not find|schema cache/i.test(error.message);
    return error.message;
  }
  const avant = new Map(((data || []) as unknown as LigneDb[]).map(r => [r.cle, dbToMemoire(r)]));
  const maintenant = new Date().toISOString();
  const lignes = signatures.map(cle => {
    const a = avant.get(cle);
    const contredit = !!a && (a.sens !== souvenir.sens
      || (!!a.fournisseurId && !!souvenir.fournisseurId && a.fournisseurId !== souvenir.fournisseurId));
    return {
      cle,
      sens: souvenir.sens,
      type_document: souvenir.typeDocument ?? a?.typeDocument ?? null,
      nom: souvenir.nom || a?.nom || null,
      fournisseur_id: souvenir.fournisseurId || a?.fournisseurId || null,
      nb: a && !contredit ? a.nb + 1 : 1,
      conflit: !!a?.conflit || contredit,
      updated_at: maintenant,
    };
  });
  const { error: e2 } = await supabase
    .from('memoire_documents' as never)
    .upsert(lignes as never, { onConflict: 'cle' });
  return e2 ? e2.message : null;
}
