import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatMontant, prixMessagerie, type GrilleMessagerie } from '@/lib/store';
import { normaliserDept } from '@/lib/transportFournisseur';

/**
 * Grille MESSAGERIE d'un fournisseur (colis) : un prix par zone et tranche
 * de poids, la zone de chaque département, et un calcul rapide
 * « département + poids ». Lecture seule — la grille se remplace en
 * redéposant le tarif dans l'analyse de document.
 */
export default function GrilleMessagerieTable({ grille }: { grille: GrilleMessagerie }) {
  const [dept, setDept] = useState('');
  const [kg, setKg] = useState('');
  const d = normaliserDept(dept);
  const poids = parseFloat(kg.replace(',', '.')) || 0;
  const calcul = d && poids > 0 ? prixMessagerie(grille, d, poids) : null;
  const parZone = new Map<string, string[]>();
  for (const [dp, z] of Object.entries(grille.departements)) parZone.set(z, [...(parZone.get(z) ?? []), dp]);

  return (
    <div className="space-y-2 text-xs">
      <p className="text-muted-foreground">
        {grille.titre ?? 'Grille messagerie'}
        {grille.depart ? ` · départ ${grille.depart}` : ''}
        {grille.validite ? ` · validité ${grille.validite}` : ''}
        {` · ${grille.zones.length} zones, ${grille.tranches[0]?.min ?? 0} à ${grille.tranches[grille.tranches.length - 1]?.max ?? 0} kg`}
        {grille.supplementParEnvoi ? ` · + ${formatMontant(grille.supplementParEnvoi)} par envoi (compté)` : ''}
      </p>
      {grille.conditions?.length ? (
        <ul className="text-muted-foreground list-disc pl-4">
          {grille.conditions.map(c => <li key={c}>{c}</li>)}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">Prix pour le dépt</span>
        <Input className="h-7 w-16 text-xs" value={dept} maxLength={3} onChange={e => setDept(e.target.value)} placeholder="13" />
        <Input className="h-7 w-16 text-xs" value={kg} onChange={e => setKg(e.target.value)} placeholder="kg" />
        <span className="text-muted-foreground">kg →</span>
        <span className="font-semibold">
          {!d || !(poids > 0) ? '—' : calcul
            ? `${formatMontant(calcul.prix)} HT (zone ${calcul.zone}, ${calcul.tranche.min} à ${calcul.tranche.max} kg)`
            : grille.departements[d] ? 'hors tranches' : 'dépt sans zone'}
        </span>
      </div>

      <div className="max-h-72 overflow-auto rounded border border-border">
        <table className="w-full">
          <thead>
            <tr className="text-left">
              <th className="sticky top-0 z-10 bg-muted px-2 py-1">Zone</th>
              {grille.tranches.map(t => (
                <th key={t.min} className="sticky top-0 z-10 bg-muted px-2 py-1 text-right whitespace-nowrap">{t.min}-{t.max} kg</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grille.zones.map(z => (
              <tr key={z.zone} className="border-t border-border">
                <td className="px-2 py-0.5 whitespace-nowrap" title={(parZone.get(z.zone) ?? []).sort().join(', ')}>
                  {z.zone === 'CORSE' ? 'Corse' : `Zone ${z.zone}`}
                </td>
                {z.prix.map((p, i) => (
                  <td key={i} className="px-2 py-0.5 text-right tabular-nums">{p != null ? formatMontant(p) : '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details>
        <summary className="cursor-pointer text-muted-foreground">Départements par zone ({Object.keys(grille.departements).length})</summary>
        <ul className="mt-1 space-y-0.5">
          {grille.zones.map(z => (
            <li key={z.zone}>
              <span className="font-medium">{z.zone === 'CORSE' ? 'Corse' : `Zone ${z.zone}`} :</span>{' '}
              {(parZone.get(z.zone) ?? []).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })).join(', ') || '—'}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
