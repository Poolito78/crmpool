import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

/* Service worker : mise à jour PROPOSÉE, jamais imposée.
 *
 * Avant, la config était `registerType: "autoUpdate"` + `skipWaiting` +
 * `clientsClaim`. Conséquence : dès que le nouveau service worker prenait le
 * contrôle de l'onglet déjà ouvert, « virtual:pwa-register » rechargeait la
 * page tout seul — d'où le CRM qui se rafraîchissait 10 à 20 s après chaque
 * ouverture (le temps que le service worker finisse de s'installer).
 *
 * Désormais : la nouvelle version attend sagement, une bannière discrète
 * apparaît en bas de l'écran, et la page ne se recharge QUE sur clic.
 * On garde les deux relances de vérification (retour au premier plan et toutes
 * les cinq minutes) : sur un téléphone l'app installée reste ouverte des
 * heures, sans ça un déploiement resterait invisible toute la journée.
 */
const appliquerMiseAJour = registerSW({
  immediate: true,
  onNeedRefresh() {
    afficherBanniereMiseAJour();
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const verifier = () => { registration.update().catch(() => { /* hors ligne */ }); };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') verifier();
    });
    setInterval(verifier, 5 * 60 * 1000);
  },
});

// Bannière en DOM pur (et non en React) : elle doit pouvoir s'afficher même si
// l'application n'est pas montée, par exemple pendant une erreur de rendu.
function afficherBanniereMiseAJour() {
  if (document.getElementById('maj-banniere')) return;
  const barre = document.createElement('div');
  barre.id = 'maj-banniere';
  barre.setAttribute('role', 'status');
  barre.style.cssText = [
    'position:fixed', 'left:50%', 'transform:translateX(-50%)',
    'bottom:max(16px, env(safe-area-inset-bottom))', 'z-index:2147483647',
    'display:flex', 'align-items:center', 'gap:12px',
    'padding:10px 12px 10px 16px', 'border-radius:12px',
    'background:#1f2937', 'color:#fff',
    'font:500 14px/1.3 system-ui, -apple-system, sans-serif',
    'box-shadow:0 8px 24px rgba(0,0,0,.28)', 'max-width:calc(100vw - 24px)',
  ].join(';');

  const texte = document.createElement('span');
  texte.textContent = 'Nouvelle version disponible';

  const recharger = document.createElement('button');
  recharger.type = 'button';
  recharger.textContent = 'Recharger';
  recharger.style.cssText = 'padding:6px 12px;border:0;border-radius:8px;background:#cc0000;color:#fff;font:600 14px system-ui;cursor:pointer';
  // `true` → on demande au nouveau SW de prendre la main, puis la page recharge.
  recharger.onclick = () => { appliquerMiseAJour(true); };

  const plusTard = document.createElement('button');
  plusTard.type = 'button';
  plusTard.setAttribute('aria-label', 'Plus tard');
  plusTard.textContent = '✕';
  plusTard.style.cssText = 'padding:6px 8px;border:0;border-radius:8px;background:transparent;color:#9ca3af;font:600 14px system-ui;cursor:pointer';
  plusTard.onclick = () => { barre.remove(); };

  barre.append(texte, recharger, plusTard);
  document.body.appendChild(barre);
}

// Repère de version, lisible dans Paramètres et dans la console : sans lui,
// « ça ne marche pas sur mon téléphone » et « mon téléphone a une vieille
// version » sont impossibles à distinguer.
console.info('[MonCRM] version du', new Date(__BUILD__).toLocaleString('fr-FR'));

// Filet de sécurité après un déploiement : si un chunk dynamique ne se charge pas
// (hash changé / cache périmé), on recharge la page UNE fois pour récupérer les
// fichiers à jour. Le garde-fou sessionStorage évite toute boucle de rechargement.
async function reloadOnceForStaleChunks(reason: string) {
  try {
    if (sessionStorage.getItem('chunk-reload') === '1') return;
    sessionStorage.setItem('chunk-reload', '1');
    console.warn('[reload] chunks périmés détectés (' + reason + ') — purge SW + caches puis rechargement…');
    // Désinscrire l'ancien SW + vider les caches (sinon il continue de servir d'anciens chunks)
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
