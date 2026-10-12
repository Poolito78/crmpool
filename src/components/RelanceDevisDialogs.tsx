/**
 * Relance d'un devis envoyé — par mail ou par téléphone.
 *
 * Monté par la page Devis (menu de chaque devis) et par le CRM (onglet
 * Relances). UN SEUL endroit enregistre une relance (`enregistrer`) : sur le
 * devis (`relances`, `dateRelance`), à l'historique, et au CRM en action
 * réalisée — deux chemins finiraient par noter deux choses différentes.
 *
 * Le mail reprend le dialogue d'envoi (`DevisEmailDialog` en mode `relance`) :
 * même PDF généré depuis l'aperçu caché, mêmes pièces jointes, même .eml. Le
 * statut du devis ne change pas (voir `relanceDevis.ts`).
 *
 * `ajouterAction` vient du parent : le CRM passe celui de son `useCrmActions`,
 * sans quoi sa liste d'actions ne verrait pas la relance avant rechargement.
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Phone, Mail, BellRing } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import DevisEmailDialog, { type PreviewOptions } from '@/components/DevisEmailDialog';
import DevisPreview, { type LineImg, parseImgPct } from '@/components/DevisPreview';
import { useCRM } from '@/lib/StoreContext';
import { supabase } from '@/integrations/supabase/client';
import { logHistorique } from '@/lib/historique';
import {
  type Client, type CrmAction, type Devis, type RelanceDevis,
  calculerTotalDevis, formatDate, formatDateISO, formatMontant,
} from '@/lib/store';
import { DELAI_RELANCE_JOURS, ajouterJours, numerosDuDevis } from '@/lib/relanceDevis';

export type ModeRelanceOuvert = 'email' | 'tel';

function lireOptions(): PreviewOptions {
  const defaut: PreviewOptions = { showConso: false, showRemise: false, showComposants: false, showKgRecap: true, showLiens: false };
  try {
    const saved = localStorage.getItem('crm_devis_preview_opts');
    if (saved) return { ...defaut, ...JSON.parse(saved) };
  } catch { /* stockage indisponible */ }
  return defaut;
}

/** Les relances passées, la plus récente d'abord. */
export function HistoriqueRelances({ relances }: { relances?: RelanceDevis[] }) {
  if (!relances || relances.length === 0) return null;
  return (
    <ul className="space-y-1">
      {[...relances].reverse().map((r, i) => (
        <li key={`${r.date}-${i}`} className="flex items-start gap-1.5 text-xs text-muted-foreground">
          {r.mode === 'tel' ? <Phone className="w-3 h-3 mt-0.5 shrink-0" /> : <Mail className="w-3 h-3 mt-0.5 shrink-0" />}
          <span>
            <span className="font-medium text-foreground">{formatDate(r.date)}</span>
            {' — '}{r.mode === 'tel' ? 'téléphone' : 'mail'}
            {r.note && <span className="italic"> · {r.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface Props {
  devis: Devis | null;
  mode: ModeRelanceOuvert | null;
  onClose: () => void;
  ajouterAction?: (a: Omit<CrmAction, 'id' | 'createdAt'>) => Promise<unknown>;
}

export default function RelanceDevisDialogs({ devis, mode, onClose, ajouterAction }: Props) {
  const { clients, produits, updateDevis } = useCRM();
  const client = devis ? clients.find(c => c.id === devis.clientId) : undefined;
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [previewOptions, setPreviewOptions] = useState<PreviewOptions>(lireOptions);
  const [lineImages, setLineImages] = useState<Record<string, LineImg[]>>({});

  // Images collées dans les lignes : sans elles, le PDF de la relance ne
  // serait pas celui de l'envoi.
  const devisId = mode === 'email' ? devis?.id : undefined;
  useEffect(() => {
    if (!devisId) { setLineImages({}); return; }
    let annule = false;
    supabase.from('devis_pieces_jointes')
      .select('*')
      .eq('devis_id', devisId).eq('type', 'fichier').not('ligne_id', 'is', null)
      .then(({ data }) => {
        if (annule || !data) return;
        const map: Record<string, LineImg[]> = {};
        for (const row of data as Array<{ ligne_id: string | null; fichier_mime: string | null; fichier_url: string | null; fichier_nom: string | null; image_taille?: unknown }>) {
          if (!row.ligne_id || !row.fichier_mime?.startsWith('image/')) continue;
          (map[row.ligne_id] ??= []).push({ url: row.fichier_url ?? '', name: row.fichier_nom ?? '', taille: parseImgPct(row.image_taille) });
        }
        setLineImages(map);
      });
    return () => { annule = true; };
  }, [devisId]);

  function enregistrer(relance: RelanceDevis, prochaine: string | undefined) {
    if (!devis) return;
    const rang = (devis.relances?.length ?? 0) + 1;
    updateDevis(prev => prev.map(d => d.id === devis.id
      ? { ...d, relances: [...(d.relances ?? []), relance], dateRelance: prochaine ?? '' }
      : d));
    logHistorique({
      entiteType: 'devis', entiteId: devis.id, entiteNumero: devis.numero, action: 'relance',
      details: { mode: relance.mode, date: relance.date, rang, note: relance.note, prochaine, client: client?.societe || client?.nom },
    });
    if (ajouterAction) {
      void ajouterAction({
        clientId: devis.clientId || undefined,
        devisId: devis.id,
        type: relance.mode === 'email' ? 'email' : 'appel',
        titre: `Relance ${rang} — devis ${devis.numero}`,
        description: relance.note,
        datePlanifiee: relance.date,
        dateRealisee: relance.date,
        statut: 'realisee',
        priorite: 'normale',
      }).then(err => { if (err) toast.error('Relance notée sur le devis, mais pas au CRM'); });
    }
    toast.success(`Devis ${devis.numero} relancé`, {
      description: prochaine ? `Prochaine relance le ${formatDate(prochaine)}` : undefined,
    });
  }

  return (
    <>
      {/* Aperçu caché d'où le PDF joint à la relance est tiré — le même que l'envoi. */}
      {devis && mode === 'email' && (
        <div
          ref={pdfContainerRef}
          style={{ position: 'fixed', left: '-9999px', top: '0', width: '794px', background: 'white', zIndex: -1 }}
          aria-hidden="true"
        >
          <DevisPreview
            key={`${previewOptions.showConso}-${previewOptions.showRemise}-${previewOptions.showComposants}-${previewOptions.showKgRecap}-${previewOptions.showLiens}-${previewOptions.showCoutChantier}-${previewOptions.showCoutLigne}`}
            devis={devis}
            client={client}
            produits={produits}
            lineImages={lineImages}
            hideControls={true}
            initialShowConso={previewOptions.showConso || devis.modeCalcul === 'surface'}
            initialShowRemise={previewOptions.showRemise}
            initialShowComposants={previewOptions.showComposants}
            initialShowKgRecap={previewOptions.showKgRecap}
            initialShowLiens={previewOptions.showLiens}
            initialShowCoutChantier={previewOptions.showCoutChantier}
            initialShowCoutLigne={previewOptions.showCoutLigne}
          />
        </div>
      )}

      <DevisEmailDialog
        open={!!devis && mode === 'email'}
        onOpenChange={open => { if (!open) onClose(); }}
        devis={mode === 'email' ? devis : null}
        client={client}
        produits={produits}
        relance
        pdfContainerRef={pdfContainerRef}
        previewOptions={previewOptions}
        onPreviewOptionsChange={setPreviewOptions}
        onSent={(date, prochaine) => enregistrer({ date, mode: 'email' }, prochaine)}
      />

      <RelanceTelDialog
        devis={mode === 'tel' ? devis : null}
        client={client}
        onClose={onClose}
        onEnregistrer={(relance, prochaine) => { enregistrer(relance, prochaine); onClose(); }}
      />
    </>
  );
}

function RelanceTelDialog({ devis, client, onClose, onEnregistrer }: {
  devis: Devis | null;
  client?: Client;
  onClose: () => void;
  onEnregistrer: (relance: RelanceDevis, prochaine: string | undefined) => void;
}) {
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [prochaine, setProchaine] = useState('');

  useEffect(() => {
    if (!devis) return;
    const aujourdhui = formatDateISO(new Date());
    setDate(aujourdhui);
    setNote('');
    setProchaine(ajouterJours(aujourdhui, DELAI_RELANCE_JOURS));
  }, [devis]);

  if (!devis) return null;
  const numeros = numerosDuDevis(devis, client);
  const total = calculerTotalDevis(devis.lignes, devis.fraisPortHT || 0, devis.fraisPortTVA ?? 20).totalHT;

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" /> Relance téléphonique — {devis.numero}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="rounded-md border px-3 py-2 text-sm space-y-1">
            <p className="font-medium">{client?.societe || client?.nom || '—'}</p>
            <p className="text-muted-foreground text-xs">
              {formatMontant(total)} HT
              {devis.dateEnvoi && <> · envoyé le {formatDate(devis.dateEnvoi)}</>}
              {devis.referenceAffaire && <> · {devis.referenceAffaire}</>}
              {devis.chantier && <> · chantier {devis.chantier}</>}
            </p>
            {numeros.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {numeros.map(n => (
                  <a key={n.numero} href={`tel:${n.numero.replace(/[^\d+]/g, '')}`}
                    className="inline-flex items-center gap-1 text-xs rounded-full border px-2.5 py-1 hover:bg-muted text-primary">
                    <Phone className="w-3 h-3" /> {n.numero}
                    <span className="text-muted-foreground">· {n.libelle}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-600 pt-1">Aucun numéro sur la fiche client ni sur le contact du devis.</p>
            )}
          </div>

          {(devis.relances?.length ?? 0) > 0 && (
            <div>
              <Label className="flex items-center gap-1.5 mb-1"><BellRing className="w-3.5 h-3.5" /> Relances précédentes</Label>
              <HistoriqueRelances relances={devis.relances} />
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            <div>
              <Label>Date de l'appel</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-44" />
            </div>
            <div>
              <Label>Prochaine relance</Label>
              <Input type="date" value={prochaine} onChange={e => setProchaine(e.target.value)} className="w-44" />
            </div>
          </div>
          <div className="flex gap-1.5 -mt-2">
            {[3, 7, 15, 30].map(j => (
              <button key={j} type="button" onClick={() => setProchaine(ajouterJours(date || formatDateISO(new Date()), j))}
                className="text-xs rounded-full border px-2.5 py-0.5 text-muted-foreground hover:bg-muted">
                + {j} j
              </button>
            ))}
          </div>
          <div>
            <Label>Compte rendu</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} rows={4}
              placeholder="Ce que le client a dit : décision attendue, concurrent, budget, rappel convenu…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button disabled={!date} onClick={() => onEnregistrer({ date, mode: 'tel', ...(note.trim() ? { note: note.trim() } : {}) }, prochaine || undefined)}>
            <Phone className="w-4 h-4 mr-2" /> Enregistrer l'appel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
