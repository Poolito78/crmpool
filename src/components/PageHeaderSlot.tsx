import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useOnglet } from '@/hooks/useOnglet';

// Emplacement d'actions dans le bandeau titre fixe (CRMLayout).
// Le layout rend <PageHeaderSlotTarget /> à droite du titre ; chaque page peut
// y injecter ses contrôles (recherche, boutons d'action) via <PageHeaderSlot>.
// Convention : les vues tableau placent ici la barre de recherche et le bouton
// d'action principal pour qu'ils restent visibles lors du scroll.
// Un emplacement PAR ONGLET (`lib/onglets.ts`) : la page cachée garde le sien,
// caché avec elle, au lieu de mêler ses boutons à ceux de la page affichée.

export const PAGE_HEADER_SLOT_ID = 'page-header-slot';

const idEmplacement = (onglet?: string) => onglet ? `${PAGE_HEADER_SLOT_ID}-${onglet}` : PAGE_HEADER_SLOT_ID;

export function PageHeaderSlotTarget({ onglets, actif }: { onglets: string[]; actif: string }) {
  return (
    <>
      {onglets.map(id => (
        /* Mobile : largeur du contenu (la barre défile) ; à partir de md, le
           reste de la barre, rétrécissable. */
        <div key={id} id={idEmplacement(id)} className={cn('flex-auto shrink-0 md:flex-1 md:shrink md:min-w-0 flex items-center gap-2 md:gap-3', id !== actif && 'hidden')} />
      ))}
    </>
  );
}

export default function PageHeaderSlot({ children }: { children: ReactNode }) {
  const onglet = useOnglet()?.id;
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setEl(document.getElementById(idEmplacement(onglet)));
    return () => setEl(null);
  }, [onglet]);
  return el ? createPortal(children, el) : null;
}
