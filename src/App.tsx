import { Component, lazy, Suspense, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Signatures d'un mélange d'anciens/nouveaux chunks après déploiement (cache PWA).
function isStaleChunkError(msg: string) {
  return /before initialization|reading 'default'|Failed to fetch dynamically imported module|error loading dynamically imported module|Unexpected token '<'/.test(msg);
}

// Purge le service worker + tous les caches puis recharge depuis le réseau.
// Indispensable : un ancien SW (sans skipWaiting) garde le contrôle tant que des
// onglets sont ouverts et continue de servir d'anciens chunks → un simple reload()
// ne suffit pas, il faut le désinscrire.
async function purgeAndReload() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch { /* ignore */ }
  window.location.reload();
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    // 1re occurrence d'une erreur de chunk périmé → purge SW + caches puis recharge.
    // Si ça se reproduit après (garde-fou déjà posé), c'est un vrai bug → on affiche l'erreur.
    if (isStaleChunkError(error?.message || '')) {
      try {
        if (sessionStorage.getItem('chunk-reload') !== '1') {
          sessionStorage.setItem('chunk-reload', '1');
          purgeAndReload();
        }
      } catch { /* ignore */ }
    }
  }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      // Chunk périmé, 1re fois → message neutre le temps de la purge + rechargement.
      const alreadyTried = (() => { try { return sessionStorage.getItem('chunk-reload') === '1'; } catch { return false; } })();
      if (isStaleChunkError(err.message || '') && !alreadyTried) {
        return (
          <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', textAlign: 'center', color: '#555' }}>
            Mise à jour de l'application en cours…
            <div style={{ marginTop: 16 }}>
              <button
                onClick={() => { try { sessionStorage.removeItem('chunk-reload'); } catch { /* ignore */ } purgeAndReload(); }}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
              >
                Recharger maintenant
              </button>
            </div>
          </div>
        );
      }
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', background: '#fee', border: '2px solid red', margin: 16, borderRadius: 8 }}>
          <h2 style={{ color: 'red' }}>Erreur React</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{err.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11, color: '#555' }}>{err.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { StoreProvider } from "@/lib/StoreContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import CRMLayout from "@/components/CRMLayout";
// Auth/Reset chargés en statique (écrans d'entrée, requis immédiatement)
import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";
// Pages applicatives chargées à la demande (code-splitting → bundle initial allégé)
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Clients = lazy(() => import("@/pages/Clients"));
const Produits = lazy(() => import("@/pages/Produits"));
const Fournisseurs = lazy(() => import("@/pages/Fournisseurs"));
const Stock = lazy(() => import("@/pages/Stock"));
const Commandes = lazy(() => import("@/pages/Commandes"));
const CommandesClient = lazy(() => import("@/pages/CommandesClient"));
const Devis = lazy(() => import("@/pages/Devis"));
const CalculateurUPS = lazy(() => import("@/pages/CalculateurUPS"));
const GED = lazy(() => import("@/pages/GED"));
const FacturesClient = lazy(() => import("@/pages/FacturesClient"));
const FacturesFournisseur = lazy(() => import("@/pages/FacturesFournisseur"));
const CRM = lazy(() => import("@/pages/CRM"));
const StatsVariantes = lazy(() => import("@/pages/StatsVariantes"));
const VeilleConcurrence = lazy(() => import("@/pages/VeilleConcurrence"));
const Parametres = lazy(() => import("@/pages/Parametres"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function AppRoutes() {
  const { session, loading, authEvent, crmAccess } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Password recovery flow — show reset form regardless of session state
  if (authEvent === 'PASSWORD_RECOVERY') {
    return (
      <Routes>
        <Route path="*" element={<ResetPassword />} />
      </Routes>
    );
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

  // Vérification accès CRM en cours
  if (crmAccess === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Accès CRM refusé
  if (!crmAccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 text-center px-4">
        <div className="text-5xl">🔒</div>
        <h1 className="text-xl font-semibold">Accès refusé</h1>
        <p className="text-muted-foreground max-w-sm">
          Votre compte n'a pas accès à cette application. Contactez un administrateur pour obtenir les droits CRM.
        </p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="mt-2 text-sm text-primary underline underline-offset-4"
        >
          Se déconnecter
        </button>
      </div>
    );
  }

  return (
    <StoreProvider>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      }>
        <Routes>
          <Route element={<CRMLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/produits" element={<Produits />} />
            <Route path="/fournisseurs" element={<Fournisseurs />} />
            <Route path="/stock" element={<Stock />} />
            <Route path="/devis" element={<Devis />} />
            <Route path="/commandes" element={<Commandes />} />
            <Route path="/commandes-client" element={<CommandesClient />} />
            <Route path="/calculateur-ups" element={<CalculateurUPS />} />
            <Route path="/ged" element={<GED />} />
            <Route path="/factures-client" element={<FacturesClient />} />
            <Route path="/factures-fournisseur" element={<FacturesFournisseur />} />
            <Route path="/crm" element={<CRM />} />
            <Route path="/stats-variantes" element={<StatsVariantes />} />
            <Route path="/veille-concurrence" element={<VeilleConcurrence />} />
            <Route path="/parametres" element={<Parametres />} />
          </Route>
          <Route path="/auth" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </StoreProvider>
  );
}

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
