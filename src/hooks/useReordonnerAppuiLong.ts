import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

/* Réordonner une liste par APPUI LONG puis glisser — souris comme doigt.
 *
 * L'appui long est ce qui sépare le déplacement du clic : une entrée du menu
 * est un lien, un appui bref doit toujours naviguer, et un glisser immédiat
 * empêcherait de faire défiler le menu au doigt. L'appui est donc armé
 * pendant DELAI_MS ; bouger de plus de TOLERANCE_PX avant, c'est défiler ou
 * cliquer, et l'appui tombe.
 *
 * Les éléments déplaçables portent `data-reordre-liste` et `data-reordre-cle`.
 * La cible se lit sous le pointeur (`elementFromPoint`), en remontant jusqu'à
 * un élément de la MÊME liste : une entrée ne passe jamais d'une liste à
 * l'autre (d'un groupe du menu à un autre).
 *
 * L'échange n'a lieu qu'une fois passé le MILIEU de la cible, dans le sens du
 * mouvement : sans cette hystérésis, un groupe déplié plus haut qu'un lien
 * reviendrait sous le pointeur dès l'échange fait, et les deux entrées
 * s'échangeraient sans fin. `flushSync` rend l'échange avant le mouvement
 * suivant, qui mesure donc le DOM à jour.
 *
 * Le clic qui suit le lâcher est avalé : sans cela, lâcher sur un lien
 * naviguerait, lâcher sur un groupe le replierait. */

const DELAI_MS = 450;
const TOLERANCE_PX = 8;

export type Glisse = { liste: string; cle: string };

const dejaPris = new WeakSet<Event>();

export function useReordonnerAppuiLong(
  deplacer: (liste: string, cle: string, vers: string) => void,
  terminer: (aBouge: boolean) => void,
) {
  const [glisse, setGlisse] = useState<Glisse | null>(null);
  const deplacerRef = useRef(deplacer);
  deplacerRef.current = deplacer;
  const terminerRef = useRef(terminer);
  terminerRef.current = terminer;
  /** Appui armé, pas encore long : de quoi l'annuler. */
  const appui = useRef<(() => void) | null>(null);
  const aBouge = useRef(false);

  useEffect(() => () => appui.current?.(), []);

  useEffect(() => {
    if (!glisse) return;
    const { liste, cle } = glisse;

    const bouger = (e: PointerEvent) => {
      let cible = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)
        ?.closest<HTMLElement>('[data-reordre-cle]') ?? null;
      while (cible && cible.dataset.reordreListe !== liste) {
        cible = cible.parentElement?.closest<HTMLElement>('[data-reordre-cle]') ?? null;
      }
      const vers = cible?.dataset.reordreCle;
      if (!cible || !vers || vers === cle) return;
      // L'élément déplacé, cherché dans le même menu (le menu mobile, caché, a les mêmes clés).
      const source = Array.from(cible.closest('nav')?.querySelectorAll<HTMLElement>('[data-reordre-cle]') ?? [])
        .find(el => el.dataset.reordreListe === liste && el.dataset.reordreCle === cle);
      if (!source) return;
      const r = cible.getBoundingClientRect();
      const milieu = r.top + r.height / 2;
      const descend = source.getBoundingClientRect().top < r.top;
      if (descend ? e.clientY < milieu : e.clientY > milieu) return;
      aBouge.current = true;
      flushSync(() => deplacerRef.current(liste, cle, vers));
    };

    const lacher = () => {
      setGlisse(null);
      const avaler = (ev: MouseEvent) => { ev.preventDefault(); ev.stopPropagation(); };
      window.addEventListener('click', avaler, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', avaler, true), 300);
      terminerRef.current(aBouge.current);
    };

    // Au doigt, le glisser ferait défiler le menu (et annulerait le pointeur).
    const bloquerDefilement = (e: TouchEvent) => e.preventDefault();

    window.addEventListener('pointermove', bouger);
    window.addEventListener('pointerup', lacher);
    window.addEventListener('pointercancel', lacher);
    window.addEventListener('touchmove', bloquerDefilement, { passive: false });
    document.body.style.cursor = 'grabbing';
    return () => {
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
        aBouge.current = false;
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
