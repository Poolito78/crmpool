import { supabase } from '@/integrations/supabase/client';

/**
 * Relit chez Odoo le stock des seuls articles qu'on a sous les yeux.
 *
 * Un stock recopié il y a trois semaines ne vaut pas mieux que pas de stock
 * du tout : au moment de promettre une date, c'est le chiffre du jour qu'il
 * faut. Mais relire les 22 637 articles du catalogue pour en afficher un
 * seul serait absurde — `qty_available` est un champ CALCULÉ, qu'Odoo
 * reconstruit en parcourant les mouvements de stock.
 *
 * D'où cette lecture ciblée : la fiche qu'on ouvre, les lignes du devis
 * qu'on saisit, et rien d'autre. Une poignée de références par appel.
 *
 * L'appel est volontairement SILENCIEUX en cas d'échec : Odoo indisponible
 * ne doit pas empêcher d'ouvrir une fiche article. On garde alors la
 * dernière valeur connue, avec sa date, qui dit elle-même son âge.
 */
export interface StockOdoo {
  dispo: number;
  prevu: number;
}

export async function rafraichirStockOdoo(
  references: string[],
): Promise<Record<string, StockOdoo>> {
  const refs = [...new Set(
    references.map(r => String(r || '').trim()).filter(Boolean),
  )].slice(0, 60);
  if (!refs.length) return {};
  try {
    const { data, error } = await supabase.functions.invoke('odoo-stock-sync', {
      body: { references: refs },
    });
    if (error || data?.erreur) return {};
    return (data?.stocks || {}) as Record<string, StockOdoo>;
  } catch {
    return {};
  }
}
