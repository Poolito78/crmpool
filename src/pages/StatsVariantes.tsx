import { useMemo, useState } from 'react';
import { useCRM } from '@/lib/StoreContext';
import { formatMontant } from '@/lib/store';
import { Input } from '@/components/ui/input';
import { Search, TrendingUp } from 'lucide-react';

interface StatLigne {
  produitId: string;
  produitRef: string;
  produitDesc: string;
  dimensionNom: string;
  optionLabel: string;
  qteVendue: number;
  totalHT: number;
}

export default function StatsVariantes() {
  const { devis, produits } = useCRM();
  const [search, setSearch] = useState('');

  const stats = useMemo(() => {
    const map = new Map<string, StatLigne>();

    devis.forEach(d => {
      d.lignes.forEach(l => {
        if (!l.produitId || !l.variantesChoisies) return;
        const prod = produits.find(p => p.id === l.produitId);
        if (!prod?.variantes) return;

        prod.variantes.forEach(dim => {
          const optionLabel = l.variantesChoisies![dim.id];
          if (!optionLabel) return;

          const key = `${l.produitId}__${dim.id}__${optionLabel}`;
          const existing = map.get(key);
          const qte = l.quantite || 0;
          const totalHT = l.prixUnitaireHT * qte;

          if (existing) {
            existing.qteVendue += qte;
            existing.totalHT += totalHT;
          } else {
            map.set(key, {
              produitId: l.produitId,
              produitRef: prod.reference,
              produitDesc: prod.description,
              dimensionNom: dim.nom,
              optionLabel,
              qteVendue: qte,
              totalHT,
            });
          }
        });
      });
    });

    return Array.from(map.values()).sort((a, b) => {
      const cmp = a.produitDesc.localeCompare(b.produitDesc);
      if (cmp !== 0) return cmp;
      const cd = a.dimensionNom.localeCompare(b.dimensionNom);
      if (cd !== 0) return cd;
      return b.qteVendue - a.qteVendue;
    });
  }, [devis, produits]);

  const filtered = useMemo(() => {
    if (!search.trim()) return stats;
    const q = search.toLowerCase();
    return stats.filter(s =>
      s.produitDesc.toLowerCase().includes(q) ||
      s.produitRef.toLowerCase().includes(q) ||
      s.optionLabel.toLowerCase().includes(q) ||
      s.dimensionNom.toLowerCase().includes(q)
    );
  }, [stats, search]);

  // Grouper par produit pour l'affichage
  const grouped = useMemo(() => {
    const g: { produitDesc: string; produitRef: string; dimensions: { nom: string; options: StatLigne[] }[] }[] = [];
    let lastProduit = '';
    let lastDim = '';
    filtered.forEach(s => {
      if (s.produitDesc !== lastProduit) {
        g.push({ produitDesc: s.produitDesc, produitRef: s.produitRef, dimensions: [] });
        lastProduit = s.produitDesc;
        lastDim = '';
      }
      const groupe = g[g.length - 1];
      if (s.dimensionNom !== lastDim) {
        groupe.dimensions.push({ nom: s.dimensionNom, options: [] });
        lastDim = s.dimensionNom;
      }
      groupe.dimensions[groupe.dimensions.length - 1].options.push(s);
    });
    return g;
  }, [filtered]);

  const totalQte = filtered.reduce((s, l) => s + l.qteVendue, 0);
  const totalHT = filtered.reduce((s, l) => s + l.totalHT, 0);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Stats ventes par variante</h1>
      </div>

      {/* Search */}
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filtrer produit, couleur, option…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Totaux */}
      {filtered.length > 0 && (
        <div className="flex gap-6 text-sm text-muted-foreground border rounded-lg px-4 py-2 bg-muted/40 w-fit">
          <span><span className="font-medium text-foreground">{totalQte.toFixed(0)}</span> unités vendues</span>
          <span><span className="font-medium text-foreground">{formatMontant(totalHT)}</span> HT</span>
        </div>
      )}

      {/* Table groupée */}
      {grouped.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Aucune vente avec variante trouvée</p>
          <p className="text-sm mt-1">Les variantes sont enregistrées dans les lignes de devis.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(g => (
            <div key={g.produitRef + g.produitDesc} className="border rounded-lg overflow-hidden">
              {/* En-tête produit */}
              <div className="bg-muted/60 px-4 py-2 flex items-baseline gap-2">
                <span className="font-semibold text-sm">{g.produitDesc}</span>
                {g.produitRef && <span className="text-xs text-muted-foreground">{g.produitRef}</span>}
              </div>

              {g.dimensions.map(dim => (
                <div key={dim.nom}>
                  {/* En-tête dimension */}
                  <div className="bg-muted/20 px-4 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide border-t">
                    {dim.nom}
                  </div>
                  {/* Options */}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-t text-xs text-muted-foreground">
                        <th className="px-4 py-1.5 text-left font-normal">Option</th>
                        <th className="px-4 py-1.5 text-right font-normal">Qté vendue</th>
                        <th className="px-4 py-1.5 text-right font-normal">Total HT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dim.options.map((opt, i) => (
                        <tr key={opt.optionLabel} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                          <td className="px-4 py-1.5">{opt.optionLabel}</td>
                          <td className="px-4 py-1.5 text-right tabular-nums">{opt.qteVendue % 1 === 0 ? opt.qteVendue.toFixed(0) : opt.qteVendue.toFixed(2)}</td>
                          <td className="px-4 py-1.5 text-right tabular-nums">{formatMontant(opt.totalHT)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
