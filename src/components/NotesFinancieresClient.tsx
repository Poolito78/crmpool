import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  calculerNote, chercherEntreprise, liensSources, sirenDe,
  type EntrepriseFinance, type LettreNote,
} from '@/lib/notesFinancieres';

/**
 * « Notes financières » de l'onglet Comptabilité de la fiche client.
 *
 * Lit l'API Recherche d'entreprises (data.gouv.fr) par le SIREN du SIRET de la
 * fiche, et affiche la note /100 critère par critère — voir `notesFinancieres.ts`
 * pour le calcul et ses limites. Rien n'est écrit en base : la note se
 * recalcule à l'ouverture, sur des données publiques toujours à jour.
 * Les liens Pappers / Societe.com / Infogreffe ouvrent la fiche du même SIREN.
 */

const COULEUR: Record<LettreNote, string> = { A: '#22c55e', B: '#84cc16', C: '#f59e0b', D: '#ef4444' };
const LIBELLE: Record<LettreNote, string> = { A: 'Fiable', B: 'Correct', C: 'À surveiller', D: 'Risque' };

/** Mémoire de session : rouvrir la fiche ne relance pas l'API. */
const cache = new Map<string, EntrepriseFinance | null>();

export default function NotesFinancieresClient({ siret }: { siret?: string }) {
  const siren = sirenDe(siret);
  const [entreprise, setEntreprise] = useState<EntrepriseFinance | null | undefined>(siren ? cache.get(siren) : undefined);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async (forcer: boolean) => {
    if (!siren) return;
    if (!forcer && cache.has(siren)) { setEntreprise(cache.get(siren)); return; }
    setChargement(true);
    setErreur('');
    try {
      const e = await chercherEntreprise(siren);
      cache.set(siren, e);
      setEntreprise(e);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Impossible de contacter l’API entreprises.');
    } finally {
      setChargement(false);
    }
  }, [siren]);

  useEffect(() => { void charger(false); }, [charger]);

  if (!siren) {
    return (
      <div className="rounded-lg border border-border p-4 space-y-1">
        <h3 className="font-semibold text-sm">Notes financières</h3>
        <p className="text-xs text-muted-foreground">Renseignez le SIRET ci-dessus (ou utilisez la recherche entreprise de l’onglet Infos) pour obtenir la note.</p>
      </div>
    );
  }

  const note = entreprise ? calculerNote(entreprise) : null;

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-sm">Notes financières</h3>
          <p className="text-xs text-muted-foreground">Données publiques data.gouv.fr (SIREN {siren}) — indicatif, ce n’est pas une cotation de crédit.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void charger(true)} disabled={chargement}>
          {chargement ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
          Actualiser
        </Button>
      </div>

      {erreur && <p className="text-xs text-destructive">{erreur}</p>}
      {entreprise === null && !chargement && !erreur && (
        <p className="text-xs text-muted-foreground">Aucune entreprise trouvée pour ce SIREN : vérifiez le SIRET.</p>
      )}

      {entreprise && note && (
        <>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center justify-center w-16 h-16 rounded-full text-white text-2xl font-bold" style={{ background: COULEUR[note.lettre] }}>
              {note.lettre}
            </div>
            <div>
              <div className="text-lg font-semibold">{note.note} / 100 — {LIBELLE[note.lettre]}</div>
              <div className="text-xs text-muted-foreground">
                {entreprise.nom}{entreprise.formeJuridique ? ` · ${entreprise.formeJuridique}` : ''}{entreprise.active ? '' : ' · CESSÉE'}
              </div>
              {note.partielle && <div className="text-xs text-amber-600">Note partielle : des données manquent (critères « à vérifier »).</div>}
            </div>
          </div>

          {note.alertes.length > 0 && (
            <ul className="text-xs space-y-0.5 rounded-md bg-amber-50 border border-amber-200 p-2 text-amber-900">
              {note.alertes.map(a => <li key={a}>⚠ {a}</li>)}
            </ul>
          )}

          <table className="w-full text-xs">
            <tbody>
              {note.criteres.map(c => (
                <tr key={c.cle} className="border-t border-border/60">
                  <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{c.libelle}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{c.detail}</td>
                  <td className="py-1.5 text-right font-mono whitespace-nowrap">
                    {c.points === null ? <span className="text-amber-600">à vérifier</span> : `${c.points} / ${c.max}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="flex gap-2 flex-wrap pt-1">
        <span className="text-xs text-muted-foreground self-center">Voir la fiche :</span>
        {liensSources(siren).map(l => (
          <a key={l.cle} href={l.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 h-7 px-2 rounded border border-border text-xs hover:bg-muted">
            {l.libelle} <ExternalLink className="w-3 h-3" />
          </a>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground italic">
        Pappers, Societe.com et Infogreffe n’ont pas d’accès gratuit à leurs notes : leurs fiches s’ouvrent dans un nouvel onglet. Procédures collectives (BODACC) et incidents de paiement : à lire sur l’Annuaire.
      </p>
    </div>
  );
}
