/**
 * Un devis fournisseur rapproché d'Odoo : l'article retrouvé, ou créé.
 *
 * Client de la fonction Edge `odoo-achat`. L'analyse d'un devis fournisseur
 * rapprochait déjà chaque ligne d'un article MonCRM, et pouvait en créer un ;
 * l'article créé n'existait pas chez Odoo, et le devis client suivant partait
 * en négoce. Ici, chaque ligne est aussi cherchée chez Odoo, et un article
 * créé dans MonCRM l'est aussi chez Odoo — sous la MÊME référence, que MonCRM
 * inscrit dans `referenceOdoo`.
 *
 * ⚠️ AUCUN PRIX NE PART CHEZ ODOO (règle du 15/10/2026). Les prix d'achat et
 * de vente vivent dans MonCRM, où le changement le plus récent l'emporte
 * (`prixAchatMaj`, `prixVenteMaj`) ; on ne touche pas aux prix d'Odoo.
 *
 * Seul ce qui se lit par un CODE est retenu d'office : référence de l'article
 * MonCRM, code du fournisseur déjà enregistré chez lui. Une ressemblance de
 * mots reste une proposition, à cliquer.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Fournisseur, Produit } from './store';

export interface ArticleOdooAchat {
  /** product.product */
  id: number;
  tmplId: number;
  reference: string;
  designation: string;
  cout: number;
  prixFournisseur?: number;
  codeFournisseur?: string;
}

export interface RechercheAchatOdoo {
  partenaire: { id: number; nom: string } | null;
  ambigus: { id: number; nom: string; ville: string }[];
  lignes: Record<number, {
    exact?: ArticleOdooAchat & { par: string };
    propositions: ArticleOdooAchat[];
  }>;
}

export interface ArticleCreeOdoo {
  indice: number;
  productId?: number;
  reference?: string;
  designation?: string;
  /** « repris » : la référence existait déjà chez Odoo, rien n'a été dédoublé. */
  article?: 'cree' | 'repris';
  /** Faux : la catégorie demandée n'existe pas chez Odoo, l'article est parti sans. */
  categorieTrouvee?: boolean;
  erreur?: string;
}

/**
 * L'identifiant Odoo d'un fournisseur repris du fichier Odoo.
 *
 * `importerFournisseurOdoo` l'écrit dans les notes (« partenaire #1234 ») :
 * la fiche fournisseur n'a pas de colonne pour lui. Sans identifiant, Odoo le
 * retrouve par son nom.
 */
export function odooIdDuFournisseur(f?: Pick<Fournisseur, 'notes'> | null): number | undefined {
  const m = /partenaire\s*#(\d+)/i.exec(f?.notes || '');
  return m ? Number(m[1]) : undefined;
}

/** Les codes sous lesquels un article MonCRM peut être connu chez Odoo. */
export function codesOdooDe(p?: Pick<Produit, 'reference' | 'referenceOdoo'> | null): string[] {
  return [...new Set([p?.referenceOdoo, p?.reference]
    .map(c => String(c || '').trim())
    .filter(Boolean))];
}

/**
 * La référence sous laquelle créer l'article chez Odoo : celle d'Odoo déjà
 * notée, sinon celle de MonCRM — les deux fiches doivent porter la même —,
 * sinon le code du fournisseur.
 */
export function referenceOdooProposee(
  article: Pick<Produit, 'reference' | 'referenceOdoo'> | undefined,
  codeFournisseur?: string,
): string {
  return codesOdooDe(article)[0] || String(codeFournisseur || '').trim();
}

export async function chercherArticlesOdooAchat(args: {
  fournisseur: { odooId?: number; nom?: string };
  lignes: { indice: number; codeFournisseur?: string; designation?: string; codes: string[] }[];
  signal?: AbortSignal;
}): Promise<RechercheAchatOdoo> {
  const { data, error } = await supabase.functions.invoke('odoo-achat', {
    body: { mode: 'chercher', fournisseur: args.fournisseur, lignes: args.lignes },
    signal: args.signal,
  });
  if (error) throw new Error(error.message || 'Odoo injoignable');
  if (data?.erreur) throw new Error(data.erreur);
  return {
    partenaire: data?.partenaire ?? null,
    ambigus: data?.ambigus ?? [],
    lignes: data?.lignes ?? {},
  };
}

/** Crée les articles chez Odoo — référence, désignation, catégorie ; jamais de prix. */
export async function creerArticlesOdoo(
  articles: { indice: number; reference: string; designation: string; categorie?: string }[],
): Promise<ArticleCreeOdoo[]> {
  const { data, error } = await supabase.functions.invoke('odoo-achat', {
    body: { mode: 'creer', articles },
  });
  if (error) throw new Error(error.message || 'Odoo injoignable');
  if (data?.erreur) throw new Error(data.erreur);
  return (data?.lignes ?? []) as ArticleCreeOdoo[];
}
