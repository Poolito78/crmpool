import { Suspense, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Routes, UNSAFE_NavigationContext, type Navigator, type To } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { OngletContext, type OngletCtx } from '@/hooks/useOnglet';
import type { Onglet } from '@/lib/onglets';

/* Un onglet du CRM : ses routes rendues à SON adresse, montées en permanence,
 * cachées quand il ne l'est pas (`lib/onglets.ts`).
 *
 * La page croit être seule : `useLocation` lui rend l'adresse de l'onglet
 * (`<Routes location>`), et `useNavigate` passe par un navigateur propre à
 * l'onglet — actif, il agit sur l'historique du navigateur ; caché, il ne
 * déplace que l'onglet, sans quoi un `<Navigate>` ou un `setSearchParams`
 * d'effet changerait la page affichée à côté.
 *
 * C'est l'onglet, et non `<main>`, qui défile : chacun garde sa position. */

type Props = {
  onglet: Onglet;
  actif: boolean;
  routes: ReactNode;
  deplacer: (id: string, to: To, state: unknown) => void;
  nommer: (id: string, titre: string | null) => void;
};

export default function PageOnglet({ onglet, actif, routes, deplacer, nommer }: Props) {
  const nav = useContext(UNSAFE_NavigationContext);
  const actifRef = useRef(actif);
  actifRef.current = actif;
  const id = onglet.id;

  const navigateur = useMemo<Navigator>(() => {
    const n = nav.navigator;
    return {
      createHref: to => n.createHref(to),
      encodeLocation: n.encodeLocation ? to => n.encodeLocation!(to) : undefined,
      go: delta => { if (actifRef.current) n.go(delta); },
      push: (to, state, opts) => { if (actifRef.current) n.push(to, state, opts); else deplacer(id, to, state); },
      replace: (to, state, opts) => { if (actifRef.current) n.replace(to, state, opts); else deplacer(id, to, state); },
    };
  }, [nav.navigator, deplacer, id]);
  const navCtx = useMemo(() => ({ ...nav, navigator: navigateur }), [nav, navigateur]);

  // Élément créé une fois : les dialogues s'y rendent dès le premier rendu,
  // avant même qu'il soit accroché à l'onglet.
  const [conteneur] = useState(() => document.createElement('div'));
  const ancre = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    ancre.current?.appendChild(conteneur);
    return () => conteneur.remove();
  }, [conteneur]);

  const nommerCeluiCi = useCallback((titre: string | null) => nommer(id, titre), [nommer, id]);
  const ctx = useMemo<OngletCtx>(
    () => ({ id, actif, conteneur, nommer: nommerCeluiCi }),
    [id, actif, conteneur, nommerCeluiCi],
  );

  return (
    <div
      data-onglet={id}
      className={cn(
        'relative flex-1 flex flex-col min-h-0 px-4 md:px-6 pt-2 md:pt-2 pb-20 md:pb-6 overflow-x-hidden',
        !actif && 'hidden',
      )}
    >
      <UNSAFE_NavigationContext.Provider value={navCtx}>
        <OngletContext.Provider value={ctx}>
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          }>
            <Routes location={onglet.location}>{routes}</Routes>
          </Suspense>
        </OngletContext.Provider>
      </UNSAFE_NavigationContext.Provider>
      <div ref={ancre} className="contents" />
    </div>
  );
}
