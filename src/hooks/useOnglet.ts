import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react';

/* L'onglet qui porte une page (onglets du CRM : `lib/onglets.ts`).
 *
 * Les dialogues de `components/ui` le lisent pour trois choses :
 * - se rendre dans `conteneur`, caché avec l'onglet — rendus dans <body>, ils
 *   resteraient affichés par-dessus l'onglet voisin ;
 * - ne plus être MODAUX quand l'onglet est caché : un dialogue modal fige le
 *   clic (`pointer-events: none` sur <body>) et la molette de toute la page,
 *   onglet voisin compris ;
 * - ne pas se fermer sur un clic ou une touche Échap de l'onglet voisin, ni
 *   sur un clic dans la barre d'onglets (`gardesOnglet`).
 *
 * Passer de modal à non modal remonte le contenu du dialogue (Radix rend deux
 * composants distincts) : `useDefilementConserve` lui rend ses défilements au
 * retour sur l'onglet — la ligne 30 du devis, pas le haut de la liste. */

export type OngletCtx = {
  id: string;
  actif: boolean;
  /** Où se rendent les dialogues de la page : caché avec l'onglet. */
  conteneur: HTMLElement;
  /** Précise le libellé de l'onglet (« Devis · DEV-2026-134 »), `null` l'efface. */
  nommer: (titre: string | null) => void;
};

export const OngletContext = createContext<OngletCtx | null>(null);

/** `null` hors des onglets (dialogues de la coquille, page publique). */
export const useOnglet = () => useContext(OngletContext);

/** Un clic dans la barre d'onglets n'est pas un clic « à l'extérieur » d'un dialogue. */
export const ATTR_BARRE_ONGLETS = 'data-barre-onglets';

export function dansBarreOnglets(cible: EventTarget | null): boolean {
  return cible instanceof Element && !!cible.closest(`[${ATTR_BARRE_ONGLETS}]`);
}

/** La page nomme son onglet tant qu'elle est montée avec ce titre. */
export function useTitreOnglet(titre: string | null | undefined) {
  const nommer = useOnglet()?.nommer;
  useEffect(() => {
    if (!nommer) return;
    nommer(titre || null);
    return () => nommer(null);
  }, [nommer, titre]);
}

type EvenementExterieur = { target: EventTarget | null; preventDefault(): void };

/** Gestionnaires « clic extérieur » et « Échap » d'un contenu de dialogue,
 *  neutralisés quand l'onglet est caché ou que le clic vise la barre d'onglets. */
export function gardesOnglet<E extends EvenementExterieur>(
  actif: boolean,
  props: { onInteractOutside?: (e: E) => void; onEscapeKeyDown?: (e: KeyboardEvent) => void },
) {
  return {
    onInteractOutside: (e: E) => {
      if (!actif || dansBarreOnglets(e.target)) { e.preventDefault(); return; }
      props.onInteractOutside?.(e);
    },
    onEscapeKeyDown: (e: KeyboardEvent) => {
      if (!actif) { e.preventDefault(); return; }
      props.onEscapeKeyDown?.(e);
    },
  };
}

type Defilement = [rang: number, haut: number, gauche: number];

function lireDefilements(racine: HTMLElement): Defilement[] {
  const r: Defilement[] = [];
  [racine, ...Array.from(racine.querySelectorAll<HTMLElement>('*'))].forEach((n, i) => {
    if (n.scrollTop || n.scrollLeft) r.push([i, n.scrollTop, n.scrollLeft]);
  });
  return r;
}

function appliquerDefilements(racine: HTMLElement, d: Defilement[]) {
  const tous = [racine, ...Array.from(racine.querySelectorAll<HTMLElement>('*'))];
  for (const [i, haut, gauche] of d) {
    const n = tous[i];
    if (n) { n.scrollTop = haut; n.scrollLeft = gauche; }
  }
}

/** Défilements d'un contenu remonté au changement d'onglet. Rend la ref à
 *  poser sur l'élément racine du contenu. */
export function useDefilementConserve(actif: boolean) {
  const noeud = useRef<HTMLElement | null>(null);
  const memo = useRef<Defilement[] | null>(null);
  const avant = useRef(actif);
  // Lu PENDANT le rendu : c'est le dernier moment où l'ancien contenu, visible,
  // est encore dans le DOM. Caché, il ne mesure plus rien.
  if (avant.current && !actif && noeud.current) memo.current = lireDefilements(noeud.current);
  avant.current = actif;
  useLayoutEffect(() => {
    const d = memo.current;
    if (!actif || !d) return;
    memo.current = null;
    const appliquer = () => { if (noeud.current) appliquerDefilements(noeud.current, d); };
    appliquer();
    // Une partie du contenu se rend après coup (listes, images) : on repasse.
    const r = requestAnimationFrame(appliquer);
    return () => cancelAnimationFrame(r);
  }, [actif]);
  return noeud;
}
