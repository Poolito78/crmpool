import { Building2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSocietes, TOUTES } from '@/hooks/useSocietes';

/**
 * Société active, dans l'en-tête. L'administrateur choisit (ou « Toutes ») ;
 * un autre compte voit sa société, sans choix. Rien n'est affiché tant
 * qu'une seule société existe.
 */
export default function SocieteSelecteur() {
  const { societes, active, toutes, choisir, peutChoisir, maSociete } = useSocietes();
  const actives = societes.filter(s => s.actif);
  if (actives.length < 2) return null;

  if (!peutChoisir) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium">
        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />{maSociete?.raisonSociale}
      </span>
    );
  }
  return (
    <Select value={toutes ? TOUTES : active?.id} onValueChange={choisir}>
      <SelectTrigger className="h-8 w-auto min-w-[9rem] shrink-0 text-xs gap-1.5" title="Société active : documents affichés et société des nouveaux documents">
        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TOUTES}>Toutes les sociétés</SelectItem>
        {actives.map(s => <SelectItem key={s.id} value={s.id}>{s.raisonSociale}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
