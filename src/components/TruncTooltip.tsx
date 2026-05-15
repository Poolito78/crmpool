import { useState, useRef } from 'react';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Props {
  content: string;
  children: React.ReactNode;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * Affiche le texte complet d'un élément tronqué :
 * - PC  : au survol (hover)
 * - Mobile : au tap (touchstart), fermeture auto après 3 s
 */
export default function TruncTooltip({ content, children, className, side = 'top' }: Props) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  function handleTouchStart(e: React.TouchEvent) {
    if (!content) return;
    e.stopPropagation();
    clearTimeout(timerRef.current);
    setOpen(true);
    timerRef.current = setTimeout(() => setOpen(false), 3000);
  }

  if (!content) return <span className={className}>{children}</span>;

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <span className={cn('cursor-default', className)} onTouchStart={handleTouchStart}>
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-sm text-xs break-words z-[9999]">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
