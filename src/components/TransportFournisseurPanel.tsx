import { useState } from 'react';
import { Loader2, Plus, Trash2, Truck, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMontant, type ModeTransport, type PalierPortPoids } from '@/lib/store';
import {
  LIBELLE_MODE, analyserTransportFournisseur, fusionnerPaliers, type TransportLu,
} from '@/lib/transportFournisseur';

/**
 * Onglet Transport de la fiche fournisseur : franco, coût fixe et paliers de
 * poids (avec leur mode : Chronopost, messagerie, affrètement).
 *
 * Un PDF déposé (tarif du transporteur, devis, commande ou facture) est lu,
 * montré, puis intégré aux paliers au clic — un palier lu remplace celui du
 * même poids, les autres restent. Tout reste modifiable à la main, et rien
 * n'est enregistré avant « Modifier » : on édite le formulaire de la fiche.
 */
interface Valeur {
  francoPort: number;
  coutTransport: number;
  paliersPortPoids?: PalierPortPoids[];
}

interface Props {
  valeur: Valeur;
  onChange: (patch: Partial<Valeur>) => void;
}

const MODES: ModeTransport[] = ['chronopost', 'messagerie', 'affretement'];

export default function TransportFournisseurPanel({ valeur, onChange }: Props) {
  const paliers = valeur.paliersPortPoids ?? [];
  const [survol, setSurvol] = useState(false);
  const [lecture, setLecture] = useState(false);
  const [lu, setLu] = useState<{ nom: string; donnees: TransportLu; franco: boolean } | null>(null);

  const majPalier = (i: number, patch: Partial<PalierPortPoids>) =>
    onChange({ paliersPortPoids: paliers.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  async function lire(files: File[]) {
    const f = files[0];
    if (!f) return;
    setLecture(true);
    try {
      const donnees = await analyserTransportFournisseur(f);
      if (!donnees.paliers.length && !donnees.francoPort) {
        toast.error('Aucun tarif de port lisible dans ce document (poids et port requis).');
      } else {
        setLu({ nom: f.name, donnees, franco: !!donnees.francoPort });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lecture impossible');
    }
    setLecture(false);
  }

  function integrer() {
    if (!lu) return;
    const patch: Partial<Valeur> = { paliersPortPoids: fusionnerPaliers(paliers, lu.donnees.paliers) };
    if (lu.franco && lu.donnees.francoPort) patch.francoPort = lu.donnees.francoPort;
    onChange(patch);
    toast.success('Tarifs intégrés — vérifiez puis cliquez sur Modifier pour enregistrer.');
    setLu(null);
  }

  const d = lu?.donnees;

  return (
    <div className="space-y-3 py-2">
      <div
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setSurvol(true); }}
        onDragLeave={() => setSurvol(false)}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); setSurvol(false); void lire(Array.from(e.dataTransfer.files)); }}
        className={`rounded-xl border-2 border-dashed p-4 text-center ${survol ? 'border-primary bg-primary/10' : 'border-border bg-muted/20'}`}
      >
        {lecture ? (
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />Lecture du document…
          </p>
        ) : (<>
          <Truck className="w-6 h-6 mx-auto mb-1.5 text-muted-foreground" />
          <p className="text-sm font-medium">Glissez ici un tarif de transport, un devis, une commande ou une facture (PDF)</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Une grille donne les paliers de poids ; un devis ou une facture met à jour le port pour son poids.
          </p>
          <label className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 cursor-pointer">
            <Upload className="w-3 h-3" />ou choisir un fichier
            <input type="file" accept="application/pdf,.pdf" className="hidden"
              onChange={e => { void lire(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          </label>
        </>)}
      </div>

      {lu && d && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2 text-sm">
          <p className="font-semibold">
            Lu dans {lu.nom}
            <span className="font-normal text-muted-foreground">
              {' '}· {d.type}{d.transporteur ? ` · ${d.transporteur}` : ''}{d.reference ? ` · n° ${d.reference}` : ''}
            </span>
          </p>
          {d.poidsKg != null && d.portHT != null && (
            <p className="text-xs text-muted-foreground">
              Relevé : {d.poidsKg} kg · port {formatMontant(d.portHT)} HT
              {d.montantMarchandiseHT != null ? ` · marchandise ${formatMontant(d.montantMarchandiseHT)} HT` : ''}
            </p>
          )}
          <ul className="text-xs space-y-0.5">
            {d.paliers.map(p => (
              <li key={p.poidsMin}>
                dès {p.poidsMin} kg → <strong>{formatMontant(p.coutTransport)}</strong>
                {p.mode ? ` (${LIBELLE_MODE[p.mode]})` : ''}
                {paliers.some(x => x.poidsMin === p.poidsMin) && <span className="text-amber-600"> — remplace le palier existant</span>}
              </li>
            ))}
          </ul>
          {d.francoPort != null && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={lu.franco} onChange={e => setLu({ ...lu, franco: e.target.checked })} />
              Reprendre le franco annoncé : {formatMontant(d.francoPort)} (actuel : {formatMontant(valeur.francoPort)})
            </label>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={integrer} disabled={!d.paliers.length && !(lu.franco && d.francoPort)}>Intégrer</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setLu(null)}>Ignorer</Button>
          </div>
        </div>
      )}

      <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
        <p className="text-sm font-semibold text-foreground">Conditions de livraison</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Franco de port (€)</Label>
            <Input type="number" step="0.01" value={valeur.francoPort}
              onChange={e => onChange({ francoPort: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <Label className="text-xs">Coût transport (€)</Label>
            <Input type="number" step="0.01" value={valeur.coutTransport}
              onChange={e => onChange({ coutTransport: parseFloat(e.target.value) || 0 })} />
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Port par tranche de poids (le palier atteint remplace le coût fixe ; franco prioritaire)</Label>
          {paliers.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">dès</span>
              <Input type="number" step="1" className="h-8 w-20" value={p.poidsMin}
                onChange={e => majPalier(i, { poidsMin: parseFloat(e.target.value) || 0 })} />
              <span className="text-xs text-muted-foreground shrink-0">kg →</span>
              <Input type="number" step="0.01" className="h-8 w-24" value={p.coutTransport}
                onChange={e => majPalier(i, { coutTransport: parseFloat(e.target.value) || 0 })} />
              <span className="text-xs text-muted-foreground shrink-0">€</span>
              <Select value={p.mode ?? 'aucun'} onValueChange={v => majPalier(i, { mode: v === 'aucun' ? undefined : v as ModeTransport })}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aucun">Mode non précisé</SelectItem>
                  {MODES.map(m => <SelectItem key={m} value={m}>{LIBELLE_MODE[m]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2"
                onClick={() => onChange({ paliersPortPoids: paliers.filter((_, j) => j !== i) })}>
                <Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => onChange({ paliersPortPoids: [...paliers, { poidsMin: 0, coutTransport: 0 }] })}>
            <Plus className="w-3.5 h-3.5 mr-1" />Ajouter un palier</Button>
        </div>
      </div>
    </div>
  );
}
