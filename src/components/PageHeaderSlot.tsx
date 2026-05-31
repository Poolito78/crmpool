import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Emplacement d'actions dans le bandeau titre fixe (CRMLayout).
// Le layout rend <PageHeaderSlotTarget /> à droite du titre ; chaque page peut
// y injecter ses contrôles (recherche, boutons d'action) via <PageHeaderSlot>.
// Convention : les vues tableau placent ici la barre de recherche et le bouton
// d'action principal pour qu'ils restent visibles lors du scroll.

export const PAGE_HEADER_SLOT_ID = 'page-header-slot';

export function PageHeaderSlotTarget() {
  return <div id={PAGE_HEADER_SLOT_ID} className="flex-1 flex items-center gap-3 min-w-0" />;
}

export default function PageHeaderSlot({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setEl(document.getElementById(PAGE_HEADER_SLOT_ID));
    return () => setEl(null);
  }, []);
  return el ? createPortal(children, el) : null;
}
