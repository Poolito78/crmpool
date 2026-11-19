/**
 * Les panneaux détectés sur un plan en image (`panneauxSurPlan.ts`), un par
 * un, avec leur vignette : on voit ce que la détection a vu, et l'on choisit
 * le code de ceux qu'elle n'a pas su nommer.
 *
 * Le code choisi s'écrit dans le LIBELLÉ de la ligne (`onChoisir`), comme une
 * correction à la main : toute la suite — grille, support, brides, Odoo —
 * repart de ce libellé. Rien n'est retenu sans clic quand la reconnaissance
 * hésite.
 */
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ScanSearch } from 'lucide-react';
import type { PanneauDetecte } from '@/lib/panneauxSurPlan';

interface Props {
  panneaux: PanneauDetecte[];
  /** Indice, dans les lignes de la demande, de la ligne du premier panneau. */
  premier: number;
  /** Nombre de panneaux annoncé par le mail (« voici les 7 panneaux »). */
  annonce: number | null;
  /** Le code que porte aujourd'hui la ligne `i` (null = à vérifier). */
  codeLigne: (i: number) => string | null;
  onChoisir: (i: number, code: string) => void;
  onVoirLigne: (i: number) => void;
}

export function PanneauxPlanEncart({ panneaux, premier, annonce, codeLigne, onChoisir, onVoirLigne }: Props) {
  const [saisie, setSaisie] = useState<Record<number, string>>({});
  const aVerifier = panneaux.filter((_, k) => !codeLigne(premier + k)).length;
  const compteOk = annonce == null || annonce === panneaux.length;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <ScanSearch className="w-4 h-4 text-primary" />
        <span className="font-medium">
          {panneaux.length} panneau{panneaux.length > 1 ? 'x' : ''} détecté{panneaux.length > 1 ? 's' : ''} sur le plan
        </span>
        {annonce != null && (
          <span className={compteOk ? 'text-success' : 'text-warning'}>
            {compteOk
              ? `· le mail en annonce ${annonce}`
              : `· le mail en annonce ${annonce} : à vérifier sur le plan`}
          </span>
        )}
        {aVerifier > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-warning">
            <AlertTriangle className="w-3 h-3" />
            {aVerifier} code{aVerifier > 1 ? 's' : ''} à vérifier — non chiffré{aVerifier > 1 ? 's' : ''} tant qu’il n’est pas choisi
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Le plan ne porte aucune cote : les panneaux se chiffrent à la gamme et à la classe choisies plus bas.
        Un code proposé ne se retient qu’au clic.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {panneaux.map((p, k) => {
          const i = premier + k;
          const code = codeLigne(i);
          return (
            <div key={k} className="flex items-start gap-2 rounded border bg-background p-1.5 text-xs">
              {p.vignette
                ? <img src={p.vignette} alt={`Panneau n° ${k + 1}`}
                    className="h-14 w-14 shrink-0 rounded border object-contain [image-rendering:pixelated]" />
                : <div className="h-14 w-14 shrink-0 rounded border bg-muted" />}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-1.5">
                  <button type="button" className="text-muted-foreground hover:underline" onClick={() => onVoirLigne(i)}>
                    n° {k + 1}{p.page > 1 ? ` (page ${p.page})` : ''}
                  </button>
                  {code
                    ? <span className="inline-flex items-center gap-1 font-semibold text-success">
                        <CheckCircle2 className="w-3 h-3" />{code}
                      </span>
                    : <span className="font-medium text-warning">code à vérifier</span>}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {p.candidats.map(c => (
                    <button key={c.code} type="button"
                      title={`Ressemblance avec le pictogramme IISR ${c.code} (écart ${c.distance})`}
                      onClick={() => onChoisir(i, c.code)}
                      className={`rounded border px-1.5 py-0.5 text-[11px] ${code === c.code
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary'}`}>
                      {c.code}
                    </button>
                  ))}
                  <input
                    value={saisie[k] ?? ''}
                    placeholder="autre…"
                    onChange={e => setSaisie(s => ({ ...s, [k]: e.target.value }))}
                    onKeyDown={e => {
                      const v = (saisie[k] ?? '').trim();
                      if (e.key === 'Enter' && v) { onChoisir(i, v); setSaisie(s => ({ ...s, [k]: '' })); }
                    }}
                    title="Code IISR (B21-1, B21a2…), validé par Entrée"
                    className="h-6 w-20 rounded border border-border bg-background px-1 text-[11px] focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
