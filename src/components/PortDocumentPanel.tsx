import { CheckCircle2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LIBELLE_SOURCE_PORT } from '@/lib/portReel';
import { formatMontant, portFournisseur, type Fournisseur, type ModeTransport } from '@/lib/store';
import { LIBELLE_MODE } from '@/lib/transportFournisseur';

/**
 * Les frais de transport lus sur un document fournisseur, à intégrer à sa
 * fiche : « 184,90 € dès 1 032 kg, livraison 77 » devient un palier, donc le
 * coût d'achat des prochains transports (`portFournisseur`). Rien n'est écrit
 * avant le clic, et tout se corrige ici : on peut par exemple arrondir le
 * palier à 1 000 kg. Le parent porte les valeurs, car la création de la
 * commande les reprend.
 */
export interface PortSaisi {
  fournisseurId: string;
  cout: string;
  poids: string;
  dept: string;
  mode: ModeTransport | '';
}

interface Props {
  valeur: PortSaisi;
  onChange: (patch: Partial<PortSaisi>) => void;
  /** D'où vient le poids (« poids brut du document », « fiches articles »…). */
  originePoids: string;
  /** Lignes d'article sans poids connu : le poids proposé est alors partiel. */
  alertePoids?: string;
  origineDept: string;
  /** Marchandises HT du document, port exclu : la base du franco. */
  montantMarchandise: number;
  fournisseurs: Fournisseur[];
  integre: boolean;
  onIntegrer: () => void;
  onOuvrirFiche: (id: string) => void;
}

const nombre = (s: string) => parseFloat(s.replace(',', '.')) || 0;
const MODES: ModeTransport[] = ['chronopost', 'messagerie', 'affretement'];

export default function PortDocumentPanel({
  valeur, onChange, originePoids, alertePoids, origineDept, montantMarchandise, fournisseurs, integre, onIntegrer, onOuvrirFiche,
}: Props) {
  const f = fournisseurs.find(x => x.id === valeur.fournisseurId);
  const cout = nombre(valeur.cout);
  const poids = Math.floor(nombre(valeur.poids));
  const dept = valeur.dept || undefined;
  const attendu = f ? portFournisseur(f, poids, montantMarchandise, dept) : null;
  const ecart = attendu ? Math.abs(attendu.montant - cout) > 0.005 : false;
  const existant = f?.paliersPortPoids?.find(p => p.poidsMin === poids && (p.dept ?? '') === (valeur.dept ?? ''));
  const dejaLa = poids > 0 && !!existant && Math.abs(existant.coutTransport - cout) <= 0.005;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Truck className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">Frais de transport du document</span>
        <Select value={valeur.fournisseurId || '__aucun__'}
          onValueChange={v => onChange({ fournisseurId: v === '__aucun__' ? '' : v })}>
          <SelectTrigger className="h-8 text-xs w-auto min-w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__aucun__"><span className="text-xs">Fournisseur à choisir</span></SelectItem>
            {[...fournisseurs].sort((a, b) => (a.societe || a.nom).localeCompare(b.societe || b.nom)).map(x => (
              <SelectItem key={x.id} value={x.id}><span className="text-xs">{x.societe || x.nom}</span></SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Input className="h-8 w-24 text-xs text-right" inputMode="decimal" value={valeur.cout}
          onChange={e => onChange({ cout: e.target.value })} />
        <span>€ HT dès</span>
        <Input className="h-8 w-24 text-xs text-right" inputMode="decimal" value={valeur.poids}
          onChange={e => onChange({ poids: e.target.value })} />
        <span>kg, livraison dépt</span>
        <Input className="h-8 w-16 text-xs" maxLength={3} placeholder="tous" value={valeur.dept}
          onChange={e => onChange({ dept: e.target.value.replace(/[^0-9AaBb]/g, '').slice(0, 3).toUpperCase() })} />
        <Select value={valeur.mode || 'aucun'} onValueChange={v => onChange({ mode: v === 'aucun' ? '' : v as ModeTransport })}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="aucun"><span className="text-xs">Mode non précisé</span></SelectItem>
            {MODES.map(m => <SelectItem key={m} value={m}><span className="text-xs">{LIBELLE_MODE[m]}</span></SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Poids : {originePoids}{origineDept ? ` · Département : ${origineDept}` : ''}
      </p>
      {alertePoids && <p className="text-[11px] text-warning">{alertePoids}</p>}
      {!valeur.dept && (
        <p className="text-[11px] text-warning">Sans département, le palier vaudra pour toutes les destinations.</p>
      )}
      {poids <= 0 && (
        <p className="text-[11px] text-warning">Sans poids, ce montant devient le coût de transport fixe de la fiche.</p>
      )}

      {f && (
        <p className="text-[11px]">
          {attendu
            ? `D'après la fiche ${f.societe || f.nom} (${LIBELLE_SOURCE_PORT[attendu.source]}${attendu.approximatif ? ', autre destination : estimation' : ''}) : ${formatMontant(attendu.montant)}${ecart ? ' — écart avec le document' : ' — conforme'}.`
            : `La fiche ${f.societe || f.nom} ne permet pas de prévoir ce port.`}
          {existant && !dejaLa && !integre && (
            <span className="text-warning"> Remplacera le palier à {formatMontant(existant.coutTransport)} de ce poids et de cette destination.</span>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!f || cout <= 0 || integre || dejaLa} onClick={onIntegrer}>
          {integre || dejaLa
            ? <><CheckCircle2 className="w-4 h-4 mr-1.5" />Déjà sur la fiche {f?.societe || f?.nom}</>
            : <><Truck className="w-4 h-4 mr-1.5" />Intégrer à la fiche {f ? (f.societe || f.nom) : 'fournisseur'}</>}
        </Button>
        {f && (
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => onOuvrirFiche(f.id)}>
            Voir le transport de la fiche
          </Button>
        )}
      </div>
    </div>
  );
}
