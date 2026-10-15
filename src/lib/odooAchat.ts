/**
 * Un devis fournisseur rapproché d'Odoo — EN LECTURE SEULE.
 *
 * Client de la fonction Edge `odoo-achat`. Chaque ligne du devis est
 * cherchée chez Odoo ; l'article Odoo retenu ne fait que porter sa référence
 * sur la fiche MonCRM (`referenceOdoo`).
 *
 * ⚠️ **RIEN N'EST ÉCRIT DANS ODOO** (règle du 15/10/2026) : ni article, ni
 * prix. Un article absent se crée dans MonCRM, avec le code et l'intitulé
 * saisis à l'écran. Les prix vivent dans MonCRM, où le plus récent l'emporte.
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
