import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { StoreProvider } from "@/lib/StoreContext";
import CRMLayout from "@/components/CRMLayout";
import Dashboard from "@/pages/Dashboard";
import Clients from "@/pages/Clients";
import Produits from "@/pages/Produits";
import Fournisseurs from "@/pages/Fournisseurs";
import Stock from "@/pages/Stock";
import Devis from "@/pages/Devis";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <StoreProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route element={<CRMLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/produits" element={<Produits />} />
              <Route path="/fournisseurs" element={<Fournisseurs />} />
              <Route path="/stock" element={<Stock />} />
              <Route path="/devis" element={<Devis />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </StoreProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
