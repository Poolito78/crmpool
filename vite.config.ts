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
      // « prompt » et non « autoUpdate » : c'est nous qui décidons quand la
      // nouvelle version s'applique (bannière dans src/main.tsx).
      registerType: "prompt",
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
        orientation: "any",
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
        // Les nuanciers (ral 215 fichiers, quartz 4,9 Mo, paillettes 9,2 Mo ≈ 16 Mo
        // au total) sont HORS précache : les précacher faisait durer l'installation
        // du service worker 10 à 20 s à chaque première ouverture. Ils sont mis en
        // cache à l'usage (runtimeCaching « nuanciers » ci-dessous).
        globIgnores: [
          "**/ral/**",
          "**/quartz/**",
          "**/paillettes/**",
          "**/CRM.xlsx",
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // pdf.worker ~2,1 Mo
        navigateFallback: "/index.html",
        // PAS de skipWaiting/clientsClaim : sinon le nouveau service worker prend la
        // main sur l'onglet déjà ouvert (controllerchange) et « virtual:pwa-register »
        // recharge la page sans prévenir. La nouvelle version est désormais proposée
        // par une bannière (voir src/main.tsx) et appliquée seulement sur clic.
        // Corollaire : l'ancien SW continue de servir un jeu de chunks COHÉRENT
        // jusqu'au rechargement → plus de mélange ancien/nouveau chunk.
        cleanupOutdatedCaches: true,
        // Ne jamais mettre en cache les appels Supabase (données toujours fraîches)
        navigateFallbackDenylist: [
          /^\/anthropic/,
          /supabase\.co/,
          /^\/(ral|quartz|paillettes)\//,
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin.includes("supabase.co"),
            handler: "NetworkOnly",
          },
          {
            // Nuanciers : téléchargés à la première consultation, puis servis
            // depuis le cache. Rien n'est téléchargé tant qu'on ne les ouvre pas.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /^\/(ral|quartz|paillettes)\//.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "nuanciers",
              expiration: { maxEntries: 320, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
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
    // Horodatage de compilation. Affiché dans Paramètres : c'est ce qui permet
    // de distinguer « la fonction ne marche pas » de « ce téléphone tourne
    // encore sur une version d'hier ».
    __BUILD__: JSON.stringify(new Date().toISOString()),
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
