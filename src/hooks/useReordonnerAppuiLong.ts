import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

/* Réordonner par APPUI LONG puis glisser — souris comme doigt.
 *
 * L'appui long est ce qui sépare le déplacement du clic : une entrée du menu
 * est un lien, un appui bref doit toujours naviguer, et un glisser immédiat
 * empêcherait de faire défiler le menu au doigt. L'appui est donc armé
 * pendant DELAI_MS ; bouger de plus de TOLERANCE_PX avant, c'est défiler ou
 * cliquer, et l'appui tombe.
 *
 * Les éléments déplaçables portent `data-reordre-liste` et `data-reordre-cle`.
 * La cible se lit sous le pointeur (`elementFromPoint`) : l'élément le plus
 * profond dont la liste est ACCEPTÉE pour l'entrée déplacée (`accepte` ; par
 * défaut sa propre liste seulement). Une page passe ainsi d'un groupe à
 * l'autre ou au premier niveau ; un groupe, lui, ne quitte pas le premier.
 *
 * La moitié de la cible où se trouve le pointeur dit où poser : avant (haut)
 * ou après (bas). `deplacer` doit ne rien changer quand l'entrée y est déjà —
 * c'est ce qui empêche deux entrées de hauteurs différentes de s'échanger
 * sans fin. `flushSync` rend chaque déplacement avant le mouvement suivant,
 * qui mesure donc le DOM à jour.
 *
 * S'ATTARDER sur un en-tête `data-reordre-conteneur` (un groupe du menu)
 * pendant DELAI_ENTREE_MS appelle `entrer` : le groupe s'ouvre et l'entrée y
 * passe — seul moyen d'atteindre un groupe replié.
 *
 * Le clic qui suit le lâcher est avalé : sans cela, lâcher sur un lien
 * naviguerait, lâcher sur un groupe le replierait. */

const DELAI_MS = 450;
const TOLERANCE_PX = 8;
const DELAI_ENTREE_MS = 600;

export type Glisse = { liste: string; cle: string };

type Options = {
  /** Pose `cle` dans `liste`, avant ou après `vers`. */
  deplacer: (cle: string, liste: string, vers: string, apres: boolean) => void;
  /** L'entrée s'est attardée sur l'en-tête de `conteneur`. */
  entrer?: (cle: string, conteneur: string) => void;
  /** `glisse` peut-elle être posée dans `liste` ? */
  accepte?: (glisse: Glisse, liste: string) => boolean;
  terminer: () => void;
};

const dejaPris = new WeakSet<Event>();

export function useReordonnerAppuiLong(options: Options) {
  const [glisse, setGlisse] = useState<Glisse | null>(null);
  const opts = useRef(options);
  opts.current = options;
  /** Appui armé, pas encore long : de quoi l'annuler. */
  const appui = useRef<(() => void) | null>(null);

  useEffect(() => () => appui.current?.(), []);

  useEffect(() => {
    if (!glisse) return;
    const { cle } = glisse;
    const accepte = (liste: string | undefined) =>
      liste !== undefined && (opts.current.accepte ? opts.current.accepte(glisse, liste) : liste === glisse.liste);
    let attente: { conteneur: string; timer: number } | null = null;
    const finAttente = () => { if (attente) window.clearTimeout(attente.timer); attente = null; };

    const bouger = (e: PointerEvent) => {
      const sous = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;

      const conteneur = sous?.closest<HTMLElement>('[data-reordre-conteneur]')?.dataset.reordreConteneur;
      if (conteneur && opts.current.entrer && accepte(conteneur)) {
        if (attente?.conteneur !== conteneur) {
          finAttente();
          attente = {
            conteneur,
            timer: window.setTimeout(() => flushSync(() => opts.current.entrer!(cle, conteneur)), DELAI_ENTREE_MS),
          };
        }
      } else finAttente();

      let cible = sous?.closest<HTMLElement>('[data-reordre-cle]') ?? null;
      while (cible && !accepte(cible.dataset.reordreListe)) {
        cible = cible.parentElement?.closest<HTMLElement>('[data-reordre-cle]') ?? null;
      }
      const vers = cible?.dataset.reordreCle;
      if (!cible || !vers || vers === cle) return;
      const r = cible.getBoundingClientRect();
      const apres = e.clientY > r.top + r.height / 2;
      flushSync(() => opts.current.deplacer(cle, cible!.dataset.reordreListe!, vers, apres));
    };

    const lacher = () => {
      finAttente();
      setGlisse(null);
      const avaler = (ev: MouseEvent) => { ev.preventDefault(); ev.stopPropagation(); };
      window.addEventListener('click', avaler, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', avaler, true), 300);
      opts.current.terminer();
    };

    // Au doigt, le glisser ferait défiler le menu (et annulerait le pointeur).
    const bloquerDefilement = (e: TouchEvent) => e.preventDefault();

    window.addEventListener('pointermove', bouger);
    window.addEventListener('pointerup', lacher);
    window.addEventListener('pointercancel', lacher);
    window.addEventListener('touchmove', bloquerDefilement, { passive: false });
    document.body.style.cursor = 'grabbing';
    return () => {
      finAttente();
      window.removeEventListener('pointermove', bouger);
      window.removeEventListener('pointerup', lacher);
      window.removeEventListener('pointercancel', lacher);
      window.removeEventListener('touchmove', bloquerDefilement);
      document.body.style.cursor = '';
    };
  }, [glisse]);

  /** Props à poser sur un élément déplaçable de `liste`. */
  const poignee = useCallback((liste: string, cle: string) => ({
    'data-reordre-liste': liste,
    'data-reordre-cle': cle,
    onPointerDown: (e: React.PointerEvent) => {
      // Listes imbriquées (pages dans un groupe) : l'appui revient au plus
      // profond, le groupe parent ne doit pas le reprendre en remontant.
      if (e.button !== 0 || !e.isPrimary || dejaPris.has(e.nativeEvent)) return;
      dejaPris.add(e.nativeEvent);
      appui.current?.();
      const x0 = e.clientX, y0 = e.clientY;
      const bouge = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > TOLERANCE_PX) annuler();
      };
      const timer = window.setTimeout(() => {
        annuler();
        navigator.vibrate?.(30);
        setGlisse({ liste, cle });
      }, DELAI_MS);
      function annuler() {
        window.clearTimeout(timer);
        window.removeEventListener('pointermove', bouge);
        window.removeEventListener('pointerup', annuler);
        window.removeEventListener('pointercancel', annuler);
        appui.current = null;
      }
      window.addEventListener('pointermove', bouge);
      window.addEventListener('pointerup', annuler);
      window.addEventListener('pointercancel', annuler);
      appui.current = annuler;
    },
    // L'appui long au doigt ouvrirait le menu contextuel du lien.
    onContextMenu: (e: React.MouseEvent) => { if (appui.current || glisse) e.preventDefault(); },
  }), [glisse]);

  return { glisse, poignee };
}
