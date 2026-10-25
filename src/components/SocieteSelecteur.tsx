import { Building2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSocietes, TOUTES } from '@/hooks/useSocietes';
import { cn } from '@/lib/utils';

/**
 * Société active, dans l'en-tête. L'administrateur choisit (ou « Toutes ») ;
 * un autre compte voit sa société, sans choix. Rien n'est affiché tant
 * qu'une seule société existe.
 * Picto seul, pour laisser la place aux actions de la page sur mobile : le nom
 * est dans l'infobulle et dans la liste, et le picto passe en couleur dès
 * qu'une société précise est retenue (plutôt que « Toutes »).
 */
export default function SocieteSelecteur() {
  const { societes, active, toutes, choisir, peutChoisir, maSociete } = useSocietes();
  const actives = societes.filter(s => s.actif);
  if (actives.length < 2) return null;

  if (!peutChoisir) {
    return (
      <span
        className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border"
        title={`Société : ${maSociete?.raisonSociale ?? ''}`}
      >
        <Building2 className="w-4 h-4 text-primary" />
      </span>
    );
  }
  const nom = toutes ? 'Toutes les sociétés' : active?.raisonSociale;
  return (
    <Select value={toutes ? TOUTES : active?.id} onValueChange={choisir}>
      <SelectTrigger
        className="h-8 w-8 shrink-0 justify-center p-0 [&>svg:last-child]:hidden"
        title={`Société active : ${nom ?? ''} — documents affichés et société des nouveaux documents`}
        aria-label={`Société active : ${nom ?? ''}`}
      >
        <Building2 className={cn('w-4 h-4', toutes ? 'text-muted-foreground' : 'text-primary')} />
        <span className="sr-only"><SelectValue /></span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TOUTES}>Toutes les sociétés</SelectItem>
        {actives.map(s => <SelectItem key={s.id} value={s.id}>{s.raisonSociale}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
