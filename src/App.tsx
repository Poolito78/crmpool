import { Component, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
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
import Dashboard from "@/pages/Dashboard";
import Clients from "@/pages/Clients";
import Produits from "@/pages/Produits";
import Fournisseurs from "@/pages/Fournisseurs";
import Stock from "@/pages/Stock";
import Commandes from "@/pages/Commandes";
import CommandesClient from "@/pages/CommandesClient";
import Devis from "@/pages/Devis";
import CalculateurUPS from "@/pages/CalculateurUPS";
import GED from "@/pages/GED";
import FacturesClient from "@/pages/FacturesClient";
import FacturesFournisseur from "@/pages/FacturesFournisseur";
import CRM from "@/pages/CRM";
import StatsVariantes from "@/pages/StatsVariantes";
import VeilleConcurrence from "@/pages/VeilleConcurrence";
import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "./pages/NotFound";

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
        </Route>
        <Route path="/auth" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
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
