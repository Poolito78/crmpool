import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ATTR_BARRE_ONGLETS } from '@/hooks/useOnglet';
import type { OngletsApi } from '@/hooks/useOnglets';
import type { Onglet } from '@/lib/onglets';

/* La barre d'onglets, au-dessus du bandeau titre (`lib/onglets.ts`).
 *
 * Elle passe AU-DESSUS du voile des dialogues (z-[51] contre z-50) et reprend
 * le pointeur que le dialogue modal retire à <body> : on quitte un devis
 * ouvert pour le catalogue sans le fermer. Les dialogues ignorent les clics
 * qui la visent (`ATTR_BARRE_ONGLETS`, `gardesOnglet`).
 *
 * Clic : basculer. Clic molette ou croix : fermer. « + » : nouvel onglet sur
 * le tableau de bord. */

type Props = {
  onglets: OngletsApi;
  libelle: (o: Onglet) => { libelle: string; icon: React.ComponentType<{ className?: string }> };
};

export default function BarreOnglets({ onglets: api, libelle }: Props) {
  const seul = api.onglets.length === 1;
  return (
    <div
      {...{ [ATTR_BARRE_ONGLETS]: '' }}
      role="tablist"
      className="hidden md:flex relative z-[51] pointer-events-auto shrink-0 h-9 items-end gap-0.5 px-2 bg-muted border-b border-border"
    >
      {api.onglets.map(o => {
        const actif = o.id === api.actif;
        const { libelle: nom, icon: Icone } = libelle(o);
        const complet = o.titre ? `${nom} · ${o.titre}` : nom;
        return (
          <div
            key={o.id}
            role="tab"
            aria-selected={actif}
            title={complet}
            onClick={() => api.basculer(o.id)}
            onMouseDown={e => { if (e.button === 1) e.preventDefault(); }}
            onAuxClick={e => { if (e.button === 1) { e.preventDefault(); api.fermer(o.id, complet); } }}
            className={cn(
              'group relative flex items-center gap-1.5 h-8 min-w-0 flex-1 max-w-[220px] pl-3 pr-1.5 rounded-t-lg text-xs cursor-pointer select-none transition-colors',
              actif
                ? 'bg-card text-foreground font-medium border border-b-0 border-border -mb-px h-[33px]'
                : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
            )}
          >
            <Icone className={cn('w-3.5 h-3.5 shrink-0', actif ? 'text-primary' : 'opacity-70')} />
            <span className="min-w-0 flex-1 truncate">
              {nom}
              {o.titre && <span className="text-muted-foreground font-normal"> · {o.titre}</span>}
            </span>
            {!seul && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); api.fermer(o.id, complet); }}
                title="Fermer l'onglet (clic molette)"
                className={cn(
                  'shrink-0 rounded p-0.5 hover:bg-muted-foreground/15',
                  actif ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-70 hover:!opacity-100',
                )}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => api.ouvrir('/')}
        title="Nouvel onglet (Ctrl+clic sur une entrée du menu pour l'ouvrir en onglet)"
        className="shrink-0 mb-1 ml-0.5 rounded-md p-1 text-muted-foreground hover:bg-background/70 hover:text-foreground"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
