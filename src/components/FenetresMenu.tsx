import { useState } from 'react';
import { AppWindow, ArrowRightLeft, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { useFenetres } from '@/hooks/useFenetres';

/* Le sélecteur de fenêtres du menu latéral : les fenêtres CRM ouvertes (clic =
 * basculer, flèche = y afficher la page courante) et l'ouverture d'une page
 * dans une nouvelle fenêtre. L'état vient de `useFenetres`, tenu par la
 * coquille pour que les raccourcis Alt+1…9 / Alt+N marchent menu fermé. */

type Props = {
  fenetres: ReturnType<typeof useFenetres>;
  pages: { label: string; path: string; icon: React.ComponentType<{ className?: string }> }[];
  pageCourante: string;
  libelleCourant: string;
  collapsed: boolean;
};

export default function FenetresMenu({ fenetres: f, pages, pageCourante, libelleCourant, collapsed }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const n = f.fenetres.length;

  return (
    <Popover open={ouvert} onOpenChange={v => { setOuvert(v); if (v) f.rafraichir(); }}>
      <PopoverTrigger asChild>
        <button
          title="Fenêtres (Alt+1…9 pour basculer, Alt+N pour en ouvrir une)"
          className={cn(
            'relative rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-150',
            collapsed ? 'flex items-center justify-center w-10 h-10 mx-auto' : 'flex items-center gap-3 px-3 py-2.5 w-full',
          )}
        >
          <AppWindow className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="flex-1 text-left">Fenêtres</span>}
          {n > 1 && (
            <span className={cn(
              'rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-[10px] font-semibold leading-none px-1.5 py-0.5',
              collapsed && 'absolute -top-0.5 -right-0.5',
            )}>
              {n}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" sideOffset={12} className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <p className="text-sm font-semibold">Fenêtres ouvertes</p>
          <button
            onClick={() => { f.nouvelle(pageCourante); setOuvert(false); }}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            title="Ouvrir la page courante dans une nouvelle fenêtre (Alt+N)"
          >
            <Plus className="w-3.5 h-3.5" /> Nouvelle
          </button>
        </div>

        <ul className="py-1 max-h-64 overflow-y-auto">
          {f.fenetres.map((w, i) => {
            const ici = w.jeton === f.monJeton;
            return (
              <li key={w.jeton} className="group flex items-center gap-1 px-1">
                <button
                  disabled={ici}
                  onClick={() => { f.basculer(w); setOuvert(false); }}
                  className={cn(
                    'flex-1 min-w-0 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                    ici ? 'cursor-default' : 'hover:bg-muted',
                  )}
                  title={ici ? undefined : `Basculer vers « ${w.libelle} »`}
                >
                  <kbd className="shrink-0 w-5 text-center rounded border bg-muted text-[10px] font-mono text-muted-foreground">
                    {i < 9 ? i + 1 : '·'}
                  </kbd>
                  <span className="min-w-0 truncate font-medium">{w.libelle}</span>
                  {ici && <span className="shrink-0 text-[11px] text-muted-foreground">cette fenêtre</span>}
                  {!ici && w.racine !== f.maRacine && (
                    <span
                      className="shrink-0 text-[11px] text-amber-600"
                      title="Ouverte hors du CRM (barre des tâches) : le navigateur ne laisse pas la mettre au premier plan. Alt+Tab, ou fermez-la et rouvrez la page d'ici."
                    >
                      indépendante
                    </span>
                  )}
                  {!ici && w.active && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500" title="Au premier plan" />}
                </button>
                {!ici && (
                  <button
                    onClick={() => { f.envoyer(w, pageCourante); setOuvert(false); }}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-muted hover:text-foreground"
                    title={`Afficher « ${libelleCourant} » dans cette fenêtre`}
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className="border-t px-3 pt-2 pb-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
            Ouvrir dans une nouvelle fenêtre
          </p>
          <div className="grid grid-cols-2 gap-1">
            {pages.map(p => (
              <button
                key={p.path}
                onClick={() => { f.nouvelle(p.path); setOuvert(false); }}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-left hover:bg-muted min-w-0"
              >
                <p.icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{p.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Alt+1…9 : basculer · Alt+N : nouvelle fenêtre · Maj+clic sur le menu : ouvrir à côté
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
