import { useState, Fragment } from 'react';
import { type Devis, type Client, type Produit, calculerTotalLigne, calculerTotalDevis, formatMontant, formatDate } from '@/lib/store';
import { Printer, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logoIsofloor from '@/assets/logo-isofloor.png';

interface Props {
  devis: Devis;
  client?: Client;
  produits?: Produit[];
  onEdit?: () => void;
}

export default function DevisPreview({ devis, client, produits = [], onEdit }: Props) {
  const [showConso, setShowConso] = useState(false);
  const [showRemise, setShowRemise] = useState(false);
  const [showComposants, setShowComposants] = useState(false);
  const [surfacesParLigne, setSurfacesParLigne] = useState<Record<string, number>>(() =>
    Object.fromEntries(devis.lignes.map(l => [l.id, l.surfaceM2 || devis.surfaceGlobaleM2 || 0]))
  );

  function setSurface(ligneId: string, val: number) {
    setSurfacesParLigne(prev => ({ ...prev, [ligneId]: val }));
  }

  // Calcul des totaux avec les surfaces locales (pour recalcul qté si surface mode)
  const lignesEffectives = devis.lignes.map(l => {
    const surface = surfacesParLigne[l.id] ?? l.surfaceM2 ?? devis.surfaceGlobaleM2 ?? 0;
    if (!showConso || !surface) return l;
    const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
    const conso = l.consommation || prod?.consommation || 0;
    const poids = prod?.poids || 1;
    if (conso && poids) {
      const newQty = Math.round(surface * conso / poids * 100) / 100;
      return { ...l, surfaceM2: surface, quantite: newQty > 0 ? newQty : l.quantite };
    }
    return { ...l, surfaceM2: surface };
  });

  const totals = calculerTotalDevis(lignesEffectives, devis.fraisPortHT || 0, devis.fraisPortTVA ?? 20);

  const poidsTotal = lignesEffectives.reduce((sum, l) => {
    const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
    return sum + (prod?.poids || 0) * l.quantite;
  }, 0);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="bg-card">
      {/* Print / Edit buttons */}
      <div className="flex justify-end gap-2 p-4 print:hidden items-center flex-wrap">
        <div className="flex items-center gap-4 mr-auto flex-wrap">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={showConso} onChange={e => setShowConso(e.target.checked)} className="rounded" />
            Afficher m²/consommation
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={showRemise} onChange={e => setShowRemise(e.target.checked)} className="rounded" />
            Afficher remise
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={showComposants} onChange={e => setShowComposants(e.target.checked)} className="rounded" />
            Afficher composants
          </label>
        </div>
        {onEdit && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="w-4 h-4 mr-2" /> Modifier
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="w-4 h-4 mr-2" /> Imprimer / PDF
        </Button>
      </div>

      {/* Devis document */}
      <div className="px-8 pb-8 print:px-0 max-w-[800px] mx-auto text-sm" id="devis-print">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <img src={logoIsofloor} alt="ISOFLOOR" className="h-16 mb-2" />
            <p className="text-muted-foreground text-xs">ZA DU MONAY</p>
            <p className="text-muted-foreground text-xs">71210 SAINT-EUSEBE</p>
            <p className="text-muted-foreground text-xs">Tél : 03 85 77 07 25</p>
            <p className="text-muted-foreground text-xs">Mail : contact@isofloor.fr</p>
          </div>
          <div className="text-right">
            <h1 className="font-heading text-3xl font-bold tracking-tight">DEVIS</h1>
            <p className="text-lg font-semibold text-primary mt-1">{devis.numero}</p>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Adresse de facturation</p>
            <p className="font-semibold">{client?.nom || '—'}</p>
            {client?.societe && <p className="text-muted-foreground">{client.societe}</p>}
            {client && <p className="text-muted-foreground">{client.adresse}</p>}
            {client && <p className="text-muted-foreground">{client.codePostal} {client.ville}</p>}
            {client?.email && <p className="text-muted-foreground">{client.email}</p>}
          </div>
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Adresse de livraison</p>
            {(() => {
              const adresseLivraison = devis.adresseLivraisonId
                ? client?.adressesLivraison?.find(a => a.id === devis.adresseLivraisonId)
                : null;
              if (adresseLivraison) {
                return (
                  <>
                    <p className="font-semibold">{adresseLivraison.libelle}</p>
                    <p className="text-muted-foreground">{adresseLivraison.adresse}</p>
                    <p className="text-muted-foreground">{adresseLivraison.codePostal} {adresseLivraison.ville}</p>
                    {adresseLivraison.contact && <p className="text-muted-foreground">Contact : {adresseLivraison.contact}</p>}
                    {adresseLivraison.telephone && <p className="text-muted-foreground">Tél : {adresseLivraison.telephone}</p>}
                  </>
                );
              }
              return (
                <>
                  <p className="font-semibold">{client?.nom || '—'}</p>
                  {client?.societe && <p className="text-muted-foreground">{client.societe}</p>}
                  {client && <p className="text-muted-foreground">{client.adresse}</p>}
                  {client && <p className="text-muted-foreground">{client.codePostal} {client.ville}</p>}
                  <p className="text-xs text-muted-foreground italic mt-1">Identique à l'adresse de facturation</p>
                </>
              );
            })()}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          <div></div>
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Informations</p>
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Date :</span><span>{formatDate(devis.dateCreation)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Validité :</span><span>{formatDate(devis.dateValidite)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Statut :</span><span className="font-medium capitalize">{devis.statut}</span></div>
              {devis.referenceAffaire && <div className="flex justify-between"><span className="text-muted-foreground">Réf. affaire :</span><span className="font-medium">{devis.referenceAffaire}</span></div>}
              {devis.surfaceGlobaleM2 && devis.surfaceGlobaleM2 > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Surface :</span><span className="font-medium">{devis.surfaceGlobaleM2} m²</span></div>
              )}
            </div>
          </div>
        </div>

        {devis.notes && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Objet</p>
            <p>{devis.notes}</p>
          </div>
        )}

        {/* Table */}
        {(() => {
          // Qté conso brute (kg) = surface × conso  (décimal, ex: 1.99)
          // Qté cmd = ⌈ qté_conso / poids_cond ⌉  (unités entières, ex: 2)
          const qtesConsoKg: Record<string, number | null> = {};
          const qtesCmd: Record<string, number | null> = {};
          for (const l of lignesEffectives) {
            const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
            const conso = l.consommation || prod?.consommation || 0;
            const surface = surfacesParLigne[l.id] ?? l.surfaceM2 ?? devis.surfaceGlobaleM2 ?? 0;
            const poidsCond = prod?.poids || 0;
            if (surface > 0 && conso > 0) {
              const kg = Math.round(surface * conso * 1000) / 1000;
              qtesConsoKg[l.id] = kg;
              qtesCmd[l.id] = poidsCond > 0 ? Math.ceil(kg / poidsCond) : null;
            } else {
              qtesConsoKg[l.id] = null;
              qtesCmd[l.id] = null;
            }
          }
          // Coût total matières (achat) quand showConso
          const coutMatieres = showConso ? lignesEffectives.reduce((sum, l) => {
            const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
            const qte = qtesCmd[l.id];
            return sum + (qte != null && prod ? qte * prod.prixAchat : 0);
          }, 0) : 0;

          return (
            <>
              <table className="w-full mb-6">
                <thead>
                  <tr className="border-b-2 border-primary">
                    <th className="text-left py-2 font-semibold">Description</th>
                    {showConso && <th className="text-right py-2 font-semibold w-20">m²</th>}
                    {showConso && <th className="text-right py-2 font-semibold w-20">kg/m²</th>}
                    {showConso && <th className="text-right py-2 font-semibold w-20">Qté conso.</th>}
                    {showConso && <th className="text-right py-2 font-semibold w-20">Qté cmd.</th>}
                    <th className="text-right py-2 font-semibold w-16">Qté</th>
                    <th className="text-center py-2 font-semibold w-16">Unité</th>
                    {showRemise && <th className="text-right py-2 font-semibold w-24">P.U. HT</th>}
                    {showRemise && <th className="text-right py-2 font-semibold w-16">Rem.</th>}
                    <th className="text-right py-2 font-semibold w-24">P.U. net HT</th>
                    <th className="text-right py-2 font-semibold w-28">Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {lignesEffectives.map((l) => {
                    const t = calculerTotalLigne(l);
                    const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
                    const conso = l.consommation || prod?.consommation || 0;
                    const surface = surfacesParLigne[l.id] ?? l.surfaceM2 ?? devis.surfaceGlobaleM2 ?? 0;
                    const composants = prod?.composants;
                    const qteConsoKg = qtesConsoKg[l.id];
                    const qteCmd = qtesCmd[l.id];

                    return (
                      <Fragment key={l.id}>
                        <tr className="border-b border-border">
                          <td className="py-2">
                            {l.description}
                            {prod?.descriptionDetaillee && (
                              <p className="text-xs text-muted-foreground mt-0.5">{prod.descriptionDetaillee}</p>
                            )}
                          </td>
                          {showConso && (
                            <td className="py-2 text-right">
                              <input
                                type="number" min={0} step={0.01}
                                value={surface || ''}
                                onChange={e => setSurface(l.id, parseFloat(e.target.value) || 0)}
                                className="w-16 text-right border border-border rounded px-1 py-0.5 text-sm bg-background print:hidden"
                                placeholder="0"
                              />
                              <span className="hidden print:inline">{surface || '—'}</span>
                            </td>
                          )}
                          {showConso && <td className="py-2 text-right">{conso > 0 ? conso : '—'}</td>}
                          {showConso && <td className="py-2 text-right">{qteConsoKg != null ? qteConsoKg : '—'}</td>}
                          {showConso && <td className="py-2 text-right font-medium text-primary">{qteCmd != null ? `${qteCmd}u` : '—'}</td>}
                          <td className="py-2 text-right">{l.quantite}</td>
                          <td className="py-2 text-center">{l.unite || '—'}</td>
                          {showRemise && <td className="py-2 text-right">{formatMontant(l.prixUnitaireHT)}</td>}
                          {showRemise && <td className="py-2 text-right">{l.remise > 0 ? `${l.remise}%` : '—'}</td>}
                          <td className="py-2 text-right">{formatMontant(l.prixUnitaireHT * (1 - l.remise / 100))}</td>
                          <td className="py-2 text-right font-medium">{formatMontant(t.totalHT)}</td>
                        </tr>

                        {/* Sous-lignes composants */}
                        {showComposants && composants && composants.length > 0 && (() => {
                          // Poids total de tous les composants = base de répartition
                          const totalPoidsComposants = composants.reduce((s, c) => s + c.quantite, 0);
                          return composants.map(comp => {
                          const compProd = produits.find(p => p.id === comp.produitId);
                          if (!compProd) return null;
                          const qteTotale = Math.round(comp.quantite * l.quantite * 1000) / 1000;
                          // kg/m² composant = part proportionnelle × conso_parent
                          const consoComp = totalPoidsComposants > 0 && conso > 0
                            ? Math.round(comp.quantite / totalPoidsComposants * conso * 10000) / 10000
                            : null;
                          // Qté conso brute (kg) = surface × kg/m²_comp
                          const qteConsoKgComp = consoComp != null && surface > 0
                            ? Math.round(surface * consoComp * 1000) / 1000
                            : null;
                          // Qté cmd = ⌈ qté_conso / poids_cond ⌉
                          const qteCmdComp = qteConsoKgComp != null && compProd.poids && compProd.poids > 0
                            ? Math.ceil(qteConsoKgComp / compProd.poids)
                            : null;
                          return (
                            <tr key={`${l.id}-${comp.produitId}`} className="bg-muted/20 text-muted-foreground text-xs">
                              <td className="py-1 pl-6 italic">
                                ↳ <span className="font-mono">{compProd.reference}</span> — {compProd.description}
                                {compProd.poids ? <span className="ml-1 text-muted-foreground/70">({compProd.poids} kg/cond.)</span> : null}
                              </td>
                              {showConso && <td className="py-1 text-right text-muted-foreground/50">—</td>}
                              {showConso && <td className="py-1 text-right">{consoComp != null ? consoComp : '—'}</td>}
                              {showConso && <td className="py-1 text-right">{qteConsoKgComp != null ? qteConsoKgComp : '—'}</td>}
                              {showConso && <td className="py-1 text-right font-medium text-primary">{qteCmdComp != null ? `${qteCmdComp}u` : '—'}</td>}
                              <td className="py-1 text-right">{qteTotale}</td>
                              <td className="py-1 text-center">{compProd.unite || '—'}</td>
                              <td colSpan={showRemise ? 2 : 1} />
                              <td />
                            </tr>
                          );
                        });
                        })()}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>

              {/* Coût matières (visible uniquement quand showConso) */}
              {showConso && coutMatieres > 0 && (
                <div className="mb-4 p-3 bg-muted/30 rounded-lg text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground font-medium">Coût total matières (achat)</span>
                    <span className="font-semibold">{formatMontant(coutMatieres)}</span>
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* Totals */}
        <div className="flex justify-between items-end mb-8">
          {poidsTotal > 0 && (
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Poids total :</span> {poidsTotal % 1 === 0 ? poidsTotal : poidsTotal.toFixed(2)} kg
            </div>
          )}
          <div className="w-64 space-y-1 ml-auto">
            <div className="flex justify-between"><span className="text-muted-foreground">Total HT</span><span>{formatMontant(totals.totalHT)}</span></div>
            {(devis.fraisPortHT || 0) > 0 && (
              <div className="flex justify-between"><span className="text-muted-foreground">dont frais de port HT</span><span>{formatMontant(devis.fraisPortHT!)}</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Total TVA</span><span>{formatMontant(totals.totalTVA)}</span></div>
            <div className="flex justify-between border-t-2 border-primary pt-2 mt-2">
              <span className="font-bold text-lg">Total TTC</span>
              <span className="font-heading font-bold text-lg">{formatMontant(totals.totalTTC)}</span>
            </div>
          </div>
        </div>

        {/* Conditions */}
        {devis.conditions && (
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Conditions</p>
            <p className="text-muted-foreground text-xs">{devis.conditions}</p>
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-8">
          <div className="border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">Signature du client</p>
            <p className="text-xs text-muted-foreground mt-1">Bon pour accord, date et signature</p>
            <div className="h-20"></div>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">Cachet de l'entreprise</p>
            <div className="h-20"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
