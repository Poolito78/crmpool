import { Fragment, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatMontant } from '@/lib/store';
import {
  bilanPlan, gammeParDefaut, aFabriquer, titreEnsemble, matRemplacable, LIBELLE_GAMME, TAUX_PAL_REFERENCE,
  type EnsemblePlan, type GammeDirectionnelle, type LigneDemandePlan, type RegroupementPlan,
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
 * chemin commun — un clic sur « à vérifier » y descend.
 *
 * Un mât EXISTANT n'est pas commandé ; un mât neuf s'y ajoute à la demande,
 * ensemble par ensemble (`avecMatNeuf`).
 */
export default function PlanDirectionnelEncart({
  ensembles, gammes, onGamme, regroupement, onRegroupement, classe, onClasse,
  tauxPal, onTauxPal, lignes, prixLigne, niveau, matsNeufs, onMatsNeufs, onVoirLigne,
}: {
  ensembles: EnsemblePlan[];
  gammes: Record<string, GammeDirectionnelle>;
  onGamme: (produitKadri: string, gamme: GammeDirectionnelle) => void;
  regroupement: RegroupementPlan;
  onRegroupement: (r: RegroupementPlan) => void;
  /** Classe imposée au carnet ; `null` = celle du plan Kadri. */
  classe: number | null;
  onClasse: (c: number | null) => void;
  /** Taux PAL au m² saisi ; `null` = référence (140 € en C2) puis contrat. */
  tauxPal: number | null;
  onTauxPal: (t: number | null) => void;
  lignes: LigneDemandePlan[];
  /** Prix unitaire retenu pour la ligne i et d'où il vient, `null` sans prix. */
  prixLigne: (i: number) => { prix: number; source: string } | null;
  niveau: string;
  /** Ensembles dont le mât existant est remplacé par un mât neuf. */
  matsNeufs: string[];
  onMatsNeufs: (ensembles: string[]) => void;
  /** Descend à la ligne i de la demande, là où elle se corrige. */
  onVoirLigne: (i: number) => void;
}) {
  const bilan = useMemo(() => bilanPlan(ensembles), [ensembles]);
  /* Seules les gammes Kadri qui portent un panneau à fabriquer méritent un
     choix ; chacune prend Lapérouse P50 tant qu'on ne dit rien. */
  const gammesAChoisir = useMemo(() => bilan.produits.filter(p =>
    ensembles.some(e => e.produit === p && e.panneaux.some(aFabriquer))), [bilan, ensembles]);
  /* Sous-total de chaque ensemble, affiché sur sa ligne de titre. */
  const totalEnsemble = (nom: string) => lignes.reduce((t, l, i) =>
    t + (l.ensemble?.nom === nom ? (prixLigne(i)?.prix ?? 0) * l.quantite : 0), 0);

  const total = lignes.reduce((t, l, i) => t + (prixLigne(i)?.prix ?? 0) * l.quantite, 0);
  const aVerifier = lignes.filter((l, i) => l.aVerifier || !prixLigne(i)).length;
  const fabriques = bilan.panneaux.neuf + bilan.panneaux.remplace;
  /* Ensembles à mât existant qu'un mât neuf de la grille pourrait remplacer. */
  const matsExistants = useMemo(() => ensembles.filter(matRemplacable), [ensembles]);
  const basculerMat = (nom: string) => onMatsNeufs(matsNeufs.includes(nom)
    ? matsNeufs.filter(n => n !== nom) : [...matsNeufs, nom]);

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

      <div className="flex items-center gap-2">
        <span className="font-medium">Présentation du devis</span>
        <Select value={regroupement} onValueChange={v => onRegroupement(v as RegroupementPlan)}>
          <SelectTrigger className="h-7 w-60 text-[11px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ensemble" className="text-[11px]">Par ensemble (noms du plan Kadri)</SelectItem>
            <SelectItem value="reference" className="text-[11px]">Par référence (quantités cumulées)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-medium">Classe</span>
        <Select value={classe ? String(classe) : 'plan'} onValueChange={v => onClasse(v === 'plan' ? null : Number(v))}>
          <SelectTrigger className="h-7 w-60 text-[11px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="plan" className="text-[11px]">Celle du plan Kadri</SelectItem>
            <SelectItem value="1" className="text-[11px]">Classe 1 imposée</SelectItem>
            <SelectItem value="2" className="text-[11px]">Classe 2 imposée</SelectItem>
            <SelectItem value="3" className="text-[11px]">Classe 3 imposée</SelectItem>
          </SelectContent>
        </Select>
        {classe && (
          <span className="text-warning">remplace la classe écrite sur le plan, pour tout le carnet</span>
        )}
      </div>

      {lignes.some(l => l.tasman) && (
        <div className="flex items-center gap-2">
          <span className="font-medium">Taux PAL Tasman</span>
          <Input
            type="number" min={0} step="0.01"
            value={tauxPal ?? ''}
            placeholder={`référence ${TAUX_PAL_REFERENCE[2]} € en C2, sinon contrat`}
            onChange={e => {
              const v = Number(e.target.value.replace(',', '.'));
              onTauxPal(e.target.value.trim() && v > 0 ? v : null);
            }}
            className="h-7 w-60 text-[11px]"
          />
          <span className="text-muted-foreground">€/m² fabriqué — le prix Odoo du modèle IS D3 n'est pas le bon</span>
        </div>
      )}

      {matsExistants.length > 0 && (
        <div className="space-y-1">
          <p className="font-medium">
            Mât existant conservé
            <span className="ml-2 font-normal text-muted-foreground">
              pas de mât au devis, colliers sur le support en place — cocher pour ajouter un mât neuf
              (mono de son type, moment Kadri vérifié)
            </span>
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {matsExistants.map(e => (
              <label key={`${e.page}-${e.ensemble}`} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={matsNeufs.includes(e.ensemble)}
                  onChange={() => basculerMat(e.ensemble)}
                  className="h-3 w-3"
                />
                <span>{e.ensemble}</span>
                <span className="text-muted-foreground">
                  ({e.supports.map(s => s.designation).join(' + ')})
                </span>
              </label>
            ))}
          </div>
        </div>
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
            Lapérouse P50 (dos ouvert) par défaut. Vasco de Gama pour un dos fermé ; Urville pour
            un caisson traversant — absent de la grille, il se choisit parmi les articles Odoo
            proposés. Au-delà de 2500 × 1200, le panneau passe en Tasman PAL : variante Odoo
            IS D3 aux dimensions supérieures du modèle, chiffrée au m² fabriqué. Ni pose ni
            dépose ne sont chiffrées.
          </p>
        </div>
      )}

      <div className="max-h-72 overflow-auto rounded border border-border bg-background">
        <table className="w-full table-fixed text-[11px]">
          <thead className="sticky top-0 bg-muted text-muted-foreground">
            <tr>
              <th className="w-16 px-1.5 py-1 text-right font-medium">Qté</th>
              <th className="w-48 px-1.5 py-1 text-left font-medium">Référence</th>
              <th className="px-1.5 py-1 text-left font-medium">Désignation</th>
              <th className="w-20 px-1.5 py-1 text-right font-medium">PU HT</th>
              <th className="w-20 px-1.5 py-1 text-right font-medium">Total HT</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => {
              const p = prixLigne(i);
              const e = l.ensemble;
              const ouvre = e && lignes[i - 1]?.ensemble?.nom !== e.nom;
              return (
                <Fragment key={i}>
                {ouvre && (
                  <tr className="border-t border-border bg-muted/50">
                    <td colSpan={4} className="px-1.5 py-1 font-medium">
                      {titreEnsemble(e)}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {e.section ? `${e.section} · ` : ''}plan p. {e.page}
                      </span>
                    </td>
                    <td className="px-1.5 py-1 text-right font-medium whitespace-nowrap">
                      {formatMontant(totalEnsemble(e.nom))}
                    </td>
                  </tr>
                )}
                <tr className="border-t border-border align-top">
                  <td className="px-1.5 py-1 text-right whitespace-nowrap">
                    {l.quantite}
                  </td>
                  <td className="px-1.5 py-1 font-mono break-all">
                    {l.reference || (
                      <button
                        type="button"
                        onClick={() => onVoirLigne(i)}
                        className="text-warning underline decoration-dotted hover:decoration-solid"
                        title="Descendre à la ligne de la demande pour la corriger"
                      >
                        à vérifier
                      </button>
                    )}
                  </td>
                  <td className="px-1.5 py-1 break-words">
                    <div>{l.description}</div>
                    {l.aVerifier && <div className="text-warning">{l.aVerifier}</div>}
                    {!e && (
                      <div className="text-muted-foreground truncate" title={l.ensembles.join(', ')}>
                        {l.ensembles.length} ensemble(s) : {l.ensembles.join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="px-1.5 py-1 text-right whitespace-nowrap">
                    {p ? formatMontant(p.prix) : '—'}
                    {p && <div className="text-muted-foreground">{p.source}</div>}
                  </td>
                  <td className="px-1.5 py-1 text-right whitespace-nowrap">
                    {p ? formatMontant(p.prix * l.quantite) : '—'}
                  </td>
                </tr>
                </Fragment>
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
