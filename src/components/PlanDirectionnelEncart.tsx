import { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';
import { formatMontant } from '@/lib/store';
import {
  bilanPlan, gammeParDefaut, aFabriquer, LIBELLE_GAMME,
  type EnsemblePlan, type GammeDirectionnelle, type LigneDemandePlan,
} from '@/lib/planDirectionnel';

/**
 * L'encart d'un carnet de plans directionnels Kadri, dans l'analyse d'un
 * document.
 *
 * Il dit ce que le carnet contient — y compris ce qu'on ne chiffre pas :
 * déposes, existants conservés, ensembles illisibles — et c'est ici qu'on
 * tranche la gamme de fabrication des gammes Kadri qui n'ont pas de
 * correspondance d'office. Les lignes elles-mêmes restent celles de la
 * demande, plus bas : article Odoo, prix du contrat et devis suivent le
 * chemin commun.
 */
export default function PlanDirectionnelEncart({
  ensembles, gammes, onGamme, lignes, prixLigne, niveau,
}: {
  ensembles: EnsemblePlan[];
  gammes: Record<string, GammeDirectionnelle>;
  onGamme: (produitKadri: string, gamme: GammeDirectionnelle) => void;
  lignes: LigneDemandePlan[];
  /** Prix unitaire retenu pour la ligne i et d'où il vient, `null` sans prix. */
  prixLigne: (i: number) => { prix: number; source: string } | null;
  niveau: string;
}) {
  const bilan = useMemo(() => bilanPlan(ensembles), [ensembles]);
  /* Seules les gammes qui portent un panneau à fabriquer méritent un choix. */
  const gammesAChoisir = useMemo(() => bilan.produits.filter(p =>
    ensembles.some(e => e.produit === p && e.panneaux.some(aFabriquer))), [bilan, ensembles]);

  const total = lignes.reduce((t, l, i) => t + (prixLigne(i)?.prix ?? 0) * l.quantite, 0);
  const aVerifier = lignes.filter((l, i) => l.aVerifier || !prixLigne(i)).length;
  const fabriques = bilan.panneaux.neuf + bilan.panneaux.remplace;

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-2 space-y-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/15 text-primary">plan Kadri</span>
        <span className="font-medium">Signalisation directionnelle</span>
        <span className="text-muted-foreground">
          {bilan.ensembles} ensembles · {fabriques} panneaux à fabriquer
          ({bilan.surfaceAFabriquer.toLocaleString('fr-FR')} m²) · {bilan.supportsNeufs} support(s) neuf(s)
        </span>
      </div>

      <p className="text-muted-foreground">
        Chiffré : les panneaux en « Pose » — {bilan.panneaux.remplace} en remplacement
        de l'existant, {bilan.panneaux.neuf} neuf(s). Non chiffré : {bilan.panneaux.depose} dépose(s)
        seule(s), {bilan.panneaux.supprime} à supprimer, {bilan.panneaux.existant} conservé(s)
        et {bilan.supportsExistants} support(s) existant(s).
      </p>

      {bilan.sansPanneau.length > 0 && (
        <p className="flex items-start gap-1 text-warning">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            Aucun panneau lisible, à regarder sur le plan :{' '}
            {bilan.sansPanneau.map(s => `${s.ensemble} (p. ${s.page})`).join(', ')}.
          </span>
        </p>
      )}

      {gammesAChoisir.length > 0 && (
        <div className="space-y-1">
          <p className="font-medium">Gamme de fabrication</p>
          {gammesAChoisir.map(p => (
            <div key={p} className="flex items-center gap-2">
              <span className="w-44 truncate" title={p}>{p}</span>
              <Select
                value={gammes[p] ?? gammeParDefaut(p)}
                onValueChange={v => onGamme(p, v as GammeDirectionnelle)}
              >
                <SelectTrigger className="h-7 w-60 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(LIBELLE_GAMME) as GammeDirectionnelle[]).map(g => (
                    <SelectItem key={g} value={g} className="text-[11px]">{LIBELLE_GAMME[g]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <p className="text-muted-foreground">
            Seul le caisson a une correspondance d'office (profil 50). Les autres gammes Kadri
            restent sans référence tant qu'on n'en a pas choisi une : on ne la devine pas.
          </p>
        </div>
      )}

      <div className="max-h-72 overflow-auto rounded border border-border bg-background">
        <table className="w-full table-fixed text-[11px]">
          <thead className="sticky top-0 bg-muted text-muted-foreground">
            <tr>
              <th className="w-9 px-1.5 py-1 text-right font-medium">Qté</th>
              <th className="w-48 px-1.5 py-1 text-left font-medium">Référence</th>
              <th className="px-1.5 py-1 text-left font-medium">Désignation</th>
              <th className="w-20 px-1.5 py-1 text-right font-medium">PU HT</th>
              <th className="w-20 px-1.5 py-1 text-right font-medium">Total HT</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => {
              const p = prixLigne(i);
              return (
                <tr key={i} className="border-t border-border align-top">
                  <td className="px-1.5 py-1 text-right">{l.quantite}</td>
                  <td className="px-1.5 py-1 font-mono break-all">
                    {l.reference || <span className="text-warning">à vérifier</span>}
                  </td>
                  <td className="px-1.5 py-1 break-words">
                    <div>{l.description}</div>
                    {l.aVerifier && <div className="text-warning">{l.aVerifier}</div>}
                    <div className="text-muted-foreground truncate" title={l.ensembles.join(', ')}>
                      {l.ensembles.length} ensemble(s) : {l.ensembles.join(', ')}
                    </div>
                  </td>
                  <td className="px-1.5 py-1 text-right whitespace-nowrap">
                    {p ? formatMontant(p.prix) : '—'}
                    {p && <div className="text-muted-foreground">{p.source}</div>}
                  </td>
                  <td className="px-1.5 py-1 text-right whitespace-nowrap">
                    {p ? formatMontant(p.prix * l.quantite) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">
          Niveau {niveau}. {aVerifier > 0 ? `${aVerifier} ligne(s) sans prix, hors du total.` : 'Toutes les lignes sont chiffrées.'}
        </span>
        <span className="font-semibold">{formatMontant(total)} HT</span>
      </div>
    </div>
  );
}
