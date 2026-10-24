import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TransportFournisseurPanel from '@/components/TransportFournisseurPanel';
import { useCRM } from '@/lib/StoreContext';
import type { Fournisseur } from '@/lib/store';

type Transport = Pick<Fournisseur, 'francoPort' | 'coutTransport' | 'paliersPortPoids' | 'grilleAffretement' | 'grilleMessagerie'>;

/**
 * L'onglet Transport d'une fiche fournisseur, ouvert PAR-DESSUS l'écran en
 * cours (le détail du port d'un devis) : on complète un franco, un poids par
 * palette ou une grille sans quitter le devis ni perdre sa saisie. Rien
 * n'est écrit avant « Enregistrer » ; le port du devis se recalcule alors
 * aussitôt, la fiche venant du même store.
 */
export default function TransportFournisseurDialog({ fournisseurId, onClose }: { fournisseurId: string | null; onClose: () => void }) {
  const { fournisseurs, updateFournisseurs } = useCRM();
  const fournisseur = fournisseurs.find(f => f.id === fournisseurId);
  const [valeur, setValeur] = useState<Transport | null>(null);

  useEffect(() => {
    if (!fournisseur) { setValeur(null); return; }
    setValeur({
      francoPort: fournisseur.francoPort, coutTransport: fournisseur.coutTransport,
      paliersPortPoids: fournisseur.paliersPortPoids ?? [],
      grilleAffretement: fournisseur.grilleAffretement, grilleMessagerie: fournisseur.grilleMessagerie,
    });
    // Recharger seulement à l'ouverture d'une autre fiche, pas à chaque écriture du store.
  }, [fournisseurId]); // eslint-disable-line react-hooks/exhaustive-deps

  function enregistrer() {
    if (!fournisseur || !valeur) return;
    updateFournisseurs(prev => prev.map(f => (f.id === fournisseur.id ? { ...f, ...valeur } : f)));
    toast.success(`Transport de ${fournisseur.societe || fournisseur.nom} enregistré`);
    onClose();
  }

  return (
    <Dialog open={!!fournisseur} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent mobileFullscreen className="sm:max-w-2xl sm:max-h-[90vh] flex flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transport — {fournisseur?.societe || fournisseur?.nom}</DialogTitle>
        </DialogHeader>
        {valeur && (
          <div className="flex-1 overflow-y-auto min-h-0">
            <TransportFournisseurPanel valeur={valeur} onChange={patch => setValeur(v => (v ? { ...v, ...patch } : v))} />
          </div>
        )}
        <div className="sticky bottom-0 bg-background border-t border-border pt-3 pb-1 mt-2 shrink-0 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={enregistrer}>Enregistrer</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
