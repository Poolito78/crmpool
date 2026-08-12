import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export type EntiteType =
  | 'devis'
  | 'commande_fournisseur'
  | 'commande_client'
  | 'client'
  | 'produit'
  | 'fournisseur'
  | 'concurrent'
  | 'concurrent_produit'
  | 'concurrent_note';

export type ActionType =
  | 'creation'
  | 'modification'
  | 'suppression'
  | 'envoi_email'
  | 'statut'
  | 'reception'
  | 'prise_stock';

export interface HistoriqueEntry {
  id: string;
  entiteType: EntiteType;
  entiteId: string;
  entiteNumero: string;
  action: ActionType;
  details?: Record<string, unknown>;
  date: string;
}

/** Fire-and-forget — ne bloque jamais l'UI */
export function logHistorique(
  entry: Omit<HistoriqueEntry, 'id' | 'date'>
): void {
  supabase.auth.getUser().then(({ data }) => {
    const userId = data?.user?.id;
    if (!userId) return;
    supabase.from('historique').insert({
      user_id: userId,
      entite_type: entry.entiteType,
      entite_id: entry.entiteId,
      entite_numero: entry.entiteNumero,
      action: entry.action,
      // La colonne est un jsonb : tout objet sérialisable convient. Le typage
      // généré ne sait pas qu'un Record<string, unknown> en est un.
      details: (entry.details ?? null) as Json,
    }).then(({ error }) => {
      if (error) console.warn('[historique]', error.message);
    });
  });
}

export async function fetchHistorique(opts?: {
  entiteType?: EntiteType;
  entiteId?: string;
  limit?: number;
}): Promise<HistoriqueEntry[]> {
  let query = supabase
    .from('historique')
    .select('*')
    .order('date', { ascending: false })
    .limit(opts?.limit ?? 300);

  if (opts?.entiteType) query = query.eq('entite_type', opts.entiteType);
  if (opts?.entiteId) query = query.eq('entite_id', opts.entiteId);

  const { data, error } = await query;
  if (error) { console.warn('[historique fetch]', error.message); return []; }

  return (data ?? []).map(r => ({
    id: r.id,
    entiteType: r.entite_type as EntiteType,
    entiteId: r.entite_id,
    entiteNumero: r.entite_numero ?? '',
    action: r.action as ActionType,
    // jsonb peut contenir un nombre, une chaîne ou un tableau ; l'historique
    // n'y écrit que des objets. On écarte le reste plutôt que de le forcer.
    details: r.details && typeof r.details === 'object' && !Array.isArray(r.details)
      ? (r.details as Record<string, unknown>)
      : undefined,
    date: r.date,
  }));
}
