import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Conteneur générique : un déclencheur (trigger) + un panneau (panel) rendu via
// portail en position fixe, ancré sous le déclencheur. Le panneau échappe ainsi
// à tout conteneur overflow (ex. tableau scrollable) sans rogner ni forcer le scroll.
export default function FilterPopover({
  trigger,
  children,
  align = 'left',
  width,
  defaultOpen = false,
  onOpenChange,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (props: { close: () => void }) => ReactNode;
  align?: 'left' | 'right';
  width?: number;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const setOpenWrapped = (v: boolean) => { setOpen(v); onOpenChange?.(v); };

  const computePos = () => {
    const a = anchorRef.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    const w = width ?? panelRef.current?.offsetWidth ?? 220;
    let left = align === 'right' ? r.right - w : r.left;
    // garde dans le viewport (8px de marge)
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setPos({ top: r.bottom + 4, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    computePos();
    // recalcul après rendu (largeur réelle du panel)
    const id = requestAnimationFrame(computePos);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => computePos();
    const onDown = (e: MouseEvent) => {
      if (anchorRef.current?.contains(e.target as Node)) return;
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpenWrapped(false);
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('mousedown', onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <span ref={anchorRef} className="inline-flex">
      {trigger({ open, toggle: () => setOpenWrapped(!open) })}
      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width }}
          className="z-[60] bg-card border border-border rounded-lg shadow-xl"
        >
          {children({ close: () => setOpenWrapped(false) })}
        </div>,
        document.body,
      )}
    </span>
  );
}
