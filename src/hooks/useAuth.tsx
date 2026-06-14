import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';

export type AuthState = {
  session: Session | null;
  loading: boolean;
  authEvent: AuthChangeEvent | null;
  /** Rôle Veille (veille_roles.role) — 'admin' = administrateur. */
  role: string | null;
  /** Vrai si l'utilisateur courant est administrateur. */
  isAdmin: boolean;
  /** Interrupteur maître : accès à l'application. null = en cours de chargement,
   *  false = écran « Accès refusé ». (veille_roles.crm_active, admin = toujours actif) */
  active: boolean | null;
  /** Accès au module CRM (page Pipeline/Actions/Calendrier/Analyse).
   *  (veille_roles.crm_access, admin = oui) */
  canCrm: boolean;
  /** Accès au périmètre Achat. (veille_roles.crm_achat_access, admin = oui) */
  canAchat: boolean;
};

type RoleRow = {
  crm_access?: boolean | null;
  crm_active?: boolean | null;
  crm_achat_access?: boolean | null;
  role?: string | null;
};

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authEvent, setAuthEvent] = useState<AuthChangeEvent | null>(null);
  const [crmActive, setCrmActive] = useState<boolean | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [crmFlag, setCrmFlag] = useState<boolean>(false);
  const [achatFlag, setAchatFlag] = useState<boolean>(false);

  async function checkAccess(userId: string) {
    // select('*') : indépendant des migrations (crm_active/crm_achat_access
    // peuvent ne pas encore exister) — sinon PostgREST rejette la requête.
    const { data } = await supabase
      .from('veille_roles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    const row = data as RoleRow | null;
    setRole(row?.role ?? null);
    setCrmFlag(row?.crm_access ?? false);
    setAchatFlag(row?.crm_achat_access ?? false);
    // Repli pré-migration : si crm_active n'existe pas encore, on retombe sur
    // crm_access (ancien interrupteur global) pour ne bloquer personne.
    setCrmActive(row?.crm_active ?? row?.crm_access ?? false);
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthEvent(event);
      setSession(session);
      setLoading(false);
      if (session?.user) {
        checkAccess(session.user.id);
      } else {
        setCrmActive(null);
        setRole(null);
        setCrmFlag(false);
        setAchatFlag(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session?.user) {
        checkAccess(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const isAdmin = role === 'admin';
  const active = crmActive === null ? null : (isAdmin || crmActive);
  const canCrm = isAdmin || crmFlag;
  const canAchat = isAdmin || achatFlag;

  return { session, loading, authEvent, role, isAdmin, active, canCrm, canAchat };
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
