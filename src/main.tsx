import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

window.addEventListener('error', (e) => {
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
