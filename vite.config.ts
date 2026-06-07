import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

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
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      // Le SW ne s'active qu'en build (pas en dev) pour ne pas gêner le HMR.
      devOptions: { enabled: false },
      includeAssets: ["favicon.ico", "logo-isofloor.png"],
      manifest: {
        name: "MonCRM - ISOFLOOR",
        short_name: "MonCRM",
        description: "CRM : clients, devis, produits, stock, fournisseurs.",
        theme_color: "#cc0000",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/logo-isofloor.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/logo-isofloor.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/logo-isofloor.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Précache les chunks JS/CSS/HTML (les gros chunks PDF/Excel inclus → 2e ouverture instantanée)
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // pdf.worker ~2,1 Mo
        navigateFallback: "/index.html",
        // CRUCIAL après un déploiement : le nouveau SW prend le contrôle immédiatement
        // et purge les anciens caches. Sans ça, le navigateur peut mélanger d'anciens
        // et de nouveaux chunks (bindings déplacés entre chunks → « Cannot access 'X'
        // before initialization »).
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Ne jamais mettre en cache les appels Supabase (données toujours fraîches)
        navigateFallbackDenylist: [/^\/anthropic/, /supabase\.co/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin.includes("supabase.co"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Sépare les grosses libs dans leurs propres chunks → chargées seulement
    // quand une page qui les utilise est ouverte (allège le bundle initial mobile).
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-xlsx': ['xlsx'],
          'vendor-pdf': ['jspdf', 'html2canvas'],
          'vendor-charts': ['recharts'],
        },
      },
    },
    chunkSizeWarningLimit: 1200,
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
