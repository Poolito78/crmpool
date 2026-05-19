import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      '/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/anthropic/, ''),
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // xlsx (SheetJS) référence process/Buffer de Node.js — les rendre disponibles dans le navigateur
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
  },
  // BUGFIX: Vite 5 calcule isProduction via process.env.NODE_ENV (pas fiable sur Vercel).
  // On force jsxDev via le mode Vite (toujours 'production' pour vite build) pour éviter
  // que esbuild génère des appels jsxDEV() qui crashent avec le runtime React production.
  esbuild: {
    jsxDev: mode !== 'production',
  },
  optimizeDeps: {
    include: ['xlsx'],
    // Force le re-bundling des deps en production (évite le cache Vercel corrompu avec jsxDEV)
    force: mode === 'production',
  },
}));
