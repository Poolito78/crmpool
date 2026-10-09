import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { formatTaille } from '@/lib/gedFournisseur';

/**
 * Quotas d'utilisation Supabase (forfait gratuit) : base 500 Mo, fichiers 1 Go.
 * Les chiffres viennent de la fonction `usage_stockage()` (administrateurs).
 * Le trafic sortant (5 Go/mois) n'est pas mesurable depuis l'application :
 * il se lit dans le tableau de bord Supabase.
 */
const QUOTA_BASE = 500 * 1024 * 1024;
const QUOTA_FICHIERS = 1024 * 1024 * 1024;

interface Usage {
  base_octets: number;
  tables: { nom: string; octets: number }[];
  seaux: { seau: string; fichiers: number; octets: number }[];
  fichiers: { seau: string; nom: string; octets: number | null; date: string }[];
}

function Jauge({ titre, utilise, quota }: { titre: string; utilise: number; quota: number }) {
  const pct = Math.min(100, (utilise / quota) * 100);
  const couleur = pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-warning' : 'bg-primary';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{titre}</span>
        <span className="text-muted-foreground">{formatTaille(utilise)} / {formatTaille(quota)} ({pct.toFixed(1)} %)</span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${couleur}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function UsageStockagePanel() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');
  const [seau, setSeau] = useState<string>('tous');

  const charger = useCallback(async () => {
    setChargement(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('usage_stockage');
    setChargement(false);
    if (error) { setErreur(error.message); return; }
    setErreur(''); setUsage(data as Usage);
  }, []);
  useEffect(() => { void charger(); }, [charger]);

  const totalFichiers = usage?.seaux.reduce((s, x) => s + Number(x.octets), 0) ?? 0;
  const fichiers = (usage?.fichiers ?? []).filter(f => seau === 'tous' || f.seau === seau);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Quotas d'utilisation</h2>
        <Button size="sm" variant="outline" onClick={charger} disabled={chargement}>
          {chargement ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}Actualiser
        </Button>
      </div>
      {erreur && <p className="text-sm text-destructive">Lecture impossible : {erreur}</p>}
      {usage && (<>
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <Jauge titre="Base de données" utilise={Number(usage.base_octets)} quota={QUOTA_BASE} />
          <Jauge titre="Fichiers (stockage)" utilise={totalFichiers} quota={QUOTA_FICHIERS} />
          <p className="text-xs text-muted-foreground">Quotas du forfait gratuit. Le trafic sortant (5 Go/mois) se lit dans le tableau de bord Supabase.</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-2">Par seau de fichiers</h3>
          <table className="w-full text-sm">
            <tbody>
              {usage.seaux.map(s => (
                <tr key={s.seau} className="border-b border-border last:border-0">
                  <td className="py-1.5">{s.seau}</td>
                  <td className="py-1.5 text-right text-muted-foreground">{s.fichiers} fichier{s.fichiers > 1 ? 's' : ''}</td>
                  <td className="py-1.5 text-right font-medium">{formatTaille(Number(s.octets))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-2">Les 15 plus grosses tables</h3>
          <table className="w-full text-sm">
            <tbody>
              {usage.tables.map(t => (
                <tr key={t.nom} className="border-b border-border last:border-0">
                  <td className="py-1.5">{t.nom}</td>
                  <td className="py-1.5 text-right font-medium">{formatTaille(Number(t.octets))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="text-sm font-semibold mr-2">Détail des fichiers (100 plus gros)</h3>
            {['tous', ...usage.seaux.map(s => s.seau)].map(s => (
              <button key={s} onClick={() => setSeau(s)}
                className={`px-2.5 py-1 rounded-full text-xs border ${seau === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`}>{s}</button>
            ))}
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <tbody>
                {fichiers.map((f, i) => (
                  <tr key={`${f.seau}-${f.nom}-${i}`} className="border-b border-border last:border-0">
                    <td className="py-1 pr-2 text-muted-foreground whitespace-nowrap">{f.seau}</td>
                    <td className="py-1 pr-2 break-all">{f.nom.split('/').slice(-1)[0]}</td>
                    <td className="py-1 pr-2 text-muted-foreground whitespace-nowrap">{new Date(f.date).toLocaleDateString('fr-FR')}</td>
                    <td className="py-1 text-right font-medium whitespace-nowrap">{f.octets != null ? formatTaille(Number(f.octets)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>)}
    </div>
  );
}
