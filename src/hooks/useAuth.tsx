import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authEvent, setAuthEvent] = useState<AuthChangeEvent | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthEvent(event);
      setSession(session);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session, loading, authEvent };
}
