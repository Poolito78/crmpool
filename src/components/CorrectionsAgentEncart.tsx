/**
 * Encart de l'éditeur de devis : ce que le commercial a corrigé dans la
 * proposition de l'analyse de document (`correctionsDevis.ts`).
 *
 * Les articles changés sur une ligne qui porte la demande du client sont
 * appris à l'enregistrement (badge « appris ») ; quantités, ajouts et
 * retraits sont montrés et se copient en relevé — ils se corrigent dans une
 * règle de chiffrage. La demande d'origine se relit en dessous.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, GraduationCap } from 'lucide-react';
import type { LigneDevis, Produit } from '@/lib/store';
import { useMemoireArticles } from '@/lib/memoireArticles';
import {
  corrections, LIBELLE_CORRECTION, releveCorrections,
  type ChiffrageAnalyse, type CorrectionDevis, type LigneProposee,
} from '@/lib/correctionsDevis';

interface Props {
  chiffrage: ChiffrageAnalyse;
  lignes: LigneDevis[];
  produits: Produit[];
  numero?: string;
  client?: string;
}

const COULEUR: Record<CorrectionDevis['type'], string> = {
  article: 'bg-primary/15 text-primary',
  quantite: 'bg-warning/15 text-warning',
  prix: 'bg-muted text-muted-foreground',
  ajout: 'bg-success/15 text-success',
  retrait: 'bg-destructive/15 text-destructive',
};

const court = (l?: LigneProposee) =>
  l ? `${l.reference ? `${l.reference} — ` : ''}${l.description} × ${l.quantite}` : '';

export default function CorrectionsAgentEncart({ chiffrage, lignes, produits, numero, client }: Props) {
  const [ouvert, setOuvert] = useState(false);
  /* Charge la mémoire de l'analyseur pendant que le devis est ouvert :
     l'enregistrement (`apprendreCorrections`, Devis.tsx) la lit par `souvenirDe`. */
  useMemoireArticles();
  const cs = useMemo(() => corrections(chiffrage, lignes, produits), [chiffrage, lignes, produits]);

  function copier() {
    const t = releveCorrections(cs, { numero, client, chiffrage });
    navigator.clipboard.writeText(t)
      .then(() => toast.success('Relevé des corrections copié'))
      .catch(() => toast.error('Copie impossible'));
  }

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setOuvert(o => !o)} className="flex items-center gap-2 text-sm font-semibold text-left">
          <GraduationCap className="h-4 w-4 text-primary" />
          Proposition de l'agent
          <span className="font-normal text-muted-foreground">
            — {cs.length === 0 ? 'aucune correction' : `${cs.length} correction${cs.length > 1 ? 's' : ''}`}
          </span>
        </button>
        {cs.length > 0 && (
          <button type="button" onClick={copier} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Copy className="h-3 w-3" /> Copier le relevé
          </button>
        )}
      </div>

      {ouvert && (
        <div className="space-y-2">
          {cs.length > 0 && (
            <div className="space-y-1 text-[11px]">
              {cs.map((c, i) => {
                const appris = c.type === 'article' && !!c.avant?.demandeClient && !!c.apres?.produitId;
                return (
                  <div key={i} className="flex gap-2 items-start">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 font-medium ${COULEUR[c.type]}`}>{LIBELLE_CORRECTION[c.type]}</span>
                    <span className="flex-1 min-w-0">
                      {c.type === 'ajout' ? court(c.apres)
                        : c.type === 'retrait' ? court(c.avant)
                        : <>{court(c.avant)} <span className="text-muted-foreground">→</span> {court(c.apres)}</>}
                      {c.avant?.demandeClient && (
                        <span className="block text-muted-foreground italic">demande : « {c.avant.demandeClient} »</span>
                      )}
                    </span>
                    {appris && <span className="shrink-0 text-primary font-medium" title="Retenu par la mémoire de l'analyseur à l'enregistrement">appris</span>}
                  </div>
                );
              })}
              <p className="text-muted-foreground pt-1">
                Les articles changés sont appris à l'enregistrement. Quantités, ajouts et retraits se copient en relevé.
              </p>
            </div>
          )}
          {chiffrage.demande && (
            <details className="text-[11px]">
              <summary className="cursor-pointer text-muted-foreground">
                Demande du client{chiffrage.pieces?.length ? ` — ${chiffrage.pieces.join(', ')}` : ''}
              </summary>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap font-sans bg-background rounded p-2 border border-border">{chiffrage.demande}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
