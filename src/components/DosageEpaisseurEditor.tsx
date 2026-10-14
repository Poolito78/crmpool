import { Plus, Trash } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputNombre } from '@/components/InputNombre';
import { consommationsParPalier, type DosageEpaisseur, type PalierDosage } from '@/lib/dosageEpaisseur';
import type { ConsoUsage } from '@/lib/store';

/**
 * Le tableau « quantités selon l'épaisseur » d'un mortier (fiche Flowfast F1
 * Mortar) : conso du mélange par mm, puis un palier par épaisseur minimale,
 * avec les granulats à ajouter par kit. Le devis en tire la conso du kit et
 * propose les granulats (`dosageEpaisseur.ts`).
 */
interface Props {
  value?: DosageEpaisseur;
  onChange: (d: DosageEpaisseur | undefined) => void;
  /** Poids du kit (fiche article) : sans lui, la part du kit ne se calcule pas. */
  kitKg?: number;
  /** Remplace les consommations par usage par celles du tableau. */
  onConsommations: (c: ConsoUsage[]) => void;
}

export default function DosageEpaisseurEditor({ value, onChange, kitKg, onConsommations }: Props) {
  const d = value;
  const majPaliers = (f: (ps: PalierDosage[]) => PalierDosage[]) =>
    onChange({ kgM2ParMm: d?.kgM2ParMm ?? 0, ...(d?.source ? { source: d.source } : {}), paliers: f(d?.paliers ?? []) });
  const majPalier = (i: number, f: (p: PalierDosage) => PalierDosage) => majPaliers(ps => ps.map((p, j) => (j === i ? f(p) : p)));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Dosage selon l'épaisseur (mortier chargé)</Label>
        <button type="button" onClick={() => majPaliers(ps => [...ps, { epaisseurMinMm: 0, ajouts: [] }])}
          className="text-xs text-primary hover:underline flex items-center gap-1"><Plus className="h-3 w-3" /> Ajouter un palier</button>
      </div>
      {d && (
        <div className="rounded-lg border border-border p-2 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground shrink-0">Conso. du mélange</span>
            <div className="w-24"><InputNombre decimales={3} value={d.kgM2ParMm} onChange={v => onChange({ ...d, kgM2ParMm: v })} /></div>
            <span className="text-muted-foreground shrink-0">kg/m² par mm</span>
            <Input value={d.source ?? ''} onChange={e => onChange({ ...d, source: e.target.value || undefined })} placeholder="Source (fiche, date)" className="h-8 text-xs flex-1" />
          </div>
          {d.paliers.map((p, i) => (
            <div key={i} className="flex gap-2 items-start border-t border-border pt-2">
              <div className="w-28 shrink-0">
                <span className="text-[11px] text-muted-foreground">À partir de (mm)</span>
                <InputNombre decimales={1} value={p.epaisseurMinMm} onChange={v => majPalier(i, x => ({ ...x, epaisseurMinMm: v }))} />
              </div>
              <div className="flex-1 space-y-1">
                <span className="text-[11px] text-muted-foreground">{p.ajouts.length ? 'Granulats ajoutés par kit' : 'Kit seul'}</span>
                {p.ajouts.map((a, k) => (
                  <div key={k} className="flex items-center gap-1">
                    <Input value={a.libelle} onChange={e => majPalier(i, x => ({ ...x, ajouts: x.ajouts.map((y, m) => (m === k ? { ...y, libelle: e.target.value } : y)) }))}
                      placeholder="Sable de quartz 2-8 mm" className="h-8 text-sm flex-1" />
                    <div className="w-20"><InputNombre decimales={2} value={a.kgParKit} onChange={v => majPalier(i, x => ({ ...x, ajouts: x.ajouts.map((y, m) => (m === k ? { ...y, kgParKit: v } : y)) }))} /></div>
                    <span className="text-xs text-muted-foreground">kg/kit</span>
                    <button type="button" title="Retirer ce granulat" onClick={() => majPalier(i, x => ({ ...x, ajouts: x.ajouts.filter((_, m) => m !== k) }))}
                      className="text-muted-foreground hover:text-destructive"><Trash className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => majPalier(i, x => ({ ...x, ajouts: [...x.ajouts, { libelle: '', kgParKit: 0 }] }))}
                  className="text-[11px] text-primary hover:underline flex items-center gap-0.5"><Plus className="h-3 w-3" /> Granulat</button>
              </div>
              <button type="button" title="Supprimer le palier" onClick={() => majPaliers(ps => ps.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive mt-5"><Trash className="w-4 h-4" /></button>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-border pt-1.5 text-[11px]">
            <span className="text-muted-foreground">
              {kitKg && kitKg > 0 ? `Kit de ${String(kitKg).replace('.', ',')} kg (poids de la fiche)` : 'Renseignez le poids du kit : sans lui, la part du kit ne se calcule pas'}
            </span>
            {kitKg && kitKg > 0 && d.kgM2ParMm > 0 && d.paliers.length > 0 && (
              <button type="button" onClick={() => onConsommations(consommationsParPalier({ ...d, paliers: [...d.paliers].sort((a, b) => a.epaisseurMinMm - b.epaisseurMinMm) }, kitKg))}
                className="text-primary hover:underline"
                title="Remplace les consommations par usage par celle du kit à l'épaisseur minimale de chaque palier">
                Recalculer les consommations par usage
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
