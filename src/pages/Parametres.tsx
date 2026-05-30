import { LayoutDashboard, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  DASHBOARD_TILES,
  type DashboardTileDef,
  useHiddenTiles,
  toggleTile,
  setHiddenTiles,
  showAllTiles,
} from '@/lib/dashboardSettings';

export default function Parametres() {
  const hidden = useHiddenTiles();

  // Groupes dans l'ordre d'apparition
  const groups = DASHBOARD_TILES.reduce<Record<string, DashboardTileDef[]>>((acc, t) => {
    (acc[t.group] ||= []).push(t);
    return acc;
  }, {});
  const groupOrder = ['Indicateurs', 'Alertes', 'Encours fin de mois', 'Panneaux'];

  const visibleCount = DASHBOARD_TILES.length - hidden.size;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* En-tête section Tableau de bord */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-primary" />
            Tableau de bord
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setHiddenTiles(DASHBOARD_TILES.map(t => t.id))}>
              <EyeOff className="w-4 h-4 mr-1.5" /> Tout masquer
            </Button>
            <Button variant="outline" size="sm" onClick={showAllTiles}>
              <RotateCcw className="w-4 h-4 mr-1.5" /> Tout afficher
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Choisissez les tuiles à afficher sur le tableau de bord.{' '}
          <span className="font-medium text-foreground">{visibleCount}</span> / {DASHBOARD_TILES.length} visibles.
        </p>
      </div>

      {/* Groupes de tuiles */}
      {groupOrder.filter(g => groups[g]).map(group => (
        <div key={group} className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{group}</h3>
          <div className="space-y-1">
            {groups[group].map(tile => {
              const visible = !hidden.has(tile.id);
              return (
                <label
                  key={tile.id}
                  htmlFor={`tile-${tile.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-2.5 text-sm">
                    {visible
                      ? <Eye className="w-4 h-4 text-primary shrink-0" />
                      : <EyeOff className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <span className={visible ? '' : 'text-muted-foreground'}>{tile.label}</span>
                  </span>
                  <Switch
                    id={`tile-${tile.id}`}
                    checked={visible}
                    onCheckedChange={() => toggleTile(tile.id)}
                  />
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
