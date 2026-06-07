import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

// Enregistre le service worker (mise à jour auto en arrière-plan).
// Une nouvelle version s'applique au prochain chargement.
registerSW({ immediate: true });

// Filet de sécurité après un déploiement : si un chunk dynamique ne se charge pas
// (hash changé / cache périmé), on recharge la page UNE fois pour récupérer les
// fichiers à jour. Le garde-fou sessionStorage évite toute boucle de rechargement.
function reloadOnceForStaleChunks(reason: string) {
  try {
    if (sessionStorage.getItem('chunk-reload') === '1') return;
    sessionStorage.setItem('chunk-reload', '1');
    console.warn('[reload] chunks périmés détectés (' + reason + ') — rechargement…');
    window.location.reload();
  } catch { /* ignore */ }
}
// Après 30 s de fonctionnement sain, on lève le garde-fou (un futur déploiement
// pourra de nouveau déclencher un rechargement). Si l'erreur réapparaît avant ça,
// le garde-fou reste actif → pas de boucle de rechargement.
window.addEventListener('load', () => {
  setTimeout(() => { try { sessionStorage.removeItem('chunk-reload'); } catch { /* ignore */ } }, 30000);
});
// Échec de préchargement d'un import dynamique (Vite).
window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); reloadOnceForStaleChunks('preloadError'); });

window.addEventListener('error', (e) => {
  // Signatures d'un mélange d'anciens et nouveaux chunks après déploiement
  if (/before initialization|reading 'default'|Failed to fetch dynamically imported module|error loading dynamically imported module|Unexpected token '<'/.test(e.message || '')) {
    reloadOnceForStaleChunks(e.message);
    return;
  }
  const root = document.getElementById('root');
  if (root && !root.hasChildNodes()) {
    root.innerHTML = `<div style="padding:32px;font-family:monospace;background:#fee;border:2px solid red;margin:16px;border-radius:8px"><h2 style="color:red">Erreur JS</h2><pre style="white-space:pre-wrap;word-break:break-all">${e.message}\n${e.filename}:${e.lineno}</pre></div>`;
  }
});

try {
  createRoot(document.getElementById("root")!).render(<App />);
} catch (e: any) {
  document.getElementById('root')!.innerHTML = `<div style="padding:32px;font-family:monospace;background:#fee;border:2px solid red;margin:16px;border-radius:8px"><h2 style="color:red">Erreur montage</h2><pre style="white-space:pre-wrap;word-break:break-all">${e?.message}\n${e?.stack}</pre></div>`;
}
