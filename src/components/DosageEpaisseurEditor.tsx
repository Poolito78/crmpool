import { useState } from 'react';
import { Plus, Trash } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputNombre } from '@/components/InputNombre';
import { consommationsParPalier, type DosageEpaisseur, type PalierDosage, type RatioCharge } from '@/lib/dosageEpaisseur';
import type { ConsoUsage } from '@/lib/store';

/**
 * La conso selon l'épaisseur : conso par mm (kg/m², et kg/ml pour les lignes
 * au mètre linéaire). Un produit simple (Flowbuild Cove F) s'arrête là ; un
 * mortier chargé (Flowfast F1 Mortar) ajoute un palier par épaisseur minimale,
 * avec les granulats à ajouter par kit. Avec des ratios de charge (1:5,
 * 1:7…), chaque ratio porte sa conso par mm et la ligne du devis choisit. Le devis demande l'épaisseur sur la
 * ligne et en tire la conso (`dosageEpaisseur.ts`).
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
  // Ouvert dès qu'il y a quelque chose à montrer ; « Retirer » vide le dosage (enregistré à null).
  const [ouvert, setOuvert] = useState(() => !!d && (d.kgM2ParMm > 0 || !!d.kgMlParMm || d.paliers.length > 0 || !!d.ratios?.length));
  const vide: DosageEpaisseur = { kgM2ParMm: 0, paliers: [] };
  const majPaliers = (f: (ps: PalierDosage[]) => PalierDosage[]) =>
    onChange({ ...(d ?? vide), paliers: f(d?.paliers ?? []) });
  const majRatios = (f: (rs: RatioCharge[]) => RatioCharge[]) => {
    const ratios = f(d?.ratios ?? []);
    onChange({ ...(d ?? vide), ratios: ratios.length ? ratios : undefined });
  };
  const majRatio = (i: number, x: Partial<RatioCharge>) => majRatios(rs => rs.map((r, j) => (j === i ? { ...r, ...x } : r)));
  const avecRatios = !!d?.ratios?.length;
  const majPalier = (i: number, f: (p: PalierDosage) => PalierDosage) => majPaliers(ps => ps.map((p, j) => (j === i ? f(p) : p)));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Consommation selon l'épaisseur (kg/m²/mm)</Label>
        {ouvert ? (
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => majRatios(rs => [...rs, { libelle: '', kgM2ParMm: 0 }])}
              className="text-xs text-primary hover:underline flex items-center gap-1"
              title="La conso par mm dépend de la charge gâchée (1:5, 1:7…) : le devis fait choisir le ratio"><Plus className="h-3 w-3" /> Ratio de charge</button>
            <button type="button" onClick={() => majPaliers(ps => [...ps, { epaisseurMinMm: 0, ajouts: [] }])}
              className="text-xs text-primary hover:underline flex items-center gap-1"
              title="Mortier chargé : granulats ajoutés par kit à partir d'une épaisseur"><Plus className="h-3 w-3" /> Palier de granulats</button>
            <button type="button" onClick={() => { onChange(vide); setOuvert(false); }}
              className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"><Trash className="h-3 w-3" /> Retirer</button>
          </div>
        ) : (
          <button type="button" onClick={() => { if (!d) onChange(vide); setOuvert(true); }}
            className="text-xs text-primary hover:underline flex items-center gap-1"
            title="La conso dépend de l'épaisseur : le devis demandera l'épaisseur en mm sur la ligne"><Plus className="h-3 w-3" /> Conso. par mm d'épaisseur</button>
        )}
      </div>
      {ouvert && d && (
        <div className="rounded-lg border border-border p-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Avec des ratios, la conso de base ne sert plus : chaque ratio porte la sienne. */}
            {!avecRatios && <>
              <span className="text-muted-foreground shrink-0">Conso.{d.paliers.length ? ' du mélange' : ''}</span>
              <div className="w-24"><InputNombre decimales={3} value={d.kgM2ParMm} onChange={v => onChange({ ...d, kgM2ParMm: v })} /></div>
              <span className="text-muted-foreground shrink-0">kg/m² par mm</span>
              <div className="w-24"><InputNombre decimales={3} value={d.kgMlParMm} onChange={v => onChange({ ...d, kgMlParMm: v || undefined })} placeholder="facultatif" /></div>
              <span className="text-muted-foreground shrink-0" title="Pour les lignes au mètre linéaire (gorges, plinthes…)">kg/ml par mm</span>
            </>}
            <Input value={d.source ?? ''} onChange={e => onChange({ ...d, source: e.target.value || undefined })} placeholder="Source (fiche, date)" className="h-8 text-xs flex-1 min-w-[140px]" />
          </div>
          {avecRatios && (
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Conso. par ratio de charge (le premier est proposé par défaut sur le devis)</span>
              {d.ratios!.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                  <Input value={r.libelle} onChange={e => majRatio(i, { libelle: e.target.value })} placeholder="1:5" className="h-8 text-sm w-20" />
                  <div className="w-24"><InputNombre decimales={3} value={r.kgM2ParMm} onChange={v => majRatio(i, { kgM2ParMm: v })} /></div>
                  <span className="text-muted-foreground shrink-0">kg/m² par mm</span>
                  <div className="w-24"><InputNombre decimales={3} value={r.kgMlParMm} onChange={v => majRatio(i, { kgMlParMm: v || undefined })} placeholder="facultatif" /></div>
                  <span className="text-muted-foreground shrink-0" title="Pour les lignes au mètre linéaire (gorges, plinthes…)">kg/ml par mm</span>
                  <button type="button" title="Retirer ce ratio" onClick={() => majRatios(rs => rs.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"><Trash className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
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
          {d.paliers.length > 0 && <div className="flex items-center justify-between border-t border-border pt-1.5 text-[11px]">
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
          </div>}
        </div>
      )}
    </div>
  );
}
