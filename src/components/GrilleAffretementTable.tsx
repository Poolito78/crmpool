import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatMontant, type GrilleAffretement } from '@/lib/store';
import { palettesDeLaGrille, prixAffretement } from '@/lib/grilleAffretement';

/**
 * Grille d'affrètement d'un fournisseur : un prix par département et par
 * nombre de palettes, avec un calcul rapide « département + palettes ».
 * Lecture seule — la grille se remplace en redéposant le tarif dans
 * l'analyse de document.
 */
export default function GrilleAffretementTable({ grille }: { grille: GrilleAffretement }) {
  const [filtre, setFiltre] = useState('');
  const [dept, setDept] = useState('');
  const [nb, setNb] = useState('1');
  const colonnes = palettesDeLaGrille(grille);
  const f = filtre.trim().toUpperCase();
  const lignes = f
    ? grille.tarifs.filter(t => t.dept.startsWith(f) || (t.nom ?? '').toUpperCase().includes(f))
    : grille.tarifs;
  const calcul = dept.trim() ? prixAffretement(grille, dept, parseFloat(nb.replace(',', '.')) || 0) : null;

  return (
    <div className="space-y-2 text-xs">
      <p className="text-muted-foreground">
        {grille.titre ?? 'Grille d\'affrètement'}
        {grille.depart ? ` · départ ${grille.depart}` : ''}
        {grille.validite ? ` · validité ${grille.validite}` : ''}
        {` · ${grille.tarifs.length} départements, ${colonnes[0]} à ${colonnes[colonnes.length - 1]} palette(s)`}
      </p>
      {grille.conditions?.length ? (
        <ul className="text-muted-foreground list-disc pl-4">
          {grille.conditions.map(c => <li key={c}>{c}</li>)}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">Prix pour le dépt</span>
        <Input className="h-7 w-16 text-xs" value={dept} maxLength={3} onChange={e => setDept(e.target.value)} placeholder="13" />
        <Input className="h-7 w-14 text-xs" value={nb} onChange={e => setNb(e.target.value)} />
        <span className="text-muted-foreground">palette(s) →</span>
        <span className="font-semibold">
          {!dept.trim() ? '—' : calcul
            ? `${formatMontant(calcul.prix)} HT${calcul.palettes !== Number(nb.replace(',', '.')) ? ` (tarif ${calcul.palettes} pal.)` : ''}`
            : 'hors grille'}
        </span>
        <Input className="h-7 w-40 text-xs ml-auto" value={filtre} onChange={e => setFiltre(e.target.value)} placeholder="Filtrer (n° ou nom)" />
      </div>

      <div className="max-h-72 overflow-auto rounded border border-border">
        <table className="w-full">
          <thead>
            <tr className="text-left">
              <th className="sticky top-0 z-10 bg-muted px-2 py-1">Département</th>
              <th className="sticky top-0 z-10 bg-muted px-2 py-1">Service</th>
              {colonnes.map(n => (
                <th key={n} className="sticky top-0 z-10 bg-muted px-2 py-1 text-right">{n} pal.</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map(t => (
              <tr key={t.dept} className="border-t border-border">
                <td className="px-2 py-0.5 whitespace-nowrap">{t.dept} {t.nom}</td>
                <td className="px-2 py-0.5 text-muted-foreground">{t.service ?? ''}</td>
                {colonnes.map(n => {
                  const p = t.paliers.find(x => x.palettes === n);
                  return <td key={n} className="px-2 py-0.5 text-right tabular-nums">{p ? formatMontant(p.prix) : '—'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
