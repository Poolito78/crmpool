import { useState } from 'react';
import { Percent } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { InputNombre } from '@/components/InputNombre';
import { designationProduit, type LigneDevis, type Produit, type UniteSurface } from '@/lib/store';
import { produitParId } from '@/lib/indexProduits';
import { basculerSource, calculerConsoRelative, libelleDosage, PCT_CONSO_RELATIVE_DEFAUT, type ConsoRelative } from '@/lib/consoRelative';

/**
 * Le bouton « % » de la cellule Conso. : la conso de la ligne dosée en
 * pourcentage du poids d'autres lignes (pigment à 10 % de la résine), ou en
 * coefficient (SNLC = × 0,5 le poids du 319) — même calcul, autre saisie. La
 * fenêtre liste les lignes au-dessus, les résines Flowfast du même groupe
 * cochées d'office ; on coche, on décoche, et le choix reste sur la ligne.
 */
interface Props {
  ligne: LigneDevis;
  lignes: LigneDevis[];
  produits: Produit[];
  surfaceGlobaleM2: number;
  uniteSurface?: UniteSurface;
  ligneNums: Record<string, number>;
  onChange: (r: ConsoRelative | null) => void;
}

const kg = (n: number) => `${String(Math.round(n * 100) / 100).replace('.', ',')} kg`;

function Contenu({ ligne, lignes, produits, surfaceGlobaleM2, uniteSurface, ligneNums, onChange }: Props) {
  const actif = !!ligne.consoRelative;
  const enregistre: ConsoRelative = ligne.consoRelative ?? { pct: PCT_CONSO_RELATIVE_DEFAUT };
  /* Le % se SAISIT puis s'APPLIQUE (bouton ou Entrée) : il ne recalcule pas la
     ligne à chaque chiffre tapé. La fenêtre montre ce que donnerait la saisie. */
  const [pct, setPct] = useState(enregistre.pct);
  const [mode, setMode] = useState<ConsoRelative['mode']>(enregistre.mode);
  const { mode: _m, ...sansMode } = enregistre;
  const r: ConsoRelative = { ...sansMode, pct, ...(mode ? { mode } : {}) };
  const coef = mode === 'coef';
  const vues = lignes.map(l => (l.id === ligne.id ? { ...l, consoRelative: r } : l));
  const calc = calculerConsoRelative(vues, ligne.id, produits, surfaceGlobaleM2, uniteSurface);
  if (!calc) return null;
  const pctModifie = actif && (pct !== enregistre.pct || mode !== enregistre.mode);
  const references = (enregistre.produits ?? []).map(id => produitParId(produits, id)).filter((x): x is Produit => !!x).map(x => x.reference);
  const choixManuel = !!(enregistre.inclus?.length || enregistre.exclus?.length);
  const appliquer = (x: ConsoRelative = r) => onChange(x);
  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="font-medium">Conso. en % ou × le poids d'autres lignes</p>
        <p className="text-xs text-muted-foreground">
          Ex. : pigment à 10 % de la résine, SNLC × 0,5 le FLOWFAST 319. {references.length
            ? <>Prises d'office (fiche article) : les lignes de <span className="text-foreground">{references.join(', ')}</span> du même groupe, au-dessus.</>
            : <>Les résines Flowfast du même groupe, au-dessus, sont prises d'office.</>}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {/* % ou coefficient : la même grandeur (× 0,5 = 50 %), saisie à sa façon. */}
        <div className="flex rounded border overflow-hidden shrink-0 text-xs">
          <button type="button" onClick={() => setMode(undefined)} title="Dosage en pourcentage du poids (pigment à 10 %)"
            className={`h-8 px-2 ${!coef ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>%</button>
          <button type="button" onClick={() => setMode('coef')} title="Dosage en coefficient du poids (SNLC = 0,5 × le 319)"
            className={`h-8 px-2 ${coef ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>×</button>
        </div>
        <InputNombre key={mode ?? 'pct'} decimales={coef ? 4 : 2} value={coef ? pct / 100 : pct} className="h-8 w-20 text-sm"
          onChange={v => setPct(coef ? Math.round(v * 100 * 1e6) / 1e6 : v)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); appliquer(); } }} />
        <span className="text-muted-foreground">{coef ? '× le poids des lignes cochées' : '% du poids des lignes cochées'}</span>
      </div>
      {pctModifie && (
        <p className="text-xs text-orange-500">Dosage enregistré : {libelleDosage(enregistre)} — « Appliquer » pour passer à {libelleDosage(r)}.</p>
      )}
      {calc.sources.length === 0 ? (
        <p className="text-xs text-amber-600">Aucune ligne d'article au-dessus de celle-ci : rien à doser.</p>
      ) : (
        <div className="max-h-64 overflow-auto space-y-1 border rounded p-1.5">
          {calc.sources.map(s => {
            const p = s.ligne.produitId ? produitParId(produits, s.ligne.produitId) : undefined;
            return (
              <label key={s.ligne.id} className="flex items-start gap-2 rounded px-1 py-0.5 hover:bg-muted cursor-pointer">
                <Checkbox className="mt-0.5" checked={s.retenue}
                  onCheckedChange={c => appliquer(basculerSource(r, s, c === true))} />
                <span className="flex-1 min-w-0">
                  <span className="text-muted-foreground">#{ligneNums[s.ligne.id] ?? '?'} </span>
                  <span className={s.retenue ? 'text-foreground' : 'text-muted-foreground'}>{p ? designationProduit(p) : s.ligne.description}</span>
                  {s.parDefaut && <span className="text-[10px] text-primary"> · d'office</span>}
                </span>
                <span className="tabular-nums text-xs shrink-0" title={
                  s.base === 'resine' ? 'Résine consommée (surface × conso ; un kit ne compte que sa résine)'
                    : s.base === 'consomme' ? 'Poids consommé : surface × conso'
                      : 'Pas de surface ni de conso : poids des unités vendues'}>
                  {kg(s.kg)}{s.base === 'vendu' ? ' vendus' : ''}
                </span>
              </label>
            );
          })}
        </div>
      )}
      <p className="text-xs">
        {kg(calc.kgSources)} {coef ? libelleDosage(r) : `× ${libelleDosage(r)}`} = <span className="font-semibold">{kg(calc.kg)}</span>
        {calc.sources.length > 0 && !calc.sources.some(s => s.retenue) && <span className="text-amber-600"> — aucune ligne cochée</span>}
      </p>
      {choixManuel && (
        <button type="button" className="text-xs text-primary hover:underline"
          onClick={() => appliquer({ pct, ...(mode ? { mode } : {}), ...(enregistre.produits?.length ? { produits: enregistre.produits } : {}) })}
          title="Oublier les lignes cochées / décochées à la main : seules les lignes prises d'office comptent">
          Revenir aux lignes prises d'office
        </button>
      )}
      <div className="flex justify-end gap-2">
        {actif && <Button variant="outline" size="sm" onClick={() => onChange(null)}>Retirer le dosage</Button>}
        <Button size="sm" onClick={() => appliquer()}
          title={actif ? 'Recalculer la conso et la quantité de la ligne avec ce dosage (une quantité forcée à la main repasse en automatique)' : undefined}>
          {actif ? 'Réappliquer' : 'Appliquer'}
        </Button>
      </div>
    </div>
  );
}

export default function ConsoRelativePopover(props: Props) {
  const actif = !!props.ligne.consoRelative;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button"
          title={actif
            ? `Conso dosée : ${libelleDosage(props.ligne.consoRelative!)} le poids d'autres lignes — cliquer pour régler`
            : 'Doser la conso en % du poids d\'autres lignes (pigment à 10 % de la résine…)'}
          className={`h-8 w-5 shrink-0 rounded flex items-center justify-center hover:bg-muted ${actif ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}>
          <Percent className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        <Contenu {...props} />
      </PopoverContent>
    </Popover>
  );
}
