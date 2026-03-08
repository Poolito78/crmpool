import { type Devis, type Client, type Produit, calculerTotalLigne, calculerTotalDevis, formatMontant, formatDate } from '@/lib/store';
import { Printer, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  devis: Devis;
  client?: Client;
  onEdit?: () => void;
}

export default function DevisPreview({ devis, client, onEdit }: Props) {
  function handlePrint() {
    window.print();
  }

  const totals = calculerTotalDevis(devis.lignes, devis.fraisPortHT || 0, devis.fraisPortTVA ?? 20);

  return (
    <div className="bg-card">
      {/* Print / Edit buttons */}
      <div className="flex justify-end gap-2 p-4 print:hidden">
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
            <h2 className="font-heading text-2xl font-bold text-primary">MonCRM</h2>
            <p className="text-muted-foreground text-xs mt-1">Votre entreprise</p>
            <p className="text-muted-foreground text-xs">123 Rue Exemple, 75001 Paris</p>
            <p className="text-muted-foreground text-xs">contact@moncrm.fr • 01 23 45 67 89</p>
            <p className="text-muted-foreground text-xs">SIRET : 123 456 789 00012</p>
          </div>
          <div className="text-right">
            <h1 className="font-heading text-3xl font-bold tracking-tight">DEVIS</h1>
            <p className="text-lg font-semibold text-primary mt-1">{devis.numero}</p>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Client</p>
            <p className="font-semibold">{client?.nom || '—'}</p>
            {client?.societe && <p className="text-muted-foreground">{client.societe}</p>}
            {client && <p className="text-muted-foreground">{client.adresse}</p>}
            {client && <p className="text-muted-foreground">{client.codePostal} {client.ville}</p>}
            {client?.email && <p className="text-muted-foreground">{client.email}</p>}
          </div>
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Informations</p>
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Date :</span><span>{formatDate(devis.dateCreation)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Validité :</span><span>{formatDate(devis.dateValidite)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Statut :</span><span className="font-medium capitalize">{devis.statut}</span></div>
              {devis.referenceAffaire && <div className="flex justify-between"><span className="text-muted-foreground">Réf. affaire :</span><span className="font-medium">{devis.referenceAffaire}</span></div>}
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
               <th className="text-right py-2 font-semibold w-16">Qté</th>
               <th className="text-center py-2 font-semibold w-16">Unité</th>
               <th className="text-right py-2 font-semibold w-24">P.U. HT</th>
               <th className="text-right py-2 font-semibold w-16">Rem.</th>
               <th className="text-right py-2 font-semibold w-28">Total HT</th>
             </tr>
           </thead>
          <tbody>
            {devis.lignes.map((l, i) => {
              const t = calculerTotalLigne(l);
              return (
                <tr key={l.id} className="border-b border-border">
                   <td className="py-2">{l.description}</td>
                   <td className="py-2 text-right">{l.quantite}</td>
                   <td className="py-2 text-center">{l.unite || '—'}</td>
                   <td className="py-2 text-right">{formatMontant(l.prixUnitaireHT)}</td>
                   <td className="py-2 text-right">{l.remise > 0 ? `${l.remise}%` : '—'}</td>
                   <td className="py-2 text-right font-medium">{formatMontant(t.totalHT)}</td>
                 </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-64 space-y-1">
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
