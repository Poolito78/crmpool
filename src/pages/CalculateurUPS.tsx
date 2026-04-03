import { useState } from 'react';
import { BAREMES_TRANSPORT, calculerFraisPortBareme, formatMontant, type TransporteurType } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Truck } from 'lucide-react';

const transporteurs = Object.entries(BAREMES_TRANSPORT) as [Exclude<TransporteurType, 'standard'>, typeof BAREMES_TRANSPORT[keyof typeof BAREMES_TRANSPORT]][];

export default function CalculateurUPS() {
  const [poids, setPoids] = useState(0);
  const [nbColis, setNbColis] = useState(1);
  const [selectedTransporteur, setSelectedTransporteur] = useState<Exclude<TransporteurType, 'standard'>>('ups');
  const [coeff, setCoeff] = useState(1.4);

  const config = BAREMES_TRANSPORT[selectedTransporteur];
  const resultat = calculerFraisPortBareme(config.bareme, poids, nbColis);
  const prixFinal = resultat.prix !== null ? Math.round(resultat.prix * coeff * 100) / 100 : null;

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
