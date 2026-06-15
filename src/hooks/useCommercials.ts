import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { setCreatorName } from '@/lib/concurrents';

export type Commercial = { userId: string; name: string };

// Liste des commerciaux (utilisateurs) pour la colonne « Commercial ».
// L'admin lit toutes les lignes veille_roles (policy RLS admin) ; un invité ne
// voit que la sienne. nameOf(userId) renvoie un libellé d'affichage.
export function useCommercials() {
  const [commercials, setCommercials] = useState<Commercial[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('veille_roles').select('*');
      if (cancelled || !data) return;
      const rows = data as { user_id: string; display_name?: string | null; email?: string | null }[];
      // Synchronise le nom commercial vers la map utilisée par la Veille (« Saisi par »),
      // pour unifier avec le nom d'affichage défini dans Admin → Droits utilisateurs.
      for (const r of rows) {
        if (r.email && r.display_name && r.display_name.trim()) setCreatorName(r.email, r.display_name.trim());
      }
      const list = rows
        .map(r => ({ userId: r.user_id, name: (r.display_name || r.email || '').trim() || 'Commercial' }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setCommercials(list);
    })();
    return () => { cancelled = true; };
  }, []);

  const nameOf = (userId?: string | null) => {
    if (!userId) return '—';
    return commercials.find(c => c.userId === userId)?.name ?? '—';
  };

  return { commercials, nameOf };
}
