import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { basculerVers, idFenetre, ouvrirFenetre, groupeFenetre, renommerFenetre } from '@/lib/fenetres';

/* Les fenêtres CRM ouvertes, vues de celle-ci (ouvrir/basculer : `lib/fenetres`).
 *
 * Chaque fenêtre s'annonce sur le canal (`etat`) à l'ouverture, à chaque
 * changement de page ou de focus, et toutes les 15 s ; elle prend congé
 * (`bye`) en se fermant. Un minuteur de fenêtre cachée est ralenti par le
 * navigateur — jusqu'à une fois par minute —, d'où la purge à 90 s et la
 * relance (`qui`) à l'ouverture du menu, à laquelle tout le monde répond : un
 * message, lui, n'est pas ralenti.
 *
 * Chaque annonce porte son `groupe` (`groupeFenetre`) : on ne
 * tente de basculer que vers une fenêtre du même groupe, les autres sont
 * signalées « indépendantes ».
 *
 * La clé est le `jeton` de l'instance, pas le nom : après un renommage
 * (onglet dupliqué, même `window.name`), l'ancienne entrée est remplacée.
 *
 * Raccourcis : Alt+1…9 bascule vers la n-ième fenêtre, Alt+N ouvre la page
 * courante dans une nouvelle. AltGr se lit Ctrl+Alt sous Windows : exclure
 * Ctrl, sinon AltGr+0 (« @ ») sur un clavier français changerait de fenêtre. */

export type Fenetre = {
  id: string;
  jeton: string;
  groupe: string;
  path: string;
  libelle: string;
  active: boolean;
  ouverte: number;
  vu: number;
};

type Message =
  | { type: 'etat'; fenetre: Omit<Fenetre, 'vu'> }
  | { type: 'qui' }
  | { type: 'bye'; jeton: string }
  | { type: 'aller'; id: string; path: string };

const CANAL = 'crm-fenetres';
const BATTEMENT_MS = 15_000;
const PURGE_MS = 90_000;

export function useFenetres(libelle: string) {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname + location.search;

  const moi = useRef({ jeton: Math.random().toString(36).slice(2), ouverte: Date.now() });
  const [autres, setAutres] = useState<Record<string, Fenetre>>({});
  const canal = useRef<BroadcastChannel | null>(null);
  const courant = useRef({ path, libelle });
  courant.current = { path, libelle };

  const etat = useCallback((): Omit<Fenetre, 'vu'> => ({
    id: idFenetre(),
    jeton: moi.current.jeton,
    groupe: groupeFenetre(),
    path: courant.current.path,
    libelle: courant.current.libelle,
    active: document.hasFocus(),
    ouverte: moi.current.ouverte,
  }), []);

  const annoncer = useCallback(() => {
    canal.current?.postMessage({ type: 'etat', fenetre: etat() } satisfies Message);
  }, [etat]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const c = new BroadcastChannel(CANAL);
    canal.current = c;

    c.onmessage = (e: MessageEvent<Message>) => {
      const m = e.data;
      if (m.type === 'etat') {
        const f = m.fenetre;
        if (f.id === idFenetre()) {
          // Même nom : la plus récente des deux se renomme.
          const plusRecente = moi.current.ouverte > f.ouverte
            || (moi.current.ouverte === f.ouverte && moi.current.jeton > f.jeton);
          if (plusRecente) { renommerFenetre(); annoncer(); }
        }
        setAutres(prev => ({ ...prev, [f.jeton]: { ...f, vu: Date.now() } }));
      } else if (m.type === 'qui') {
        annoncer();
      } else if (m.type === 'bye') {
        setAutres(prev => {
          if (!prev[m.jeton]) return prev;
          const { [m.jeton]: _, ...reste } = prev;
          return reste;
        });
      } else if (m.type === 'aller' && m.id === idFenetre()) {
        navigate(m.path);
      }
    };

    annoncer();
    c.postMessage({ type: 'qui' } satisfies Message);

    const battement = window.setInterval(() => {
      annoncer();
      const limite = Date.now() - PURGE_MS;
      setAutres(prev => Object.fromEntries(Object.entries(prev).filter(([, f]) => f.vu >= limite)));
    }, BATTEMENT_MS);

    const auRevoir = () => c.postMessage({ type: 'bye', jeton: moi.current.jeton } satisfies Message);
    // Retour du cache de navigation (bfcache) : la page n'a pas été rechargée.
    const retour = (e: PageTransitionEvent) => { if (e.persisted) annoncer(); };
    window.addEventListener('focus', annoncer);
    window.addEventListener('blur', annoncer);
    window.addEventListener('pagehide', auRevoir);
    window.addEventListener('pageshow', retour);
    return () => {
      auRevoir();
      window.clearInterval(battement);
      window.removeEventListener('focus', annoncer);
      window.removeEventListener('blur', annoncer);
      window.removeEventListener('pagehide', auRevoir);
      window.removeEventListener('pageshow', retour);
      c.close();
      canal.current = null;
    };
  }, [annoncer, navigate]);

  // Le titre distingue les fenêtres dans la barre des tâches et Alt+Tab.
  useEffect(() => {
    annoncer();
    document.title = `${libelle} · MonCRM`;
  }, [path, libelle, annoncer]);

  /** Relance l'appel : ne garde que les fenêtres qui répondent. */
  const rafraichir = useCallback(() => {
    const depuis = Date.now();
    canal.current?.postMessage({ type: 'qui' } satisfies Message);
    window.setTimeout(() => {
      setAutres(prev => Object.fromEntries(Object.entries(prev).filter(([, f]) => f.vu >= depuis)));
    }, 600);
  }, []);

  const fenetres = useMemo<Fenetre[]>(() => {
    const ici: Fenetre = { ...etat(), libelle, path, vu: Date.now() };
    return [...Object.values(autres).filter(f => f.jeton !== ici.jeton), ici]
      .sort((a, b) => a.ouverte - b.ouverte);
  }, [autres, etat, libelle, path]);

  const basculer = useCallback((f: Fenetre) => {
    if (f.jeton === moi.current.jeton) return;
    if (f.groupe === groupeFenetre() && basculerVers(f.id)) return;
    toast.info(`« ${f.libelle} » est ouverte dans une fenêtre indépendante`, {
      description: 'Retrouvez-la dans la barre des tâches (Alt+Tab).',
    });
  }, []);

  /** Affiche `cible` dans la fenêtre `f` et la met au premier plan. */
  const envoyer = useCallback((f: Fenetre, cible: string) => {
    canal.current?.postMessage({ type: 'aller', id: f.id, path: cible } satisfies Message);
    basculer(f);
  }, [basculer]);

  const nouvelle = useCallback((cible: string) => {
    if (!ouvrirFenetre(cible)) toast.error("Le navigateur a bloqué l'ouverture de la fenêtre");
  }, []);

  const parRang = useRef(fenetres);
  parRang.current = fenetres;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const chiffre = /^Digit([1-9])$/.exec(e.code);
      if (chiffre) {
        const f = parRang.current[Number(chiffre[1]) - 1];
        if (!f) return;
        e.preventDefault();
        basculer(f);
      } else if (e.code === 'KeyN') {
        e.preventDefault();
        nouvelle(courant.current.path);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [basculer, nouvelle]);

  return { fenetres, monJeton: moi.current.jeton, monGroupe: groupeFenetre(), rafraichir, basculer, envoyer, nouvelle };
}
