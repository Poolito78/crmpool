import { useState, useMemo } from 'react';
import { BAREMES_TRANSPORT, calculerFraisPortBareme, formatMontant, type TransporteurType } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Truck, MapPin } from 'lucide-react';

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
  return Math.round(vol * 1.3); // facteur route ~1.3
}

const transporteurs = Object.entries(BAREMES_TRANSPORT) as [Exclude<TransporteurType, 'standard'>, typeof BAREMES_TRANSPORT[keyof typeof BAREMES_TRANSPORT]][];

export default function CalculateurUPS() {
  const [poids, setPoids] = useState(0);
  const [nbColis, setNbColis] = useState(1);
  const [selectedTransporteur, setSelectedTransporteur] = useState<Exclude<TransporteurType, 'standard'>>('ups');
  const [coeff, setCoeff] = useState(1.4);
  const [express, setExpress] = useState(false);
  const [coeffExpress, setCoeffExpress] = useState(1.8);
  const [deptDepart, setDeptDepart] = useState('76');
  const [deptLivraison, setDeptLivraison] = useState('');

  const config = BAREMES_TRANSPORT[selectedTransporteur];
  const resultat = calculerFraisPortBareme(config.bareme, poids, nbColis);
  const coeffTotal = express ? coeff * coeffExpress : coeff;
  const prixFinal = resultat.prix !== null ? Math.round(resultat.prix * coeffTotal * 100) / 100 : null;
  const distanceKm = useMemo(() => deptDepart && deptLivraison ? estimerDistanceKm(deptDepart, deptLivraison) : null, [deptDepart, deptLivraison]);

  return (
    <div className="space-y-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-amber-600" />
            Calculateur frais de port
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {transporteurs.map(([key, { label }]) => (
              <button
                key={key}
                type="button"
                onClick={() => { setSelectedTransporteur(key); setCoeff(BAREMES_TRANSPORT[key].coeffDefaut); }}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${selectedTransporteur === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Poids total (kg)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={poids || ''}
                onChange={e => setPoids(parseFloat(e.target.value) || 0)}
                placeholder="Ex: 25"
              />
            </div>
            <div>
              <Label>Nombre de colis</Label>
              <Input
                type="number"
                min="1"
                value={nbColis}
                onChange={e => setNbColis(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div>
              <Label>Coefficient</Label>
              <Input
                type="number"
                step="0.1"
                min="0.1"
                value={coeff}
                onChange={e => setCoeff(parseFloat(e.target.value) || 1)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Département départ</Label>
              <Input
                type="text"
                maxLength={3}
                value={deptDepart}
                onChange={e => setDeptDepart(e.target.value.replace(/[^0-9AB]/gi, '').toUpperCase())}
                placeholder="76"
              />
            </div>
            <div>
              <Label>Département livraison</Label>
              <Input
                type="text"
                maxLength={3}
                value={deptLivraison}
                onChange={e => setDeptLivraison(e.target.value.replace(/[^0-9AB]/gi, '').toUpperCase())}
                placeholder="Ex: 13"
              />
            </div>
            <div className="flex flex-col justify-end">
              <Label className="text-muted-foreground text-xs mb-1">Distance estimée</Label>
              <div className="h-10 flex items-center gap-1.5 px-3 rounded-md bg-muted text-sm">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                {distanceKm !== null ? (
                  <span className="font-medium">{distanceKm} km</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col justify-end">
              <Label className="text-muted-foreground text-xs mb-1">Tarif brut {config.label}</Label>
              <div className="h-10 flex items-center px-3 rounded-md bg-muted text-sm">
                {resultat.prix !== null ? formatMontant(resultat.prix) : (
                  <span className="text-amber-600 text-sm font-medium">Hors barème</span>
                )}
              </div>
            </div>
            <div className="flex flex-col justify-end">
              <Label className="text-muted-foreground text-xs mb-1">Tarif final (× {coeff})</Label>
              <div className="h-10 flex items-center px-3 rounded-md bg-muted font-bold text-lg">
                {prixFinal !== null ? formatMontant(prixFinal) : (
                  <span className="text-amber-600 text-sm font-medium">Sur devis</span>
                )}
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

      {/* Barème complet */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Barème {config.label} (tarifs par colis)</CardTitle>
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
                {config.bareme.map((b, i) => {
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
    </div>
  );
}
