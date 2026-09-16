import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FolderSearch, Loader2, FileText, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { Produit } from '@/lib/store';
import { designationProduit } from '@/lib/store';
import type { Systeme } from '@/lib/systemes';
import { rapprocherArticle } from '@/lib/rapprochementArticle';
import {
  DOSSIER_FICHES_SYSTEME, dossierFiches, dossierFichesDisponible, chercherFiches,
  lireFiche, enregistrerSysteme, articlePourComposant,
  type FicheTrouvee, type SystemeExtrait,
} from '@/lib/fichesSysteme';

/**
 * Encart d'une ligne qui nomme un système absent de la base.
 *
 * La base vient d'être relue (un collègue a pu l'ajouter) ; il reste à
 * chercher la fiche dans le dossier des fiches système, à la faire lire, à
 * relire ce qui en sort, et à l'enregistrer. Une fois en base, le système est
 * reconnu et la ligne se chiffre par ses composants.
 *
 * La recherche part seule quand le navigateur a déjà le droit de lire le
 * dossier ; sinon elle attend un clic — Chrome n'accorde ce droit qu'à un
 * geste de l'utilisateur.
 */
export default function SystemeIntrouvable({
  texte, systemes, produits, onImporte,
}: {
  texte: string;
  systemes: Systeme[];
  produits: Produit[];
  /** Le système est en base : relire la table. */
  onImporte: () => Promise<void> | void;
}) {
  const [recherche, setRecherche] = useState<'attente' | 'encours' | 'faite'>('attente');
  const [fiches, setFiches] = useState<FicheTrouvee[]>([]);
  const [lecture, setLecture] = useState<string | null>(null);
  const [extrait, setExtrait] = useState<{ fiche: FicheTrouvee; systeme: SystemeExtrait } | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);

  const chercher = useCallback(async (interactif: boolean, changer = false) => {
    try {
      const dossier = await dossierFiches(interactif, changer);
      if (!dossier) return;
      setRecherche('encours');
      setFiches(await chercherFiches(dossier, texte, systemes));
      setRecherche('faite');
    } catch (e) {
      setRecherche('attente');
      /* Fermer le sélecteur de dossier n'est pas une erreur. */
      if ((e as DOMException)?.name !== 'AbortError') {
        toast.error(`Dossier des fiches illisible : ${(e as Error).message}`);
      }
    }
  }, [texte, systemes]);

  useEffect(() => { void chercher(false); }, [chercher]);

  const lire = async (fiche: FicheTrouvee) => {
    setLecture(fiche.chemin);
    try {
      const systeme = await lireFiche(fiche);
      /* Un article n'est rattaché que s'il est sûr : un homonyme chiffré
         avec assurance coûte plus cher qu'une ligne libre à compléter. */
      systeme.composants = systeme.composants.map(c => ({
        ...c,
        produitId: articlePourComposant(c.libelle, produits, rapprocherArticle)?.id,
      }));
      setExtrait({ fiche, systeme });
    } catch (e) {
      toast.error(`Lecture de la fiche impossible : ${(e as Error).message}`);
    } finally {
      setLecture(null);
    }
  };

  const enregistrer = async () => {
    if (!extrait) return;
    setEnregistrement(true);
    try {
      await enregistrerSysteme(extrait.systeme, extrait.fiche);
      toast.success(`Système « ${extrait.systeme.nom} » ajouté depuis ${extrait.fiche.nom}`);
      setExtrait(null);
      await onImporte();
    } catch (e) {
      toast.error(`Enregistrement impossible : ${(e as Error).message}`);
    } finally {
      setEnregistrement(false);
    }
  };

  const modifierComposant = (k: number, champ: 'consommation' | 'conditionnementKg', v: string) => {
    setExtrait(pr => {
      if (!pr) return pr;
      const n = parseFloat(v.replace(',', '.'));
      const composants = pr.systeme.composants.map((c, i) =>
        i === k ? { ...c, [champ]: Number.isFinite(n) && n > 0 ? n : undefined } : c);
      return { ...pr, systeme: { ...pr.systeme, composants } };
    });
  };

  if (!dossierFichesDisponible()) {
    return (
      <p className="text-[11px] text-warning">
        Système absent de la base. La recherche dans le dossier des fiches demande Chrome ou Edge sur PC.
      </p>
    );
  }

  return (
    <div className="rounded border border-warning/40 bg-warning/5 p-1.5 space-y-1.5 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-warning">Système absent de la base.</span>
        <Button
          type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]"
          disabled={recherche === 'encours'}
          onClick={() => void chercher(true)}
          title={`Dossier attendu : ${DOSSIER_FICHES_SYSTEME}`}
        >
          {recherche === 'encours'
            ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            : <FolderSearch className="w-3 h-3 mr-1" />}
          Chercher dans les fiches système
        </Button>
        <button
          type="button" className="text-muted-foreground underline"
          onClick={() => void chercher(true, true)}
        >
          changer de dossier
        </button>
      </div>

      {recherche === 'faite' && !fiches.length && (
        <p className="text-muted-foreground">
          Aucune fiche du dossier ne répond à cette ligne. Corrigez le libellé (nom exact du système) ou ajoutez la fiche au dossier, puis relancez.
        </p>
      )}

      {!extrait && fiches.map(f => (
        <div key={f.chemin} className="flex items-center gap-2">
          <FileText className="w-3 h-3 shrink-0 text-muted-foreground" />
          <span className="flex-1 min-w-0 truncate" title={f.chemin}>{f.chemin}</span>
          {f.dejaEnBase && <span className="text-muted-foreground">déjà en base</span>}
          <Button
            type="button" size="sm" className="h-6 px-2 text-[11px]"
            disabled={!!lecture}
            onClick={() => void lire(f)}
          >
            {lecture === f.chemin && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            Lire la fiche
          </Button>
        </div>
      ))}

      {/* RELECTURE AVANT ENREGISTREMENT. Les dosages sortent d'une lecture
          automatique : ils se vérifient contre la fiche avant d'engager tous
          les devis à venir. */}
      {extrait && (
        <div className="space-y-1 rounded border bg-background p-1.5">
          <div className="font-medium">
            {extrait.systeme.nom}
            {extrait.systeme.variante ? ` — ${extrait.systeme.variante}` : ''}
            <span className="ml-2 font-normal text-muted-foreground">
              {extrait.fiche.nom}
              {extrait.systeme.surfaceKitM2
                ? ` · petits mélanges de ${extrait.systeme.surfaceKitM2} m² (jusqu'à ${extrait.systeme.kitSurfaceMaxM2} m², toujours pour une bande)`
                : ''}
            </span>
          </div>
          {extrait.systeme.composants.map((c, k) => {
            const p = c.produitId ? produits.find(x => x.id === c.produitId) : undefined;
            return (
              <div key={k} className="flex items-center gap-1.5" title={c.phraseSource}>
                <span className="flex-1 min-w-0 truncate">
                  <span className="text-muted-foreground">{c.role} · </span>
                  {c.libelle}
                  {!c.obligatoire && <span className="text-muted-foreground"> (option)</span>}
                </span>
                <Input
                  className="h-6 w-16 text-[11px]" defaultValue={c.consommation ?? ''}
                  placeholder="?" onBlur={e => modifierComposant(k, 'consommation', e.target.value)}
                />
                <span className="w-12 shrink-0 text-muted-foreground">kg/m²</span>
                {c.auKit && (
                  <>
                    <Input
                      className="h-6 w-16 text-[11px]" defaultValue={c.conditionnementKg ?? ''}
                      placeholder="?" onBlur={e => modifierComposant(k, 'conditionnementKg', e.target.value)}
                    />
                    <span className="w-14 shrink-0 text-muted-foreground">kg / kit</span>
                  </>
                )}
                <span className={`w-48 shrink-0 truncate text-right ${p ? '' : 'text-warning'}`}>
                  {p ? `${p.reference} · ${designationProduit(p)}` : 'sans article — ligne libre'}
                </span>
              </div>
            );
          })}
          {extrait.systeme.composants.some(c => c.consommation == null
            && c.ratioBase == null && c.pourcentage == null) && (
            <p className="text-warning">
              Un composant sans dosage partira à zéro : la fiche ne le donne pas.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px]"
              onClick={() => setExtrait(null)}>
              Annuler
            </Button>
            <Button type="button" size="sm" className="h-6 px-2 text-[11px]"
              disabled={enregistrement} onClick={() => void enregistrer()}>
              {enregistrement
                ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                : <Check className="w-3 h-3 mr-1" />}
              Enregistrer le système
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
