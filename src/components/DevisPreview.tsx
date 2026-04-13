import { useState } from 'react';
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
  const [showRemise, setShowRemise] = useState(true);
  const isSurfaceMode = devis.modeCalcul === 'surface';

  const poidsTotal = devis.lignes.reduce((sum, l) => {
    const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
    return sum + (prod?.poids || 0) * l.quantite;
  }, 0);

  function handlePrint() {
    window.print();
  }

  const totals = calculerTotalDevis(devis.lignes, devis.fraisPortHT || 0, devis.fraisPortTVA ?? 20);

  return (
    <div className="bg-card">
      {/* Print / Edit buttons */}
      <div className="flex justify-end gap-2 p-4 print:hidden items-center flex-wrap">
        <div className="flex items-center gap-4 mr-auto">
          {isSurfaceMode && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={showConso} onChange={e => setShowConso(e.target.checked)} className="rounded" />
              Afficher consommation/m²
            </label>
          )}
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={showRemise} onChange={e => setShowRemise(e.target.checked)} className="rounded" />
            Afficher remise
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
              {isSurfaceMode && devis.surfaceGlobaleM2 && devis.surfaceGlobaleM2 > 0 && (
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
        <table className="w-full mb-6">
          <thead>
             <tr className="border-b-2 border-primary">
               <th className="text-left py-2 font-semibold">Description</th>
               {showConso && <th className="text-right py-2 font-semibold w-16">m²</th>}
               {showConso && <th className="text-right py-2 font-semibold w-20">kg/m²</th>}
               <th className="text-right py-2 font-semibold w-16">Qté</th>
               <th className="text-center py-2 font-semibold w-16">Unité</th>
               <th className="text-right py-2 font-semibold w-24">P.U. HT</th>
               {showRemise && <th className="text-right py-2 font-semibold w-16">Rem.</th>}
               <th className="text-right py-2 font-semibold w-28">Total HT</th>
             </tr>
           </thead>
          <tbody>
            {devis.lignes.map((l) => {
              const t = calculerTotalLigne(l);
              const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
              const conso = l.consommation || prod?.consommation || 0;
              return (
                <tr key={l.id} className="border-b border-border">
                   <td className="py-2">
                     {l.description}
                     {prod?.descriptionDetaillee && (
                       <p className="text-xs text-muted-foreground mt-0.5">{prod.descriptionDetaillee}</p>
                     )}
                   </td>
                   {showConso && <td className="py-2 text-right">{l.surfaceM2 || devis.surfaceGlobaleM2 || '—'}</td>}
                   {showConso && <td className="py-2 text-right">{conso > 0 ? conso : '—'}</td>}
                   <td className="py-2 text-right">{l.quantite}</td>
                   <td className="py-2 text-center">{l.unite || '—'}</td>
                   <td className="py-2 text-right">{formatMontant(l.prixUnitaireHT)}</td>
                   {showRemise && <td className="py-2 text-right">{l.remise > 0 ? `${l.remise}%` : '—'}</td>}
                   <td className="py-2 text-right font-medium">{formatMontant(t.totalHT)}</td>
                 </tr>
              );
            })}
          </tbody>
        </table>

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
