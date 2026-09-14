import { supabase } from '@/integrations/supabase/client';
import { indexerGrille, type GrilleTarif, type NiveauTarif, type RangGrille } from '@/lib/grilleTarif';

/**
 * Charge la grille d'un niveau depuis la copie locale `grille_contrat`.
 *
 * Neuf mille lignes par niveau, lues par tranches de mille : la fin se
 * reconnaît à une tranche COURTE, jamais à un comptage (voir `lireTout` dans
 * `store.ts` — le `count: 'exact'` est ce qui faisait tomber le catalogue).
 *
 * Une seule lecture par niveau pour toute la session : la promesse est
 * gardée, deux devis ouverts l'un après l'autre ne relisent rien. Un échec
 * n'est PAS gardé, pour qu'une nouvelle tentative reste possible.
 *
 * Grille vide (niveau sans contrat chez Odoo — le R0 en général) : on rend
 * une grille vide, et `prixAuNiveau` laisse la fiche article tarifer.
 */
const promesses = new Map<NiveauTarif, Promise<GrilleTarif>>();

export function chargerGrille(niveau: NiveauTarif): Promise<GrilleTarif> {
  const deja = promesses.get(niveau);
  if (deja) return deja;
  const p = (async () => {
    const PAS = 1000;
    const rangs: RangGrille[] = [];
    for (let debut = 0; ; debut += PAS) {
      const { data, error } = await supabase
        .from('grille_contrat')
        .select('codification, prix, priorite')
        .eq('niveau', niveau)
        .order('id')
        .range(debut, debut + PAS - 1);
      if (error) throw new Error(error.message);
      rangs.push(...(data || []));
      if (!data || data.length < PAS) break;
    }
    return indexerGrille(rangs);
  })();
  promesses.set(niveau, p);
  p.catch(() => promesses.delete(niveau));
  return p;
}
