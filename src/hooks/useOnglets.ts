import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType, parsePath, type Location, type To } from 'react-router-dom';
import { toast } from 'sonner';
import { idFenetre } from '@/lib/fenetres';
import {
  MAX_ONGLETS, cheminDe, memePage, nouvelIdOnglet, restaurer, serialiser, versLocation,
  type EtatOnglets, type Onglet,
} from '@/lib/onglets';

/* Les onglets de cette fenêtre, tenus par la coquille (`CRMLayout`). Le
 * pourquoi est dans `lib/onglets.ts`. */

const cleStockage = () => `crm-onglets:${idFenetre()}`;

function lireStockage(): string | null {
  try { return sessionStorage.getItem(cleStockage()); } catch { return null; }
}

/** Le conteneur d'un onglet dans le DOM (`PageOnglet`). */
export const selecteurOnglet = (id: string) => `[data-onglet="${id}"]`;

export function useOnglets() {
  const location = useLocation();
  const typeNav = useNavigationType();
  const navigate = useNavigate();
  const [etat, setEtat] = useState<EtatOnglets>(() => restaurer(lireStockage(), location));
  const etatRef = useRef(etat);
  etatRef.current = etat;
  /** Adresse posée par une bascule : l'onglet qui la reçoit la porte déjà. */
  const attendu = useRef<string | null>(null);

  useEffect(() => {
    try { sessionStorage.setItem(cleStockage(), serialiser(etat)); } catch { /* stockage indisponible */ }
  }, [etat]);

  // L'adresse du navigateur suit l'onglet actif, et inversement.
  useLayoutEffect(() => {
    const ici = cheminDe(location);
    if (attendu.current !== null) {
      const voulu = attendu.current;
      attendu.current = null;
      if (voulu === ici) return;
    }
    setEtat(e => {
      const actif = e.onglets.find(o => o.id === e.actif);
      if (actif?.location.key === location.key) return e;
      if (typeNav === 'POP' && actif && cheminDe(actif.location) !== ici) {
        const autre = e.onglets.find(o => o.id !== e.actif && cheminDe(o.location) === ici);
        if (autre) return { ...e, actif: autre.id };
      }
      return { ...e, onglets: e.onglets.map(o => (o.id === e.actif ? { ...o, location } : o)) };
    });
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  const afficher = useCallback((o: Onglet) => {
    attendu.current = cheminDe(o.location);
    navigate(cheminDe(o.location), { replace: true, state: o.location.state });
  }, [navigate]);

  /** Une question (AlertDialog) attend une réponse dans l'onglet affiché. */
  const questionEnCours = useCallback(() => {
    const ici = document.querySelector(selecteurOnglet(etatRef.current.actif));
    if (!ici?.querySelector('[role="alertdialog"]')) return false;
    toast.info("Répondez d'abord à la question affichée.");
    return true;
  }, []);

  const basculer = useCallback((id: string) => {
    const e = etatRef.current;
    const o = e.onglets.find(x => x.id === id);
    if (!o || id === e.actif || questionEnCours()) return;
    setEtat({ ...e, actif: id });
    afficher(o);
  }, [afficher, questionEnCours]);

  const ouvrir = useCallback((chemin: string) => {
    const e = etatRef.current;
    if (e.onglets.length >= MAX_ONGLETS) {
      toast.info(`${MAX_ONGLETS} onglets au plus : fermez-en un pour en ouvrir un autre.`);
      return;
    }
    if (questionEnCours()) return;
    const o: Onglet = { id: nouvelIdOnglet(), location: versLocation(chemin) };
    const i = e.onglets.findIndex(x => x.id === e.actif);
    const onglets = [...e.onglets];
    onglets.splice(i + 1, 0, o);
    setEtat({ onglets, actif: o.id });
    afficher(o);
  }, [afficher, questionEnCours]);

  const fermer = useCallback((id: string, libelle: string) => {
    const e = etatRef.current;
    if (e.onglets.length <= 1) return;
    const dialogue = document.querySelector(selecteurOnglet(id))?.querySelector('[role="dialog"], [role="alertdialog"]');
    if (dialogue && !window.confirm(`L'onglet « ${libelle} » a une fenêtre ouverte : ce qui n'est pas enregistré sera perdu. Fermer l'onglet ?`)) return;
    const i = e.onglets.findIndex(x => x.id === id);
    const onglets = e.onglets.filter(x => x.id !== id);
    if (id !== e.actif) { setEtat({ ...e, onglets }); return; }
    const suivant = onglets[Math.min(i, onglets.length - 1)];
    setEtat({ onglets, actif: suivant.id });
    afficher(suivant);
  }, [afficher]);

  /** Navigation d'un onglet caché : elle ne touche que lui. */
  const deplacer = useCallback((id: string, to: To, state: unknown) => {
    const p = typeof to === 'string' ? parsePath(to) : to;
    const loc: Location = {
      pathname: p.pathname || '/', search: p.search || '', hash: p.hash || '',
      state: state ?? null, key: nouvelIdOnglet(),
    };
    setEtat(e => ({ ...e, onglets: e.onglets.map(o => (o.id === id ? { ...o, location: loc } : o)) }));
  }, []);

  const nommer = useCallback((id: string, titre: string | null) => {
    setEtat(e => {
      const o = e.onglets.find(x => x.id === id);
      if (!o || (o.titre ?? null) === titre) return e;
      return { ...e, onglets: e.onglets.map(x => (x.id === id ? { ...x, titre } : x)) };
    });
  }, []);

  /** Clic sur une entrée du menu. Ctrl+clic : nouvel onglet. Clic simple sur
   *  une page déjà ouverte dans un autre onglet : on y va, plutôt que de la
   *  rouvrir ici. `true` = le clic est traité, le lien ne doit pas naviguer. */
  const cliquerMenu = useCallback((path: string, e: { ctrlKey: boolean; metaKey: boolean }) => {
    if (e.ctrlKey || e.metaKey) { ouvrir(path); return true; }
    const { onglets, actif } = etatRef.current;
    const ici = onglets.find(o => o.id === actif);
    if (ici && memePage(ici.location, path)) return false;
    const autre = onglets.find(o => o.id !== actif && memePage(o.location, path));
    if (!autre) return false;
    basculer(autre.id);
    return true;
  }, [ouvrir, basculer]);

  return { ...etat, basculer, ouvrir, fermer, deplacer, nommer, cliquerMenu };
}

export type OngletsApi = ReturnType<typeof useOnglets>;
