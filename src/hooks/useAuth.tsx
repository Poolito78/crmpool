import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';

export type AuthState = {
  session: Session | null;
  loading: boolean;
  authEvent: AuthChangeEvent | null;
  /** Accès global à crmpool (veille_roles.crm_access). */
  crmAccess: boolean | null;
  /** Rôle Veille (veille_roles.role) — 'admin' = administrateur. */
  role: string | null;
  /** Vrai si l'utilisateur courant est administrateur. */
  isAdmin: boolean;
  /** Accès au périmètre Achat (admin OU veille_roles.crm_achat_access). */
  canAchat: boolean;
};

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authEvent, setAuthEvent] = useState<AuthChangeEvent | null>(null);
  const [crmAccess, setCrmAccess] = useState<boolean | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [achatFlag, setAchatFlag] = useState<boolean>(false);

  async function checkCrmAccess(userId: string) {
    // select('*') pour rester indépendant des migrations (crm_achat_access peut
    // ne pas encore exister) — sinon PostgREST rejette toute la requête.
    const { data } = await supabase
      .from('veille_roles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    setCrmAccess(data?.crm_access ?? false);
    setRole(data?.role ?? null);
    setAchatFlag(((data as { crm_achat_access?: boolean } | null)?.crm_achat_access) ?? false);
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
        setRole(null);
        setAchatFlag(false);
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

  const isAdmin = role === 'admin';
  const canAchat = isAdmin || achatFlag;

  return { session, loading, authEvent, crmAccess, role, isAdmin, canAchat };
}

// ── Contexte partagé : useAuth est appelé une seule fois (AuthProvider) et les
//    valeurs sont diffusées à toute l'app (nav, routes, pages) via useCurrentUser.
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useCurrentUser(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useCurrentUser doit être utilisé dans <AuthProvider>');
  return ctx;
}
