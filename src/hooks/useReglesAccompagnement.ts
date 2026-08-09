import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RegleAccompagnement } from '@/lib/chiffrage';

/**
 * Règles d'accompagnement : les articles qu'on ajoute systématiquement quand un
 * autre est commandé (catalyseur avec la résine, primaire avec le kit…).
 *
 * Elles vivent en base plutôt que dans le code : c'est une décision commerciale,
 * qui change sans qu'on redéploie l'application.
 */
export function useReglesAccompagnement() {
  const [regles, setRegles] = useState<RegleAccompagnement[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const { data, error } = await supabase
      .from('regles_accompagnement')
      .select('*')
      .order('ordre', { ascending: true });

    if (error) {
      // La table peut ne pas exister sur un environnement pas encore migré :
      // l'analyseur doit continuer de fonctionner sans les règles.
      setErreur(error.message);
      setRegles([]);
    } else {
      setRegles((data || []) as unknown as RegleAccompagnement[]);
    }
    setChargement(false);
  }, []);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  const enregistrer = useCallback(
    async (regle: Partial<RegleAccompagnement> & { id?: string }) => {
      const { error } = regle.id
        ? await supabase.from('regles_accompagnement').update(regle).eq('id', regle.id)
        : await supabase.from('regles_accompagnement').insert(regle);
      if (error) throw error;
      await recharger();
    },
    [recharger],
  );

  const supprimer = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('regles_accompagnement').delete().eq('id', id);
      if (error) throw error;
      await recharger();
    },
    [recharger],
  );

  return { regles, chargement, erreur, recharger, enregistrer, supprimer };
}
