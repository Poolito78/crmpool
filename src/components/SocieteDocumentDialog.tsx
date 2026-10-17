/**
 * Société et logo d'un document.
 *
 * - Le LOGO (la marque) se choisit parmi les marques de la société du
 *   document : un devis ISOSIGN peut sortir sous ISOFLOOR, ISOSIGN, ISOMARK
 *   ou STI. Ouvert à tous.
 * - Le TRANSFERT vers une autre société est réservé à l'administrateur (un
 *   autre compte ne voit qu'une société) et n'est proposé que si `transfert`.
 *   Le document change de série : il reçoit le numéro suivant de la société
 *   d'arrivée, lu en base (la liste à l'écran ne montre que la société
 *   active), et l'ancien numéro est rappelé dans la réponse.
 */
import { useEffect, useMemo, useState } from 'react';
import { Building2, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useSocietes } from '@/hooks/useSocietes';
import { useCurrentUser } from '@/hooks/useAuth';
import { societeDuDocument, marqueDe, logoDe } from '@/lib/societes';
import { prochainNumero } from '@/lib/numeroDevis';

export interface DocumentSociete {
  id: string;
  numero: string;
  societeId?: string;
  marque?: string;
}

interface Props {
  doc: DocumentSociete | null;
  onClose: () => void;
  /** Table Supabase du document, pour lire la série d'arrivée. */
  table: 'devis' | 'commandes_client' | 'factures_client';
  /** Type de la série : 'DEV', 'CMD'… */
  type: string;
  /** Largeur du compteur (4 pour les commandes). */
  largeur?: number;
  transfert?: boolean;
  onApply: (changes: { societeId: string; marque?: string; numero?: string }) => void;
}

export default function SocieteDocumentDialog({ doc, onClose, table, type, largeur = 3, transfert = false, onApply }: Props) {
  const { societes, serieDe } = useSocietes();
  const { isAdmin } = useCurrentUser();
  const actuelle = societeDuDocument(doc, societes);
  const [societeId, setSocieteId] = useState('');
  const [marque, setMarque] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!doc) return;
    setSocieteId(actuelle?.id || '');
    setMarque(marqueDe(actuelle, doc.marque)?.nom || '');
  }, [doc, actuelle]);

  const cible = societes.find(s => s.id === societeId) || actuelle;
  const change = !!cible && !!actuelle && cible.id !== actuelle.id;
  const marques = cible?.marques || [];
  const peutTransferer = transfert && isAdmin && societes.filter(s => s.actif).length > 1;
  const apercu = useMemo(() => logoDe(cible, marque), [cible, marque]);

  async function appliquer() {
    if (!doc || !cible) return;
    setEnCours(true);
    try {
      let numero: string | undefined;
      if (change) {
        const base = serieDe(type, cible.id);
        const { data, error } = await supabase.from(table).select('numero').like('numero', `${base}-%`);
        if (error) throw error;
        numero = prochainNumero((data || []) as { numero: string }[], base, largeur);
      }
      onApply({ societeId: cible.id, marque: marque || undefined, numero });
      toast.success(change
        ? `${doc.numero} transféré chez ${cible.raisonSociale} → ${numero}`
        : 'Logo du document mis à jour');
      onClose();
    } catch (e) {
      toast.error('Transfert impossible', { description: (e as { message?: string })?.message || String(e) });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Dialog open={!!doc} onOpenChange={o => { if (!o && !enCours) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Building2 className="w-4 h-4" />Société et logo — {doc?.numero}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 text-sm">
          {peutTransferer ? (
            <div>
              <Label>Société émettrice</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {societes.filter(s => s.actif).map(s => (
                  <button key={s.id} type="button"
                    onClick={() => { setSocieteId(s.id); setMarque(s.marqueDefaut || s.marques[0]?.nom || ''); }}
                    className={`px-2.5 py-1 rounded text-xs border ${societeId === s.id ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'}`}>
                    {s.raisonSociale}
                  </button>
                ))}
              </div>
              {change && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 flex items-start gap-1">
                  <ArrowRightLeft className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  Le document quitte {actuelle?.raisonSociale} et prend le numéro suivant de la série {serieDe(type, cible?.id)}.
                </p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">Société : <strong className="text-foreground">{actuelle?.raisonSociale}</strong></p>
          )}
          <div>
            <Label>Logo imprimé</Label>
            {marques.length === 0
              ? <p className="text-xs text-muted-foreground mt-1">Aucune marque configurée pour cette société (Paramètres → Sociétés).</p>
              : (
                <div className="flex flex-wrap gap-1 mt-1">
                  {marques.map(m => (
                    <button key={m.nom} type="button" onClick={() => setMarque(m.nom)}
                      className={`px-2.5 py-1 rounded text-xs border ${marque === m.nom ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'}`}>
                      {m.nom}
                    </button>
                  ))}
                </div>
              )}
            <div className="mt-3 h-14 flex items-center justify-center rounded border border-dashed border-input bg-white">
              {apercu
                ? <img src={apercu} alt={marque} className="max-h-11 object-contain" />
                : <span className="text-xs text-muted-foreground">Pas de logo pour {marque || 'cette marque'} : le nom s'imprimera à sa place.</span>}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enCours}>Annuler</Button>
          <Button onClick={appliquer} disabled={enCours || !cible}>{change ? 'Transférer' : 'Enregistrer'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
