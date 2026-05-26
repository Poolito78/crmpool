import { useState, useMemo, useEffect } from 'react';
import { BAREMES_TRANSPORT, calculerFraisPortBareme, formatMontant, type TransporteurType, type BaremePalier } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Truck, MapPin, Pencil, Check, X, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Coordonnées approximatives des centres de départements français (lat, lng)
const DEPT_COORDS: Record<string, [number, number]> = {
  '01': [46.2, 5.3], '02': [49.5, 3.6], '03': [46.3, 3.2], '04': [44.1, 6.2], '05': [44.7, 6.3],
  '06': [43.8, 7.2], '07': [44.7, 4.6], '08': [49.6, 4.6], '09': [42.9, 1.6], '10': [48.3, 4.1],
  '11': [43.2, 2.4], '12': [44.3, 2.6], '13': [43.5, 5.1], '14': [49.1, -0.4], '15': [45.0, 2.7],
  '16': [45.7, 0.2], '17': [45.9, -0.8], '18': [47.1, 2.4], '19': [45.3, 1.8], '2A': [41.9, 9.0],
  '2B': [42.5, 9.3], '21': [47.3, 4.8], '22': [48.5, -3.0], '23': [46.1, 2.1], '24': [45.1, 0.7],
  '25': [47.2, 6.3], '26': [44.7, 5.1], '27': [49.1, 1.2], '28': [48.3, 1.3], '29': [48.4, -4.2],
  '30': [44.0, 4.1], '31': [43.5, 1.4], '32': [43.7, 0.6], '33': [44.8, -0.6], '34': [43.6, 3.7],
  '35': [48.2, -1.7], '36': [46.8, 1.7], '37': [47.3, 0.7], '38': [45.2, 5.7], '39': [46.7, 5.7],
  '40': [43.9, -0.8], '41': [47.6, 1.3], '42': [45.6, 4.3], '43': [45.1, 3.7], '44': [47.3, -1.6],
  '45': [47.9, 2.1], '46': [44.6, 1.7], '47': [44.3, 0.5], '48': [44.5, 3.5], '49': [47.4, -0.6],
  '50': [48.9, -1.3], '51': [48.9, 4.0], '52': [48.1, 5.1], '53': [48.1, -0.8], '54': [48.7, 6.2],
  '55': [49.0, 5.4], '56': [47.8, -2.8], '57': [49.0, 6.7], '58': [47.1, 3.5], '59': [50.4, 3.1],
  '60': [49.4, 2.5], '61': [48.6, 0.1], '62': [50.5, 2.3], '63': [45.7, 3.1], '64': [43.3, -0.8],
  '65': [43.1, 0.1], '66': [42.6, 2.5], '67': [48.6, 7.5], '68': [47.9, 7.2], '69': [45.8, 4.8],
  '70': [47.6, 6.2], '71': [46.6, 4.4], '72': [47.9, 0.2], '73': [45.5, 6.4], '74': [46.0, 6.3],
  '75': [48.9, 2.3], '76': [49.5, 1.1], '77': [48.6, 2.9], '78': [48.8, 1.9], '79': [46.5, -0.4],
  '80': [49.9, 2.3], '81': [43.8, 2.2], '82': [44.0, 1.3], '83': [43.5, 6.3], '84': [44.0, 5.1],
  '85': [46.7, -1.3], '86': [46.6, 0.4], '87': [45.9, 1.3], '88': [48.2, 6.5], '89': [47.8, 3.6],
  '90': [47.6, 6.9], '91': [48.5, 2.2], '92': [48.8, 2.2], '93': [48.9, 2.5], '94': [48.8, 2.5],
  '95': [49.1, 2.1], '971': [16.2, -61.5], '972': [14.6, -61.0], '973': [4.0, -53.0], '974': [-21.1, 55.5], '976': [-12.8, 45.2],
};

function estimerDistanceKm(dept1: string, dept2: string): number | null {
  const c1 = DEPT_COORDS[dept1];
  const c2 = DEPT_COORDS[dept2];
  if (!c1 || !c2) return null;
  const R = 6371;
  const dLat = (c2[0] - c1[0]) * Math.PI / 180;
  const dLng = (c2[1] - c1[1]) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(c1[0] * Math.PI / 180) * Math.cos(c2[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const vol = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(vol * 1.3);
}

// ── Barèmes personnalisables ──────────────────────────────────────────────────

type CarrierKey = Exclude<TransporteurType, 'standard'>;
type CustomBaremes = Record<CarrierKey, BaremePalier[]>;
type PageTab = 'calcul' | 'baremes' | 'manuel';

const LS_KEY = 'crm_transport_baremes';

function loadBaremes(): CustomBaremes {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as CustomBaremes;
      if (parsed.ups && parsed.messagerie && parsed.gls) {
        // Rétablir Infinity (JSON.parse le convertit en null)
        const fix = (b: BaremePalier) => ({ ...b, max: b.max === null ? Infinity : b.max });
        return {
          ups: parsed.ups.map(fix),
          messagerie: parsed.messagerie.map(fix),
          gls: parsed.gls.map(fix),
        };
      }
    }
  } catch { /* ignore */ }
  return {
    ups: BAREMES_TRANSPORT.ups.bareme,
    messagerie: BAREMES_TRANSPORT.messagerie.bareme,
    gls: BAREMES_TRANSPORT.gls.bareme,
  };
}

const CARRIERS: { key: CarrierKey; label: string }[] = [
  { key: 'ups', label: 'UPS' },
  { key: 'messagerie', label: 'Messagerie' },
  { key: 'gls', label: 'Affrètement GLS' },
];

// ── Composant ─────────────────────────────────────────────────────────────────

export default function CalculateurUPS() {
  const [pageTab, setPageTab] = useState<PageTab>('calcul');

  // Barèmes (persistés en localStorage)
  const [customBaremes, setCustomBaremes] = useState<CustomBaremes>(loadBaremes);
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(customBaremes));
  }, [customBaremes]);

  // ── Calculateur ────────────────────────────────────────────────────────────
  const [poids, setPoids] = useState(0);
  const [nbColis, setNbColis] = useState(1);
  const [selectedCarrier, setSelectedCarrier] = useState<CarrierKey>('ups');
  const [coeff, setCoeff] = useState(1.4);
  const [express, setExpress] = useState(false);
  const [coeffExpress, setCoeffExpress] = useState(1.8);
  const [deptDepart, setDeptDepart] = useState('76');
  const [deptLivraison, setDeptLivraison] = useState('');

  const calcConfig = useMemo(() => ({
    ...BAREMES_TRANSPORT[selectedCarrier],
    bareme: customBaremes[selectedCarrier],
  }), [selectedCarrier, customBaremes]);

  const resultat = calculerFraisPortBareme(calcConfig.bareme, poids, nbColis);
  const coeffTotal = express ? coeff * coeffExpress : coeff;
  const prixFinal = resultat.prix !== null ? Math.round(resultat.prix * coeffTotal * 100) / 100 : null;
  const distanceKm = useMemo(
    () => deptDepart && deptLivraison ? estimerDistanceKm(deptDepart, deptLivraison) : null,
    [deptDepart, deptLivraison],
  );

  // ── Barèmes — édition ──────────────────────────────────────────────────────
  const [baremeCarrier, setBaremeCarrier] = useState<CarrierKey>('ups');
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editPrix, setEditPrix] = useState('');

  const startEdit = (idx: number) => {
    const b = customBaremes[baremeCarrier][idx];
    setEditIdx(idx);
    setEditPrix(b.prix !== null ? String(b.prix) : '');
  };

  const saveEdit = () => {
    if (editIdx === null) return;
    const prix = editPrix.trim() === '' ? null : parseFloat(editPrix.replace(',', '.'));
    if (prix !== null && isNaN(prix)) { toast.error('Valeur invalide'); return; }
    setCustomBaremes(prev => ({
      ...prev,
      [baremeCarrier]: prev[baremeCarrier].map((b, i) => i === editIdx ? { ...b, prix } : b),
    }));
    setEditIdx(null);
    toast.success('Tarif mis à jour');
  };

  const resetBareme = (key: CarrierKey) => {
    setCustomBaremes(prev => ({ ...prev, [key]: BAREMES_TRANSPORT[key].bareme }));
    setEditIdx(null);
    toast.success(`Barème ${BAREMES_TRANSPORT[key].label} réinitialisé`);
  };

  // ── Saisie manuelle ────────────────────────────────────────────────────────
  const [manuelPrix, setManuelPrix] = useState('');
  const [manuelCoeff, setManuelCoeff] = useState('1.4');
  const [manuelNote, setManuelNote] = useState('');

  const manuelPrixNum = parseFloat(manuelPrix.replace(',', '.')) || 0;
  const manuelCoeffNum = parseFloat(manuelCoeff.replace(',', '.')) || 1;
  const manuelTotal = Math.round(manuelPrixNum * manuelCoeffNum * 100) / 100;

  // ── Helper : sélecteur transporteur ───────────────────────────────────────
  const CarrierSelector = ({ value, onChange }: { value: CarrierKey; onChange: (k: CarrierKey) => void }) => (
    <div className="flex flex-wrap gap-1.5">
      {CARRIERS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            'px-3 py-1 text-sm rounded border transition-colors',
            value === key
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border text-foreground hover:bg-accent',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );

  // ── Rendu ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-4xl">

      {/* Onglets page */}
      <div className="flex gap-1 border-b">
        {([
          ['calcul',  'Calculateur'],
          ['baremes', 'Barèmes'],
          ['manuel',  'Saisie manuelle'],
        ] as [PageTab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => { setPageTab(t); setEditIdx(null); }}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              pageTab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ══════════ CALCULATEUR ══════════ */}
      {pageTab === 'calcul' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-amber-600" />
                Calculateur frais de port
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <CarrierSelector
                value={selectedCarrier}
                onChange={k => {
                  setSelectedCarrier(k);
                  setCoeff(BAREMES_TRANSPORT[k].coeffDefaut);
                  setCoeffExpress(BAREMES_TRANSPORT[k].coeffExpressDefaut);
                }}
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>Poids total (kg)</Label>
                  <Input
                    type="number" step="0.1" min="0"
                    value={poids || ''}
                    onChange={e => setPoids(parseFloat(e.target.value) || 0)}
                    placeholder="Ex: 25"
                  />
                </div>
                <div>
                  <Label>Nombre de colis</Label>
                  <Input
                    type="number" min="1"
                    value={nbColis}
                    onChange={e => setNbColis(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
                <div>
                  <Label>Coefficient</Label>
                  <Input
                    type="number" step="0.1" min="0.1"
                    value={coeff}
                    onChange={e => setCoeff(parseFloat(e.target.value) || 1)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={express} onChange={e => setExpress(e.target.checked)} className="rounded" />
                  <span className="text-sm font-medium">Express J+1</span>
                </label>
                {express && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">Coeff. Express</Label>
                    <Input
                      type="number" step="0.1" min="1"
                      value={coeffExpress}
                      onChange={e => setCoeffExpress(parseFloat(e.target.value) || 1)}
                      className="h-8 text-sm w-20"
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>Département départ</Label>
                  <Input
                    type="text" maxLength={3}
                    value={deptDepart}
                    onChange={e => setDeptDepart(e.target.value.replace(/[^0-9AB]/gi, '').toUpperCase())}
                    placeholder="76"
                  />
                </div>
                <div>
                  <Label>Département livraison</Label>
                  <Input
                    type="text" maxLength={3}
                    value={deptLivraison}
                    onChange={e => setDeptLivraison(e.target.value.replace(/[^0-9AB]/gi, '').toUpperCase())}
                    placeholder="Ex: 13"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <Label className="text-muted-foreground text-xs mb-1">Distance estimée</Label>
                  <div className="h-10 flex items-center gap-1.5 px-3 rounded-md bg-muted text-sm">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    {distanceKm !== null
                      ? <span className="font-medium">{distanceKm} km</span>
                      : <span className="text-muted-foreground">—</span>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col justify-end">
                  <Label className="text-muted-foreground text-xs mb-1">Tarif brut {calcConfig.label}</Label>
                  <div className="h-10 flex items-center px-3 rounded-md bg-muted text-sm">
                    {resultat.prix !== null
                      ? formatMontant(resultat.prix)
                      : <span className="text-amber-600 text-sm font-medium">Hors barème</span>}
                  </div>
                </div>
                <div className="flex flex-col justify-end">
                  <Label className="text-muted-foreground text-xs mb-1">
                    Tarif final (× {coeff}{express ? ` × ${coeffExpress} express` : ''})
                  </Label>
                  <div className="h-10 flex items-center px-3 rounded-md bg-muted font-bold text-lg">
                    {prixFinal !== null
                      ? formatMontant(prixFinal)
                      : <span className="text-amber-600 text-sm font-medium">Sur devis</span>}
                  </div>
                </div>
              </div>
              {nbColis > 1 && poids > 0 && (
                <p className="text-xs text-muted-foreground">
                  Poids par colis : <span className="font-medium">{(poids / nbColis).toFixed(2)} kg</span> · Palier : {resultat.palier} × {nbColis} colis
                </p>
              )}
              {nbColis === 1 && poids > 0 && (
                <p className="text-xs text-muted-foreground">Palier : {resultat.palier}</p>
              )}
            </CardContent>
          </Card>

          {/* Barème affiché en lecture seule sous le calculateur */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Barème {calcConfig.label} (tarifs par colis)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Poids</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">Tarif HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calcConfig.bareme.map((b, i) => {
                      const isActive = poids > 0 && nbColis >= 1 && (() => {
                        const poidsColis = nbColis > 1 ? poids / nbColis : poids;
                        return poidsColis > b.min && poidsColis <= b.max;
                      })();
                      return (
                        <tr key={i} className={`border-b border-border/50 ${isActive ? 'bg-primary/10 font-semibold' : ''}`}>
                          <td className="py-2 px-3">
                            {b.max === Infinity ? `> ${b.min} kg` : `${b.min} – ${b.max} kg`}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {b.prix !== null ? formatMontant(b.prix) : <span className="text-amber-600">Sur devis</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ══════════ BARÈMES ══════════ */}
      {pageTab === 'baremes' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-amber-600" />
              Barèmes transporteurs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CarrierSelector value={baremeCarrier} onChange={k => { setBaremeCarrier(k); setEditIdx(null); }} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => resetBareme(baremeCarrier)}
                className="gap-1.5 text-muted-foreground"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Réinitialiser
              </Button>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Poids</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Tarif HT</th>
                    <th className="w-20 px-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {customBaremes[baremeCarrier].map((b, i) => (
                    <tr key={i} className="hover:bg-muted/30 transition-colors group">
                      <td className="py-2 px-3">
                        {b.max === Infinity ? `> ${b.min} kg` : `${b.min} – ${b.max} kg`}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {editIdx === i ? (
                          <Input
                            value={editPrix}
                            onChange={e => setEditPrix(e.target.value)}
                            className="h-7 w-24 text-right ml-auto"
                            placeholder="Sur devis"
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveEdit();
                              if (e.key === 'Escape') setEditIdx(null);
                            }}
                            autoFocus
                          />
                        ) : (
                          b.prix !== null
                            ? <span className="font-medium">{formatMontant(b.prix)}</span>
                            : <span className="text-amber-600">Sur devis</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {editIdx === i ? (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={saveEdit}
                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditIdx(null)}
                              className="p-1 text-muted-foreground hover:bg-muted rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end">
                            <button
                              onClick={() => startEdit(i)}
                              className="p-1 text-muted-foreground hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              Cliquez sur une ligne pour modifier le tarif. Les modifications sont sauvegardées localement (ce navigateur).
              Utilisez "Réinitialiser" pour revenir aux tarifs par défaut.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ══════════ SAISIE MANUELLE ══════════ */}
      {pageTab === 'manuel' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-amber-600" />
              Saisie manuelle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-w-sm">
            <p className="text-sm text-muted-foreground">
              Saisir un tarif transport connu (hors barème, devis transporteur, tarif négocié…).
            </p>
            <div className="space-y-1.5">
              <Label>Prix HT transporteur (€)</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="ex : 87.00"
                value={manuelPrix}
                onChange={e => setManuelPrix(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Coefficient de marge</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={manuelCoeff}
                onChange={e => setManuelCoeff(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Note / référence <span className="text-muted-foreground font-normal text-xs">(optionnel)</span></Label>
              <Input
                placeholder="ex : Devis UPS hors barème, palette 1 200 kg"
                value={manuelNote}
                onChange={e => setManuelNote(e.target.value)}
              />
            </div>

            {manuelPrixNum > 0 && (
              <div className="rounded-lg border bg-card p-4 space-y-2 mt-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Prix brut</span>
                  <span>{formatMontant(manuelPrixNum)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Coefficient</span>
                  <span>× {manuelCoeffNum}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total HT</span>
                  <span>{formatMontant(manuelTotal)}</span>
                </div>
                {manuelNote && (
                  <p className="text-xs text-muted-foreground pt-1">{manuelNote}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
