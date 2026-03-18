import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { StoreProvider } from "@/lib/StoreContext";
import { useAuth } from "@/hooks/useAuth";
import CRMLayout from "@/components/CRMLayout";
import Dashboard from "@/pages/Dashboard";
import Clients from "@/pages/Clients";
import Produits from "@/pages/Produits";
import Fournisseurs from "@/pages/Fournisseurs";
import Stock from "@/pages/Stock";
import Commandes from "@/pages/Commandes";
import Devis from "@/pages/Devis";
import CalculateurUPS from "@/pages/CalculateurUPS";
import Auth from "@/pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
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
          <Route path="/calculateur-ups" element={<CalculateurUPS />} />
          <Route path="/commandes" element={<Commandes />} />
        </Route>
        <Route path="/auth" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </StoreProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
