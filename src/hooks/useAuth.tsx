import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authEvent, setAuthEvent] = useState<AuthChangeEvent | null>(null);
  const [crmAccess, setCrmAccess] = useState<boolean | null>(null);

  async function checkCrmAccess(userId: string) {
    const { data } = await supabase
      .from('veille_roles')
      .select('crm_access')
      .eq('user_id', userId)
      .maybeSingle();
    setCrmAccess(data?.crm_access ?? false);
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthEvent(event);
      setSession(session);
      setLoading(false);
      if (session?.user) {
        checkCrmAccess(session.user.id);
      } else {
        setCrmAccess(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session?.user) {
        checkCrmAccess(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session, loading, authEvent, crmAccess };
}
